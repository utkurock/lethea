// Lethea for X: the extension's network side. The content script reads posts and draws buttons; every
// request to NEAR Intents and GoPlus goes through here, where host permissions apply and results are cached.

// Where the Swap buttons open. Point it at http://localhost:5173 while working on the site.
const LETHEA_URL = 'https://lethea.xyz';

// Chains Lethea's swap box routes to, copied from src/intents/chains.ts. When NEAR Intents lists a symbol
// on several of them, the native asset wins, then this order.
const CHAINS = ['eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax', 'sol', 'near', 'stellar', 'btc', 'zec', 'xrp', 'doge'];

// Cashtags people write for an asset NEAR Intents lists under another symbol.
const ALIASES = { NEAR: 'WNEAR' };

// GoPlus chain ids for the EVM chains an address in a post is looked up on, most likely first.
const GOPLUS_EVM = [
  ['eth', '1'],
  ['base', '8453'],
  ['bsc', '56'],
  ['arb', '42161'],
];

// Brands scam links imitate, with the domains that really are theirs.
const BRANDS = {
  uniswap: ['uniswap.org'],
  metamask: ['metamask.io'],
  phantom: ['phantom.app', 'phantom.com'],
  opensea: ['opensea.io'],
  coinbase: ['coinbase.com', 'base.org'],
  binance: ['binance.com'],
  jupiter: ['jup.ag'],
  aave: ['aave.com'],
  lido: ['lido.fi'],
  ledger: ['ledger.com'],
  trezor: ['trezor.io'],
  arbitrum: ['arbitrum.io', 'arbitrum.foundation'],
  optimism: ['optimism.io'],
  solana: ['solana.com'],
  ethereum: ['ethereum.org'],
  layerzero: ['layerzero.network'],
  near: ['near.org', 'near.com', 'near.ai', 'near-intents.org', 'nearhackathon.com'],
  lethea: [new URL(LETHEA_URL).hostname],
};

// ---------------------------------------------------------------------------------------------------------
// NEAR Intents token list

let tokens = [];
let tokensAt = 0;
let tokensReq = null;

function loadTokens() {
  if (Date.now() - tokensAt < 60_000) return Promise.resolve(tokens);
  tokensReq ??= fetch('https://1click.chaindefuser.com/v0/tokens')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`tokens ${r.status}`))))
    .then((list) => {
      // Retired copies carry "(DEPRECATED)" in the symbol; some memecoins carry their own "$".
      tokens = list
        .filter((t) => CHAINS.includes(t.blockchain) && !/deprecated/i.test(t.symbol))
        .map((t) => ({ ...t, tag: t.symbol.replace(/^\$/, '').toUpperCase() }));
      tokensAt = Date.now();
      return tokens;
    })
    .catch(() => tokens)
    .finally(() => {
      tokensReq = null;
    });
  return tokensReq;
}

const rank = (t) => (t.contractAddress ? 100 : 0) + CHAINS.indexOf(t.blockchain);
const pick = ({ symbol, blockchain, price, contractAddress }) => ({ symbol, blockchain, price, contractAddress });
const sameAddress = (a, b) => (a.startsWith('0x') ? a.toLowerCase() === b.toLowerCase() : a === b);

/** The listing a cashtag buys: the native asset if there is one, else the first chain in CHAINS. */
function listingFor(tag) {
  const want = ALIASES[tag] ?? tag;
  const matches = tokens.filter((t) => t.tag === want).sort((a, b) => rank(a) - rank(b));
  return matches[0];
}

/**
 * What a post's cashtags and contract addresses resolve to. An address that NEAR Intents doesn't list,
 * in a post whose cashtag it does list, is someone passing off a different contract as that token.
 */
async function lookup({ cashtags, addresses }) {
  await loadTokens();
  const swaps = {};
  for (const tag of cashtags) {
    const t = listingFor(tag);
    if (t) swaps[tag] = pick(t);
  }
  // Only tokens have a contract to fake. A post about a native coin with an address in it is
  // usually about some other token, which the GoPlus scan covers.
  const impostorOf = cashtags.find((tag) => swaps[tag]?.contractAddress);
  const found = addresses.map((address) => {
    const t = tokens.find((x) => x.contractAddress && sameAddress(address, x.contractAddress));
    return t ? { address, listing: pick(t) } : { address, impostorOf };
  });
  return { swaps, addresses: found };
}

// ---------------------------------------------------------------------------------------------------------
// Live quotes for the hover card: what $100 from a few other chains buys of a token, straight from the
// NEAR Intents 1Click API. They are dry quotes, so nothing is deposited, and both ends are a placeholder
// NEAR Intents account, since the price doesn't depend on who pays or receives.

const QUOTE_USD = 100;
// Native coins on chains a browser wallet can't pay from, plus Solana and USDC, to show "any chain".
const QUOTE_FROM = [
  { symbol: 'BTC', blockchain: 'btc' },
  { symbol: 'ZEC', blockchain: 'zec' },
  { symbol: 'SOL', blockchain: 'sol' },
  { symbol: 'USDC', blockchain: 'eth' },
];
const PLACEHOLDER = 'root.near';
const quoteCache = new Map();

/** `usd` dollars of `t` in its smallest unit, as the integer string 1Click expects. */
function units(t, usd) {
  const whole = usd / t.price;
  const shift = Math.min(t.decimals, 6);
  return (BigInt(Math.round(whole * 10 ** shift)) * 10n ** BigInt(t.decimals - shift)).toString();
}

async function quoteOne(from, to) {
  const deadline = new Date(Date.now() + 10 * 60_000).toISOString();
  const r = await fetch('https://1click.chaindefuser.com/v0/quote', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      dry: true,
      swapType: 'EXACT_INPUT',
      slippageTolerance: 100,
      originAsset: from.assetId,
      depositType: 'ORIGIN_CHAIN',
      destinationAsset: to.assetId,
      amount: units(from, QUOTE_USD),
      refundTo: PLACEHOLDER,
      refundType: 'INTENTS',
      recipient: PLACEHOLDER,
      recipientType: 'INTENTS',
      deadline,
    }),
  });
  const body = await r.json();
  if (!r.ok || !body.quote) throw new Error(body.message || `quote ${r.status}`);
  return {
    from: from.symbol,
    amountIn: Number(body.quote.amountInFormatted),
    amountOut: Number(body.quote.amountOutFormatted),
    seconds: body.quote.timeEstimate,
  };
}

/** Up to three quotes into the token, from sources other than the token itself. Failed ones are left out. */
async function quotes({ chain, symbol }) {
  await loadTokens();
  const to = tokens.find((t) => t.blockchain === chain && t.symbol === symbol);
  if (!to) return [];
  const key = to.assetId;
  const hit = quoteCache.get(key);
  if (hit && Date.now() - hit.at < 30_000) return hit.data;
  const sources = QUOTE_FROM.map((f) => tokens.find((t) => t.blockchain === f.blockchain && t.symbol === f.symbol))
    .filter((t) => t?.price && t.assetId !== to.assetId)
    .slice(0, 3);
  const settled = await Promise.allSettled(sources.map((f) => quoteOne(f, to)));
  const data = settled.filter((s) => s.status === 'fulfilled').map((s) => s.value);
  if (data.length) quoteCache.set(key, { at: Date.now(), data });
  return data;
}

// ---------------------------------------------------------------------------------------------------------
// GoPlus checks. Its free tier is rate limited, so requests go one at a time and results are kept.

const cache = new Map();
let queue = Promise.resolve();

function goplus(path) {
  const run = queue.then(async () => {
    const r = await fetch(`https://api.gopluslabs.io/api/v1/${path}`);
    const body = await r.json();
    if (body.code !== 1) throw new Error(body.message || `GoPlus ${r.status}`);
    return body.result;
  });
  queue = run.catch(() => {}).then(() => new Promise((ok) => setTimeout(ok, 250)));
  return run;
}

function remember(key, make) {
  if (!cache.has(key)) {
    const p = make().catch((err) => {
      cache.delete(key); // try again on the next post that shows it
      throw err;
    });
    cache.set(key, p);
  }
  return cache.get(key);
}

const on = (v) => v === '1' || v === 1;
const pct = (v) => Math.round(Number(v) * 100);

function evmVerdict(chain, d) {
  const danger = [];
  const caution = [];
  if (on(d.is_honeypot)) danger.push('Honeypot: buyers cannot sell');
  if (on(d.cannot_sell_all)) danger.push('Holders cannot sell all of it');
  if (on(d.cannot_buy)) danger.push('Cannot be bought');
  if (Number(d.sell_tax) >= 0.1) danger.push(`${pct(d.sell_tax)}% sell tax`);
  if (Number(d.buy_tax) >= 0.1) danger.push(`${pct(d.buy_tax)}% buy tax`);
  if (on(d.hidden_owner)) danger.push('Hidden owner');
  if (on(d.owner_change_balance)) danger.push('Owner can change balances');
  if (on(d.can_take_back_ownership)) danger.push('Ownership can be taken back');
  if (on(d.selfdestruct)) danger.push('Contract can self-destruct');
  if (on(d.honeypot_with_same_creator)) danger.push('Creator has deployed honeypots');
  if (on(d.is_mintable)) caution.push('Supply can be minted');
  if (d.is_open_source === '0') caution.push('Source code not verified');
  if (on(d.is_proxy)) caution.push('Upgradeable contract');
  if (on(d.slippage_modifiable)) caution.push('Taxes can be changed');
  if (on(d.transfer_pausable)) caution.push('Transfers can be paused');
  if (on(d.is_blacklisted)) caution.push('Has a blacklist');
  if (d.holder_count && Number(d.holder_count) < 100) caution.push(`${d.holder_count} holders`);
  return verdict(chain, d.token_symbol, danger, caution);
}

function solVerdict(d) {
  const danger = [];
  const caution = [];
  if (on(d.freezable?.status)) danger.push('Accounts can be frozen');
  if (on(d.balance_mutable_authority?.status)) danger.push('Balances can be changed');
  if (on(d.closable?.status)) danger.push('Accounts can be closed');
  if (on(d.non_transferable)) danger.push('Cannot be transferred');
  if (on(d.mintable?.status)) caution.push('Supply can be minted');
  if (d.transfer_hook?.length) caution.push('Runs a hook on every transfer');
  if (on(d.metadata_mutable?.status)) caution.push('Name and logo can change');
  if (d.holder_count && Number(d.holder_count) < 100) caution.push(`${d.holder_count} holders`);
  return verdict('sol', d.metadata?.symbol, danger, caution);
}

const verdict = (chain, symbol, danger, caution) => ({
  chain,
  symbol: symbol || undefined,
  risk: danger.length ? 'danger' : caution.length ? 'caution' : 'ok',
  flags: [...danger, ...caution],
});

/** GoPlus token security for an address from a post. `risk: 'unknown'` when GoPlus has no record of it. */
function scanToken(address) {
  return remember(`token:${address}`, async () => {
    if (!address.startsWith('0x')) {
      const res = await goplus(`solana/token_security?contract_addresses=${address}`);
      const d = res?.[address];
      return d ? solVerdict(d) : { risk: 'unknown' };
    }
    for (const [chain, id] of GOPLUS_EVM) {
      const res = await goplus(`token_security/${id}?contract_addresses=${address}`);
      const d = res?.[address.toLowerCase()];
      if (d && Object.keys(d).length) return evmVerdict(chain, d);
    }
    return { risk: 'unknown' };
  });
}

const BAIT = /\b(airdrops?|claim|eligib\w*|whitelist|allocation|presale|giveaway|free mint|reward|connect (your )?wallet|drop is live)\b/i;

/**
 * Links in a post. A domain that names a brand without being one of its domains is an imitation;
 * GoPlus's phishing list catches the known ones; and an airdrop or claim post that links off to an
 * unknown site is the usual wallet-drainer lure, so it gets a softer warning.
 */
async function scanSites({ hosts, text }) {
  const bait = BAIT.test(text);
  const out = [];
  for (const host of hosts) {
    const official = Object.values(BRANDS).some((ds) => ds.some((d) => host === d || host.endsWith(`.${d}`)));
    if (official) continue;
    const labels = host.split(/[.-]/);
    const brand = Object.keys(BRANDS).find((b) => labels.includes(b));
    if (brand) {
      out.push({ host, risk: 'danger', note: `${host} is not a ${brand[0].toUpperCase() + brand.slice(1)} domain`, warn: `brand:${host}:${brand}` });
      continue;
    }
    if (host.split('.').some((l) => l.startsWith('xn--'))) {
      out.push({ host, risk: 'danger', note: `${host} uses look-alike characters`, warn: `lookalike:${host}` });
      continue;
    }
    const listed = await remember(`site:${host}`, () =>
      goplus(`phishing_site?url=${encodeURIComponent(host)}`).then((r) => on(r?.phishing_site)),
    ).catch(() => false);
    if (listed) out.push({ host, risk: 'danger', note: `${host} is a reported phishing site`, warn: `phishing:${host}` });
    else if (bait) out.push({ host, risk: 'caution', note: `Claim post linking to ${host}. Check it before you connect a wallet` });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------
// The Lethea window. One popup, reused for each Swap or Pay click.

let popup;

async function openPopup(url) {
  if (popup !== undefined) {
    try {
      const [tab] = await chrome.tabs.query({ windowId: popup });
      await chrome.tabs.update(tab.id, { url: url.href });
      await chrome.windows.update(popup, { focused: true });
      return;
    } catch {
      popup = undefined; // closed by the user
    }
  }
  const win = await chrome.windows.create({ url: url.href, type: 'popup', width: 460, height: 780 });
  popup = win.id;
}

function openBuy({ chain, symbol, post, creator, warn = [] }) {
  const url = new URL(`/buy/${encodeURIComponent(chain)}/${encodeURIComponent(symbol)}`, LETHEA_URL);
  if (post) url.searchParams.set('post', post);
  if (creator) url.searchParams.set('creator', creator);
  for (const w of warn.slice(0, 3)) url.searchParams.append('warn', w.slice(0, 160));
  return openPopup(url);
}

/** Pays the wallet a profile lists. The pay page checks the address again before showing the swap box. */
function openPay({ handle, to }) {
  const url = new URL(`/pay/${encodeURIComponent(handle)}`, LETHEA_URL);
  url.searchParams.set('to', to);
  return openPopup(url);
}

const HANDLERS = { lookup, quotes, scanToken: ({ address }) => scanToken(address), scanSites, openBuy, openPay };

chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
  const handler = HANDLERS[msg?.type];
  if (!handler) return false;
  Promise.resolve(handler(msg))
    .then((data) => reply({ ok: true, data }))
    .catch((err) => reply({ ok: false, error: String(err?.message ?? err) }));
  return true; // reply comes later
});

chrome.action.onClicked.addListener(() => chrome.tabs.create({ url: chrome.runtime.getURL('demo.html') }));
