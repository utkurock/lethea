// Lethea for X: reads posts as they render and adds a Swap button next to every cashtag NEAR Intents lists,
// plus a line of checks under posts that carry a contract address or a suspicious link. Network work is
// in background.js; this file only reads and writes the page.
(() => {
  const EVM = /\b0x[a-fA-F0-9]{40}\b/g;
  // Solana mints are 32 to 44 base58 characters; requiring a digit keeps long words out.
  const SOL = /\b(?=[1-9A-HJ-NP-Za-km-z]*\d)[1-9A-HJ-NP-Za-km-z]{32,44}\b/g;
  const CASHTAG = /^\$([A-Za-z][A-Za-z0-9]{0,11})$/;
  const X_HOSTS = /(^|\.)(x\.com|twitter\.com|t\.co)$/;
  // Post text. X's older build marks it with data-testid; the current one (late 2026) has no test ids, and
  // a post's text, a quoted post's text and a link card's text are each a div[dir=auto] inside the article.
  const TEXT = '[data-testid="tweetText"], article div[dir="auto"]';

  // Wallets people put in their X name, bio or website, in the order the Pay buttons list them.
  const WALLETS = [
    /\b(?:[a-z\d]+[-_])*[a-z\d]+(?:\.(?:[a-z\d]+[-_])*[a-z\d]+)*\.near\b/gi,
    /\b[a-z\d-]+(?:\.[a-z\d-]+)*\.eth\b/gi,
    EVM,
    /\bG[A-Z2-7]{55}\b/g,
    /\bbc1[ac-hj-np-z02-9]{25,59}\b/g,
    SOL,
  ];
  // First path segments that are X's own pages, not profiles.
  const NOT_PROFILES = new Set(['home', 'explore', 'search', 'notifications', 'messages', 'i', 'settings', 'compose', 'jobs', 'communities', 'premium', 'lists', 'bookmarks', 'tos', 'privacy', 'login', 'signup', 'logout']);

  const GHOST =
    '<svg viewBox="0 0 52 60" aria-hidden="true"><path fill="currentColor" d="M4.16 23.84a21.84 21.84 0 0 1 43.68 0V54q-7.28 8-14.56 0-7.28 8-14.56 0-7.28 8-14.56 0Z"/><ellipse cx="17.7" cy="25.84" rx="4.2" ry="5.4" fill="var(--lethea-eye)"/><ellipse cx="34.3" cy="25.84" rx="4.2" ry="5.4" fill="var(--lethea-eye)"/></svg>';

  /** Messages to background.js. Resolves to null once the extension has been reloaded under the page. */
  function send(msg) {
    try {
      return chrome.runtime.sendMessage(msg).then((r) => (r?.ok ? r.data : null), () => null);
    } catch {
      return Promise.resolve(null);
    }
  }

  const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
  const price = (p) =>
    p >= 1
      ? `$${p.toLocaleString('en-US', { maximumFractionDigits: 2 })}`
      : `$${p.toLocaleString('en-US', { maximumSignificantDigits: 4 })}`;

  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  }

  // Clicks inside a post open it on X; ours must not.
  function guard(node) {
    for (const type of ['click', 'mousedown', 'mouseup', 'pointerdown']) node.addEventListener(type, (e) => e.stopPropagation());
    return node;
  }

  function swapButton(listing, post, label) {
    const btn = guard(el('button', 'lethea-swap'));
    btn.type = 'button';
    btn.innerHTML = GHOST;
    btn.append(label);
    const where = listing.contractAddress ? `${listing.blockchain} ${short(listing.contractAddress)}` : `native on ${listing.blockchain}`;
    btn.title = `Buy ${listing.symbol} (${where})${listing.price ? ` at ${price(listing.price)}` : ''} from any chain through NEAR Intents`;
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      void send({ type: 'openBuy', chain: listing.blockchain, symbol: listing.symbol, post });
    });
    return btn;
  }

  function chip(risk, text, title) {
    const c = el('span', `lethea-chip lethea-${risk}`, text);
    if (title) c.title = title;
    return c;
  }

  // The current build puts the full address in the title; the older one shows it, cut short, as the text.
  function hostOf(link) {
    const shown = (/^https?:\/\//.test(link.title) ? link.title : link.textContent).replace(/…$/, '').trim();
    try {
      return new URL(/^https?:\/\//.test(shown) ? shown : `https://${shown}`).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }

  async function read(textEl) {
    const article = textEl.closest('article');
    const ref = textEl.closest('[data-href*="/status/"]')?.getAttribute('data-href') ?? article?.querySelector('a[href*="/status/"]')?.getAttribute('href');
    const post = ref ? new URL(ref, location.origin).href : undefined;
    const text = textEl.innerText;

    const tagLinks = [...textEl.querySelectorAll('a')].filter((a) => CASHTAG.test(a.textContent.trim()));
    const cashtags = [...new Set(tagLinks.map((a) => a.textContent.trim().slice(1).toUpperCase()))];
    const addresses = [...new Set([...(text.match(EVM) ?? []), ...(text.match(SOL) ?? [])])];
    // Cashtags, mentions and hashtags link within X by relative paths; outside links go through t.co.
    const hosts = [...new Set([...textEl.querySelectorAll('a[href^="http"]')].map(hostOf).filter((h) => h && !X_HOSTS.test(h)))];
    if (!cashtags.length && !addresses.length && !hosts.length) return;

    const found = (cashtags.length || addresses.length) && (await send({ type: 'lookup', cashtags, addresses }));

    // A Swap button right after each cashtag NEAR Intents lists.
    for (const a of tagLinks) {
      const listing = found?.swaps[a.textContent.trim().slice(1).toUpperCase()];
      if (listing && !a.nextElementSibling?.classList.contains('lethea-swap')) a.after(swapButton(listing, post, 'Swap'));
    }

    // Checks go in a bar under the text, added once there is something to show.
    const bar = guard(el('div', 'lethea-bar'));
    bar.innerHTML = GHOST;
    const show = () => !bar.isConnected && textEl.after(bar);

    for (const { address, listing, impostorOf } of found?.addresses ?? []) {
      if (listing) {
        bar.append(chip('ok', `${short(address)} is ${listing.symbol} on NEAR Intents`, address), swapButton(listing, post, `Swap ${listing.symbol}`));
      } else if (impostorOf) {
        bar.append(chip('danger', `${short(address)} is not the $${impostorOf} NEAR Intents lists`, `${address}\nThe post names $${impostorOf} but gives a different contract. Swap buttons buy the listed one.`));
      } else {
        const pending = chip('wait', `Checking ${short(address)}…`, address);
        bar.append(pending);
        void send({ type: 'scanToken', address }).then((v) => {
          if (!v) return pending.replaceWith(chip('unknown', `${short(address)}: check failed`, address));
          const name = v.symbol ? `${v.symbol} (${short(address)})` : short(address);
          const text =
            v.risk === 'unknown'
              ? `${short(address)}: no security data`
              : v.risk === 'ok'
                ? `${name}: no red flags`
                : `${name}: ${v.flags.slice(0, 2).join(' · ')}${v.flags.length > 2 ? ` +${v.flags.length - 2}` : ''}`;
          pending.replaceWith(chip(v.risk, text, `${address}${v.chain ? ` on ${v.chain}` : ''}\n${v.flags?.join('\n') ?? ''}\nSource: GoPlus Security`));
        });
      }
      show();
    }

    if (hosts.length) {
      const sites = await send({ type: 'scanSites', hosts, text });
      for (const s of sites ?? []) {
        bar.append(chip(s.risk, s.note, s.host));
        show();
      }
    }
  }

  /** The wallets in a piece of profile text. Names are case-insensitive, so they are kept lowercase. */
  function walletsIn(text) {
    const found = [];
    for (const re of WALLETS) {
      for (const m of text.match(re) ?? []) {
        const w = /\.(near|eth)$/i.test(m) ? m.toLowerCase() : m;
        if (re === SOL && w.startsWith('bc1')) continue;
        if (!found.includes(w)) found.push(w);
      }
    }
    return found;
  }

  /**
   * On a profile page, a Pay button for each wallet the profile lists. X keeps the header mounted while you
   * move between profiles, so it is matched to the handle in the address bar every time.
   */
  function profileHandle() {
    // demo.html stands in for a profile page and names the handle on <html>.
    const demo = document.documentElement.dataset.letheaProfile;
    if (demo) return demo;
    const [, handle, sub] = location.pathname.split('/');
    return /^\w{1,15}$/.test(handle ?? '') && !NOT_PROFILES.has(handle.toLowerCase()) && sub !== 'status' ? handle : undefined;
  }

  function scanProfile() {
    const handle = profileHandle();
    if (!handle) return;
    // The old build's test ids, else the current build's header: the h1 outside any post. The header is the
    // smallest block around it that also holds the following count, which every profile shows.
    const nameEl =
      document.querySelector('[data-testid="UserName"]') ?? [...document.querySelectorAll('main h1')].find((h) => !h.closest('article'));
    let head = nameEl;
    while (head && !head.querySelector('a[href$="/following" i]')) head = head.parentElement;
    if (!head || !head.innerText.toLowerCase().includes(`@${handle.toLowerCase()}`)) return;

    const old = head.querySelector('.lethea-pay');
    if (old?.dataset.handle === handle) return;
    old?.remove();

    const bio =
      head.querySelector('[data-testid="UserDescription"]') ??
      [...head.querySelectorAll('div[dir="auto"]')].find((d) => !d.contains(nameEl) && !d.closest('h1, article'));
    const links = [...head.querySelectorAll('a[href^="http"]')].map((a) => (/^https?:\/\//.test(a.title) ? a.title : a.textContent));
    const wallets = walletsIn([nameEl.innerText, bio?.innerText ?? '', ...links].join('\n'));

    const bar = guard(el('div', 'lethea-bar lethea-pay'));
    bar.dataset.handle = handle;
    bar.innerHTML = GHOST;
    for (const to of wallets) {
      const btn = guard(el('button', 'lethea-swap'));
      btn.type = 'button';
      btn.innerHTML = GHOST;
      btn.append(`Pay ${/\.(near|eth)$/.test(to) ? to : short(to)}`);
      btn.title = `Pay @${handle} at ${to} with any token from any chain. Lethea checks the address before you send.`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        void send({ type: 'openPay', handle, to });
      });
      bar.append(btn);
    }
    if (!wallets.length) bar.append(chip('unknown', `No wallet in @${handle}'s profile`, 'Add a .near or .eth name, or an address, to your bio and people can pay you from any chain.'));
    (bio ?? nameEl).after(bar);
  }

  // X renders posts as you scroll and recycles their nodes; each text element is read once.
  const seen = new WeakSet();
  let queued = false;
  function scan() {
    queued = false;
    scanProfile();
    for (const textEl of document.querySelectorAll(TEXT)) {
      if (seen.has(textEl)) continue;
      seen.add(textEl);
      if (textEl.closest('a')) continue; // a link card's title and summary
      void read(textEl);
    }
  }
  new MutationObserver(() => {
    if (!queued) {
      queued = true;
      requestAnimationFrame(scan);
    }
  }).observe(document.body, { childList: true, subtree: true });
  scan();
})();
