import { useEffect, useState, type ReactNode } from 'react';
import { FLAGS } from '../features/flags';
import { linkTo } from '../lib/router';

type Layer = { layer: string; items: { name: string; href: string; role: string }[] };

const STACK: Layer[] = [
  {
    layer: 'Swaps',
    items: [
      { name: 'NEAR Intents 1Click', href: 'https://docs.near-intents.org', role: 'Quotes, deposit addresses, solver network and settlement on NEAR.' },
      { name: 'Intents Swap Widget', href: 'https://github.com/aurora-is-near/intents-swap-widget', role: 'The swap box, by Aurora, with its EVM, Stellar and Solana plugins.' },
      { name: 'Confidential Intents', href: 'https://www.near.org/blog/confidential-intents', role: 'Private NEAR shard behind the Confidential toggle.' },
    ],
  },
  {
    layer: 'Wallets',
    items: [
      { name: 'wagmi', href: 'https://wagmi.sh', role: 'EVM connections. Browser wallets are found through EIP-6963; no hosted service in between.' },
      { name: 'Stellar Wallets Kit', href: 'https://stellarwalletskit.dev', role: 'Signing for Freighter, xBull, Lobstr and the other Stellar wallets.' },
      { name: 'Solana Wallet Adapter', href: 'https://github.com/anza-xyz/wallet-adapter', role: 'Phantom, Solflare, Backpack and any Wallet Standard wallet.' },
      { name: 'NEAR Connect', href: 'https://github.com/hot-dao/near-connect', role: 'HOT, Meteor, Intear, MyNearWallet and more, each run in a sandboxed frame.' },
      { name: 'Alchemy', href: 'https://www.alchemy.com', role: 'EVM token balances shown in the swap box.' },
    ],
  },
  {
    layer: 'Private Send',
    items: [
      { name: 'Stellar Private Payments', href: 'https://github.com/NethermindEth/stellar-private-payments', role: 'Nethermind privacy pool: Soroban contracts plus a WASM prover that runs in your browser.' },
      { name: 'Soroban RPC (testnet)', href: 'https://developers.stellar.org/docs/data/apis/rpc', role: 'Submits pool transactions and reads recent pool events.' },
      { name: 'Nethermind bootnode', href: 'https://github.com/NethermindEth/stellar-private-payments', role: 'Backfills pool history older than the week the RPC keeps.' },
      { name: 'Horizon and Friendbot', href: 'https://developers.stellar.org/docs/data/apis/horizon', role: 'Testnet XLM balance and test funding.' },
    ],
  },
  {
    layer: 'Market data',
    items: [
      { name: 'NEAR Intents token list', href: 'https://docs.near-intents.org', role: 'Supported assets and live prices for the ticker and token pages.' },
      { name: 'Hyperliquid', href: 'https://hyperliquid.xyz', role: 'Price history and 24h volume from its perpetual markets.' },
      { name: 'Stellar Expert', href: 'https://stellar.expert', role: 'Explorer links for Private Send transactions.' },
    ],
  },
];

const SECTIONS = [
  { id: 'overview', title: 'Overview' },
  { id: 'networks', title: 'Mainnet and testnet' },
  { id: 'wallets', title: 'Connect a wallet' },
  { id: 'swap', title: 'Swap' },
  { id: 'chains', title: 'Chains and assets' },
  { id: 'stellar', title: 'Stellar notes' },
  { id: 'confidential', title: 'Confidential mode' },
  { id: 'private-send', title: 'Private Send' },
  { id: 'tokens', title: 'Token pages' },
  { id: 'stack', title: 'Infrastructure' },
  { id: 'troubleshooting', title: 'Troubleshooting' },
] as const;

type SectionId = (typeof SECTIONS)[number]['id'];

function Section({ id, children }: { id: SectionId; children: ReactNode }) {
  const title = SECTIONS.find((s) => s.id === id)!.title;
  return (
    <section id={id} className="doc-section">
      <h2>
        <a href={`#${id}`}>{title}</a>
      </h2>
      {children}
    </section>
  );
}

// Highlights the section nearest the top of the viewport.
function useActiveSection() {
  const [active, setActive] = useState<SectionId>('overview');
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id as SectionId);
      },
      { rootMargin: '0px 0px -70% 0px' },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  return active;
}

export function DocsPage() {
  const active = useActiveSection();

  return (
    <main className="docs-page">
      <nav className="docs-toc" aria-label="On this page">
        <span>Docs</span>
        {SECTIONS.map((s) => (
          <a key={s.id} href={`#${s.id}`} className={active === s.id ? 'on' : ''}>
            {s.title}
          </a>
        ))}
      </nav>

      <article className="docs-body">
        <header className="docs-head">
          <h1>Lethea docs</h1>
          <p>How swaps route, what stays private, and what each step shows on chain.</p>
        </header>

        <Section id="overview">
          <p>
            Lethea swaps between EVM chains and Stellar through NEAR Intents. You sign one deposit on the chain you
            pay from, and the payout lands on the chain you pick. Lethea never holds your funds: the deposit goes to
            NEAR Intents, and the payout comes from there.
          </p>
          <dl className="doc-facts">
            <div>
              <dt>Custody</dt>
              <dd>Non-custodial. Your wallet signs every transfer.</dd>
            </div>
            <div>
              <dt>Routing</dt>
              <dd>NEAR Intents 1Click, settled on NEAR</dd>
            </div>
            <div>
              <dt>Privacy</dt>
              <dd>Confidential mode on mainnet, Private Send on testnet</dd>
            </div>
          </dl>
        </Section>

        <Section id="networks">
          <p>
            Swaps move real funds. Private Send is a testnet preview. The header marks it with a <b>Testnet</b> tag.
          </p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Feature</th>
                <th>Network</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Swap</td>
                <td>Mainnet on every chain: EVM chains, Stellar, Solana, NEAR, Bitcoin, Zcash, XRP Ledger, Dogecoin</td>
              </tr>
              <tr>
                <td>Confidential mode</td>
                <td>Mainnet, on the NEAR Intents private shard</td>
              </tr>
              <tr>
                <td>Token pages and prices</td>
                <td>Mainnet data from NEAR Intents and Hyperliquid</td>
              </tr>
              <tr>
                <td>Private Send</td>
                <td>Stellar testnet only. Test XLM, no real value</td>
              </tr>
            </tbody>
          </table>
          <p className="doc-note">
            Keep your Stellar wallet on Mainnet for swaps and switch it to Testnet for Private Send.
          </p>
        </Section>

        <Section id="wallets">
          <p>
            <b>Connect Wallet</b> in the top right opens one picker with a tab per chain. Connect as many as you like.
          </p>
          <ul>
            <li>
              <b>EVM:</b> any browser wallet, such as MetaMask, Rabby or Phantom. Ethereum, Base, Arbitrum, Optimism,
              Polygon, BNB Chain and Avalanche.
            </li>
            <li>
              <b>Stellar:</b> Freighter, xBull, Lobstr and the other wallets in Stellar Wallets Kit. Swaps run on
              Stellar mainnet.
            </li>
            <li>
              <b>Solana:</b> Phantom, Solflare, Backpack and other Wallet Standard wallets.
            </li>
            <li>
              <b>NEAR:</b> HOT, Meteor, Intear, MyNearWallet and the other wallets in NEAR Connect.
            </li>
            <li>
              <b>Bitcoin, Zcash, XRP and Dogecoin:</b> no wallet to connect. The swap shows a one-time deposit
              address and a QR code; send from any wallet and give a refund address.
            </li>
          </ul>
          <p>
            The swap uses the wallet that matches the chain of the token you pay with. You only need a wallet on the
            source chain. On the receiving side an address is enough.
          </p>
        </Section>

        <Section id="swap">
          <ol className="doc-steps">
            <li>
              <b>Pick the pair.</b> Choose what you pay with and what you want to receive, on any supported chain.
            </li>
            <li>
              <b>Read the quote.</b> The widget shows the amount you will receive. Quotes refresh every 15 seconds,
              and slippage tolerance is 1%.
            </li>
            <li>
              <b>Sign the deposit.</b> Your wallet sends the input to a one-time NEAR Intents deposit address. If your
              EVM wallet is on the wrong network, it will ask to switch.
            </li>
            <li>
              <b>Receive.</b> Solvers compete to fill the intent, and the payout arrives on the target chain. Past
              swaps and their status are in the history view of the widget.
            </li>
          </ol>
          <p className="doc-note">
            If a swap cannot be filled, NEAR Intents refunds the deposit to the address it came from.
          </p>
        </Section>

        <Section id="chains">
          <p>Every chain works both ways. Targets only need a recipient address.</p>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Direction</th>
                <th>Chains</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Pay from</td>
                <td>
                  With a connected wallet: Stellar, Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche,
                  Solana, NEAR. By deposit address: Bitcoin, Zcash, XRP Ledger, Dogecoin
                </td>
              </tr>
              <tr>
                <td>Receive on</td>
                <td>All of the above</td>
              </tr>
            </tbody>
          </table>
          <p>Token lists and prices come live from NEAR Intents, so the assets on each chain follow what it lists.</p>
        </Section>

        <Section id="stellar">
          <ul>
            <li>
              From Stellar you can pay with <b>XLM</b> and <b>USDC</b> (Circle).
            </li>
            <li>
              To hold or send USDC on Stellar, the account needs a <b>trustline</b> to the Circle issuer. Add it in
              your wallet before you receive USDC there.
            </li>
            <li>The deposit needs a memo. Lethea adds it for you; do not edit it in your wallet.</li>
            <li>A new Stellar account needs a minimum XLM balance before it can receive anything.</li>
          </ul>
        </Section>

        <Section id="confidential">
          <p>
            The swap widget has a <b>Confidential</b> toggle. With it on, the intent executes on a private NEAR shard
            run by permissioned validators, so the explorer does not show the path in between.
          </p>
          <div className="doc-leak">
            <div>
              <span>Hidden</span>
              <p>Sender, amount and route inside NEAR Intents</p>
            </div>
            <div>
              <span>Still visible</span>
              <p>Your deposit on the source chain and the payout on the target chain</p>
            </div>
          </div>
          <p>
            Anyone watching both chains can still see a deposit go in and a payout come out. Confidential mode breaks
            the public link in the middle; it does not hide the ends.
          </p>
          <p className="doc-note">
            Trust model: a TEE (hardware enclave) bridge and a permissioned validator set. There is no published
            independent audit yet.
          </p>
        </Section>

        <Section id="private-send">
          <p>
            Private Send is a preview of Stellar Private Payments by Nethermind, a privacy pool for XLM. It runs on{' '}
            <b>Stellar testnet only</b> and is <b>unaudited</b>. Do not treat it as production software.
          </p>
          <ol className="doc-steps">
            <li>
              <b>Connect a Stellar wallet set to Testnet.</b> If the account does not exist yet, fund it with
              Friendbot from the page.
            </li>
            <li>
              <b>Open a private balance.</b> One signature derives your private keys and registers your public keys
              with the pool. The first sync reads the pool history and takes about a minute.
            </li>
            <li>
              <b>Deposit, send, withdraw.</b> Every action builds a zero-knowledge proof in your browser before it is
              submitted.
            </li>
          </ol>
          <table className="doc-table">
            <thead>
              <tr>
                <th>Action</th>
                <th>What is public</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Deposit</td>
                <td>Your address and the amount</td>
              </tr>
              <tr>
                <td>Send</td>
                <td>Neither the recipient nor the amount</td>
              </tr>
              <tr>
                <td>Withdraw</td>
                <td>The amount out, with no link to your deposit</td>
              </tr>
            </tbody>
          </table>
          <p>
            Your notes and keys are tied to the wallet address. Switching wallets starts a separate private balance.
          </p>
          {FLAGS.spp ? (
            <p>
              <a className="doc-link" href="/private" onClick={linkTo('/private')}>
                Open Private Send
              </a>
            </p>
          ) : (
            <p className="doc-note">Private Send is turned off on this build.</p>
          )}
        </Section>

        <Section id="tokens">
          <p>
            Click a token in the price strip to open its page: current price, chart, range high and low, and a buy
            box that targets that token.
          </p>
          <ul>
            <li>Prices come from NEAR Intents and refresh every minute.</li>
            <li>Charts and 24h volume come from Hyperliquid perpetual markets. Stablecoins have no chart.</li>
            <li>cbBTC charts follow BTC, since it is issued 1:1 against it.</li>
          </ul>
        </Section>

        <Section id="stack">
          <p>
            Lethea is a React app served as static files. It has no backend of its own and keeps no user data: every
            call below goes straight from your browser to the service.
          </p>
          <table className="doc-table doc-stack">
            <tbody>
              {STACK.map((l) =>
                l.items.map((it, i) => (
                  <tr key={it.name}>
                    <td>{i === 0 ? l.layer : ''}</td>
                    <td>
                      <a className="doc-link" href={it.href} target="_blank" rel="noreferrer">
                        {it.name}
                      </a>
                      <span>{it.role}</span>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </Section>

        <Section id="troubleshooting">
          <dl className="doc-faq">
            <div>
              <dt>My USDC transfer on Stellar fails.</dt>
              <dd>The receiving account has no USDC trustline. Add one in the wallet and try again.</dd>
            </div>
            <div>
              <dt>The quote changed before I signed.</dt>
              <dd>Quotes expire and refresh every 15 seconds. Sign the latest one.</dd>
            </div>
            <div>
              <dt>My EVM wallet says the chain is unknown.</dt>
              <dd>Add the network to your wallet, then retry the swap.</dd>
            </div>
            <div>
              <dt>Private Send says the pool has not admitted my keys.</dt>
              <dd>Registration takes a moment to reach the pool. Wait a minute and submit again.</dd>
            </div>
            <div>
              <dt>Private Send asks me to switch to Testnet.</dt>
              <dd>Your Stellar wallet is on mainnet. Change its network to Testnet, then reload.</dd>
            </div>
          </dl>
          <p>
            Protocol details are in the{' '}
            <a className="doc-link" href="https://docs.near-intents.org" target="_blank" rel="noreferrer">
              NEAR Intents docs
            </a>{' '}
            and the{' '}
            <a
              className="doc-link"
              href="https://github.com/NethermindEth/stellar-private-payments"
              target="_blank"
              rel="noreferrer"
            >
              Stellar Private Payments repo
            </a>
            .
          </p>
        </Section>
      </article>
    </main>
  );
}
