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

  // Line icons for the checks, drawn in the chip's own colour.
  const stroke = (d) =>
    `<svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  const ICONS = {
    ok: stroke('M3.5 8.5l3 3 6-7'),
    danger: stroke('M5 5l6 6m0-6l-6 6'),
    caution: stroke('M8 3.5v5.5M8 12.4v.1'),
    unknown: stroke('M6 6.2a2 2 0 1 1 2.6 1.9c-.4.2-.6.5-.6.9v.5M8 12.4v.1'),
    wait: '<span class="lethea-spin" aria-hidden="true"></span>',
  };
  const ARROW = stroke('M5 11l6-6M6 5h5v5');

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
    p >= 1000
      ? `$${p.toLocaleString('en-US', { maximumFractionDigits: 0 })}`
      : p >= 1
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

  function button(cls, label) {
    const btn = guard(el('button', `lethea-btn ${cls}`));
    btn.type = 'button';
    btn.innerHTML = GHOST;
    btn.append(el('span', 'lethea-label', label));
    return btn;
  }

  /**
   * `from` is the post the button sits in: its link, its author's .near account, which earns a share of
   * the swap, and `warnings`, the post's red flags at click time, which the buy page repeats. The price
   * shows on the button when it is short enough to fit; a memecoin's many zeros stay in the tooltip.
   */
  function swapButton(listing, label, from) {
    const btn = button('lethea-swap', label);
    if (listing.price >= 0.01) btn.append(el('span', 'lethea-price', price(listing.price)));
    const where = listing.contractAddress ? `${listing.blockchain} ${short(listing.contractAddress)}` : `native on ${listing.blockchain}`;
    btn.title =
      `Buy ${listing.symbol} (${where})${listing.price ? ` at ${price(listing.price)}` : ''} from any chain through NEAR Intents` +
      (from.creator ? `\n0.1% goes to ${from.creator}, who wrote this post` : '');
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      void send({ type: 'openBuy', chain: listing.blockchain, symbol: listing.symbol, post: from.post, creator: from.creator, warn: from.warnings() });
    });
    attachQuote(btn, listing);
    return btn;
  }

  const amount = (n) =>
    n >= 1e6
      ? n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 })
      : n.toLocaleString('en-US', { maximumSignificantDigits: 4 });
  const eta = (s) => (s < 90 ? `~${Math.max(1, Math.round(s))}s` : `~${Math.round(s / 60)} min`);

  // One hover card for the whole page, moved to whichever Swap button is hovered or focused.
  let card;
  let cardFor;
  function showQuote(btn, listing) {
    card ??= guard(el('div', 'lethea-quote'));
    cardFor = btn;
    card.replaceChildren(el('div', 'lethea-quote-head', `$100 from any chain buys`), el('div', 'lethea-quote-wait', 'Asking NEAR Intents…'));
    document.body.append(card);
    const r = btn.getBoundingClientRect();
    const below = r.bottom + 8 + 150 < innerHeight;
    card.style.left = `${Math.min(Math.max(8, r.left), innerWidth - 268)}px`;
    card.style.top = below ? `${r.bottom + 8}px` : '';
    card.style.bottom = below ? '' : `${innerHeight - r.top + 8}px`;
    void send({ type: 'quotes', chain: listing.blockchain, symbol: listing.symbol }).then((rows) => {
      if (cardFor !== btn || !card.isConnected) return;
      const list = el('div', 'lethea-quote-rows');
      for (const q of rows ?? []) {
        const line = el('div', 'lethea-quote-row');
        line.append(el('span', 'lethea-quote-from', `${amount(q.amountIn)} ${q.from}`), el('span', 'lethea-quote-out', `${amount(q.amountOut)} ${listing.symbol}`), el('span', 'lethea-quote-eta', eta(q.seconds)));
        list.append(line);
      }
      card.replaceChildren(
        el('div', 'lethea-quote-head', `$100 from any chain buys`),
        rows?.length ? list : el('div', 'lethea-quote-wait', 'No quotes right now'),
        el('div', 'lethea-quote-foot', 'Live NEAR Intents quotes, fees included'),
      );
    });
  }
  function hideQuote(btn) {
    if (cardFor !== btn) return;
    cardFor = undefined;
    card?.remove();
  }
  function attachQuote(btn, listing) {
    let timer;
    const open = () => {
      clearTimeout(timer);
      timer = setTimeout(() => showQuote(btn, listing), 250);
    };
    const close = () => {
      clearTimeout(timer);
      hideQuote(btn);
    };
    btn.addEventListener('mouseenter', open);
    btn.addEventListener('focus', open);
    btn.addEventListener('mouseleave', close);
    btn.addEventListener('blur', close);
    btn.addEventListener('click', close);
  }

  /**
   * The .near account in the name of the post's author. The author is the nearest name link above the
   * text, so a quoted post gets its own author; links inside the text are mentions, not the author.
   * A quoted post is a card inside the outer post (a role=link block in the older build, a status block
   * nested in another in the current one). Its author is looked for inside the card only, so a quote
   * whose author can't be read credits no one rather than the person quoting it.
   */
  function creatorOf(textEl) {
    const status = textEl.closest('[data-href*="/status/"]');
    const nested = status?.parentElement?.closest('[data-href*="/status/"]') ? status : null;
    const stop = textEl.closest('article [role="link"]') ?? nested ?? textEl.closest('article');
    for (let node = textEl.parentElement; node; node = node.parentElement) {
      const name =
        node.querySelector('[data-testid="User-Name"] a')?.innerText ??
        [...node.querySelectorAll('a[href]')].find(
          (a) => /^\/\w{1,15}$/.test(a.getAttribute('href')) && !textEl.contains(a) && a.innerText.trim() && !a.innerText.trim().startsWith('@'),
        )?.innerText;
      if (name) return walletsIn(name).find((w) => w.endsWith('.near'));
      if (node === stop) return undefined;
    }
    return undefined;
  }

  /** `warn` is a code the buy page turns back into its own wording; a link can't carry free text there. */
  function chip(risk, text, title, warn) {
    const c = el('span', `lethea-chip lethea-${risk}`);
    c.innerHTML = ICONS[risk] ?? '';
    c.append(el('span', null, text));
    if (title) c.title = title;
    if (warn && risk === 'danger') c.dataset.warn = warn;
    return c;
  }

  /** A row under a post or bio, led by the Lethea mark so it reads as ours and not X's. */
  function bar(cls) {
    const row = guard(el('div', `lethea-bar ${cls ?? ''}`.trim()));
    const mark = el('span', 'lethea-brand');
    mark.innerHTML = GHOST;
    mark.append('Lethea');
    row.append(mark);
    return row;
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

    // Checks go in a bar under the text, added once there is something to show.
    const row = bar();
    const show = () => !row.isConnected && textEl.after(row);
    const from = { post, creator: creatorOf(textEl), warnings: () => [...row.querySelectorAll('[data-warn]')].map((c) => c.dataset.warn) };

    // A Swap button right after each cashtag NEAR Intents lists.
    for (const a of tagLinks) {
      const listing = found?.swaps[a.textContent.trim().slice(1).toUpperCase()];
      if (listing && !a.nextElementSibling?.classList.contains('lethea-swap')) a.after(swapButton(listing, 'Swap', from));
    }

    for (const { address, listing, impostorOf } of found?.addresses ?? []) {
      if (listing) {
        row.append(chip('ok', `${short(address)} is ${listing.symbol} on NEAR Intents`, address), swapButton(listing, `Swap ${listing.symbol}`, from));
      } else if (impostorOf) {
        row.append(chip('danger', `${short(address)} is not the $${impostorOf} NEAR Intents lists`, `${address}\nThe post names $${impostorOf} but gives a different contract. Swap buttons buy the listed one.`, `impostor:${address}:${impostorOf}`));
      } else {
        const pending = chip('wait', `Checking ${short(address)}…`, address);
        row.append(pending);
        void send({ type: 'scanToken', address }).then((v) => {
          if (!v) return pending.replaceWith(chip('unknown', `${short(address)}: check failed`, address));
          const name = v.symbol ? `${v.symbol} (${short(address)})` : short(address);
          const text =
            v.risk === 'unknown'
              ? `${short(address)}: no security data`
              : v.risk === 'ok'
                ? `${name}: no red flags`
                : `${name}: ${v.flags.slice(0, 2).join(' · ')}${v.flags.length > 2 ? ` +${v.flags.length - 2}` : ''}`;
          pending.replaceWith(chip(v.risk, text, `${address}${v.chain ? ` on ${v.chain}` : ''}\n${v.flags?.join('\n') ?? ''}\nSource: GoPlus Security`, `token:${address}`));
        });
      }
      show();
    }

    if (hosts.length) {
      const sites = await send({ type: 'scanSites', hosts, text });
      for (const s of sites ?? []) {
        row.append(chip(s.risk, s.note, s.host, s.warn));
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
    if (!head) return;

    const bio =
      head.querySelector('[data-testid="UserDescription"]') ??
      [...head.querySelectorAll('div[dir="auto"]')].find((d) => !d.contains(nameEl) && !d.closest('h1, article'));
    // While X swaps one profile for the next, the header can still be the previous profile's. Only a header
    // that shows exactly this @handle, outside the bio (where anyone can write one), belongs to the address bar.
    const at = `@${handle.toLowerCase()}`;
    const shown = [...head.querySelectorAll('span, div')].some(
      (n) => !n.childElementCount && !bio?.contains(n) && n.textContent.trim().toLowerCase() === at,
    );
    if (!shown) return head.querySelector('.lethea-pay')?.remove();

    const links = [...head.querySelectorAll('a[href^="http"]')].map((a) => (/^https?:\/\//.test(a.title) ? a.title : a.textContent));
    const wallets = walletsIn([nameEl.innerText, bio?.innerText ?? '', ...links].join('\n'));

    // Rebuilt whenever the handle or the wallets change, so no button outlives the profile it was read from.
    const key = [handle, ...wallets].join('\n');
    const old = head.querySelector('.lethea-pay');
    if (old?.dataset.key === key) return;
    old?.remove();

    const row = bar('lethea-pay');
    row.dataset.key = key;
    for (const to of wallets) {
      const btn = button('lethea-paybtn', 'Pay');
      btn.append(el('span', 'lethea-to', /\.(near|eth)$/.test(to) ? to : short(to)));
      btn.insertAdjacentHTML('beforeend', ARROW);
      btn.title = `Pay @${handle} at ${to} with any token from any chain. Lethea checks the address before you send.`;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        void send({ type: 'openPay', handle, to });
      });
      row.append(btn);
    }
    if (!wallets.length) row.append(chip('unknown', `No wallet in @${handle}'s profile`, 'Add a .near or .eth name, or an address, to your bio and people can pay you from any chain.'));
    (bio ?? nameEl).after(row);
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
