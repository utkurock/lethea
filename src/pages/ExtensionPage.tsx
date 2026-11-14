import '../../extension/content.css';
import './extension.css';
import { useEffect, useState } from 'react';
import { linkTo } from '../lib/router';
import { fmtUsd, type IntentsToken, useIntentsTokens } from '../lib/tokens';

// The page for Lethea for X. Its post mock-ups use the extension's own stylesheet, so the buttons and flags
// here are the ones it draws on x.com, and the prices and quotes in them are live NEAR Intents figures.

const VERSION = '0.1.5';
const ZIP = `https://github.com/utkurock/lethea/releases/download/v${VERSION}/lethea-for-x-v${VERSION}.zip`;
const RELEASES = 'https://github.com/utkurock/lethea/releases';

const priceIn = (list: IntentsToken[], symbol: string, chain: string) =>
  list.find((t) => t.symbol === symbol && t.blockchain === chain)?.price;
const amount = (n: number) => n.toLocaleString('en-US', { maximumSignificantDigits: 4 });

/** The extension's ghost glyph, as it draws it inside buttons and rows. */
function Ghost({ eye = '#0c0c0e' }: { eye?: string }) {
  return (
    <svg viewBox="0 0 52 60" aria-hidden style={{ ['--lethea-eye' as string]: eye }}>
      <path fill="currentColor" d="M4.16 23.84a21.84 21.84 0 0 1 43.68 0V54q-7.28 8-14.56 0-7.28 8-14.56 0-7.28 8-14.56 0Z" />
      <ellipse cx="17.7" cy="25.84" rx="4.2" ry="5.4" fill="var(--lethea-eye)" />
      <ellipse cx="34.3" cy="25.84" rx="4.2" ry="5.4" fill="var(--lethea-eye)" />
    </svg>
  );
}

function SwapPill({ price, label = 'Swap', show = true }: { price?: number; label?: string; show?: boolean }) {
  return (
    <span className={`lethea-btn lethea-swap xp-pop ${show ? 'on' : ''}`} role="presentation">
      <Ghost eye="#dfe2e7" />
      <span className="lethea-label">{label}</span>
      {price ? <span className="lethea-price">${fmtUsd(price)}</span> : null}
    </span>
  );
}

function Chip({ risk, children, show = true }: { risk: 'ok' | 'caution' | 'danger'; children: string; show?: boolean }) {
  const icon = risk === 'ok' ? '✓' : risk === 'caution' ? '!' : '×';
  return (
    <span className={`lethea-chip lethea-${risk} xp-pop ${show ? 'on' : ''}`}>
      <b className="xp-chip-icon">{icon}</b>
      <span>{children}</span>
    </span>
  );
}

function Brand() {
  return (
    <span className="lethea-brand">
      <Ghost eye="transparent" />
      Lethea
    </span>
  );
}

function Who({ name, handle, time, badge }: { name: string; handle: string; time: string; badge?: 'blue' | 'gold' }) {
  return (
    <div className="xp-who">
      <b>{name}</b>
      {badge && (
        <svg className="xp-badge" viewBox="0 0 24 24" aria-hidden>
          <circle cx="12" cy="12" r="10" fill={badge === 'gold' ? '#e8b52e' : '#1d9bf0'} />
          <path d="m7.8 12.3 2.8 2.8 5.6-5.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
      <span>
        @{handle} · {time}
      </span>
    </div>
  );
}

/** Steps of the hero loop: pills appear, the pointer hovers, quotes show, then a scam post gets flagged. */
const STEPS = 6;
function useLoop(ms: number) {
  const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const [step, setStep] = useState(reduce ? 4 : 0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setStep((s) => (s + 1) % STEPS), ms);
    return () => clearInterval(id);
  }, [ms, reduce]);
  return step;
}

function HeroDemo({ list }: { list: IntentsToken[] }) {
  const step = useLoop(1500);
  const eth = priceIn(list, 'ETH', 'eth');
  const zec = priceIn(list, 'ZEC', 'zec');
  const quotes = [
    { from: 'BTC', price: priceIn(list, 'BTC', 'btc'), eta: '~13 min' },
    { from: 'ZEC', price: zec, eta: '~8 min' },
    { from: 'SOL', price: priceIn(list, 'SOL', 'sol'), eta: '~20s' },
  ];

  return (
    <div className="xp-stage" data-step={step} aria-label="Lethea for X on two posts">
      <div className="xp-window">
        <div className="xp-bar">
          <i />
          <i />
          <i />
          <span>x.com/home</span>
        </div>
        <article className="xp-post">
          <img className="xp-av" src="/mark-160.png" alt="" />
          <div>
            <Who name="Lethea Calls · lethea.near" handle="lethea_calls" time="2h" />
            <p className="xp-text">
              Weekly close above the range on <a>$ETH</a>
              <SwapPill price={eth} show={step >= 1} />. Rotating some <a>$ZEC</a>
              <SwapPill price={zec} show={step >= 1} /> into it.
            </p>
          </div>
        </article>
        <article className="xp-post">
          <div className="xp-av xp-av-uni">🦄</div>
          <div>
            <Who name="Uniswap Labs Support" handle="uniswap_supp0rt" time="5m" badge="gold" />
            <p className="xp-text">
              The UNI season 2 airdrop is live. Claim your allocation: <a>uniswap-rewards.xyz/claim</a>
            </p>
            <div className={`lethea-bar xp-row ${step >= 4 ? 'on' : ''}`}>
              <Brand />
              <Chip risk="danger" show={step >= 4}>
                uniswap-rewards.xyz is not a Uniswap domain
              </Chip>
            </div>
          </div>
        </article>
      </div>

      <div className={`lethea-quote xp-quote ${step === 3 || step === 2 ? 'on' : ''}`}>
        <div className="lethea-quote-head">$100 from any chain buys</div>
        <div className="lethea-quote-rows">
          {quotes.map((q) => (
            <div className="lethea-quote-row" key={q.from}>
              <span className="lethea-quote-from">{q.price ? `${amount(100 / q.price)} ${q.from}` : `… ${q.from}`}</span>
              <span className="lethea-quote-out">{eth ? `${amount((100 / eth) * 0.998)} ETH` : '… ETH'}</span>
              <span className="lethea-quote-eta">{q.eta}</span>
            </div>
          ))}
        </div>
        <div className="lethea-quote-foot">Live NEAR Intents prices</div>
      </div>

      <svg className={`xp-cursor ${step >= 2 && step <= 3 ? 'on' : ''}`} viewBox="0 0 17 25" aria-hidden>
        <path d="M1 1v19.6l4.9-4.6 3.3 7.6 3.3-1.5-3.3-7.4h6.8z" fill="#f5f5f6" stroke="#0c0c0e" strokeWidth="1.3" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function CopyLine({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="xp-copy"
      onClick={() => {
        void navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        });
      }}
    >
      <code>{text}</code>
      <span>{done ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

export function ExtensionPage() {
  const list = useIntentsTokens();
  const sol = priceIn(list, 'SOL', 'sol');
  const pepe = priceIn(list, 'PEPE', 'eth');

  return (
    <main className="xp">
      <section className="xp-hero">
        <div className="xp-copyhead">
          <span className="xp-eyebrow">
            Chrome extension · v{VERSION}
          </span>
          <h1>
            Lethea for X
            <span>See a coin on X. Buy it right there.</span>
          </h1>
          <p>
            A Swap button on every cashtag, scam checks under every post, and a Pay button on profiles. Swaps settle
            across chains through NEAR Intents, and Confidential mode keeps the route private.
          </p>
          <div className="xp-cta">
            <a className="xp-btn primary" href={ZIP}>
              Download for Chrome
            </a>
            <a className="xp-btn" href="#install">
              How to install
            </a>
          </div>
          <small className="xp-fine">Free and open source. Works in Chrome, Brave and Edge.</small>
        </div>
        <HeroDemo list={list} />
      </section>

      <section className="xp-features">
        <div className="xp-card">
          <span className="xp-k">Swap</span>
          <h2>Buy from the post</h2>
          <p>Cashtags NEAR Intents lists get a Swap button with the live price. One click opens a small Lethea window, and you pay from any chain, Bitcoin and Zcash included.</p>
          <div className="xp-mini xp-stack">
            <span className="xp-pair">
              <span className="xp-tag">$SOL</span>
              <SwapPill price={sol} />
            </span>
            <span className="xp-pair">
              <span className="xp-tag">$PEPE</span>
              <SwapPill price={pepe && pepe >= 0.01 ? pepe : undefined} />
            </span>
          </div>
        </div>
        <div className="xp-card">
          <span className="xp-k">Check</span>
          <h2>Scams flagged first</h2>
          <p>Contracts posing as a listed token, mintable or honeypot tokens, and links dressed up as a brand get flagged under the post. Swap anyway and you get the real token.</p>
          <div className="xp-mini xp-stack">
            <Chip risk="danger">0x69…1934 is not the $PEPE NEAR Intents lists</Chip>
            <Chip risk="caution">DEGEN (0x4e…efed): Supply can be minted</Chip>
            <Chip risk="ok">0x69…1933 is PEPE on NEAR Intents</Chip>
          </div>
        </div>
        <div className="xp-card">
          <span className="xp-k">Pay</span>
          <h2>Pay any profile</h2>
          <p>Profiles that list a .near name or a wallet get a Pay button. Lethea checks the address on chain before the swap box appears, and refuses token contracts.</p>
          <div className="xp-mini">
            <span className="lethea-btn lethea-paybtn xp-pulse">
              <Ghost eye="#dfe2e7" />
              <span className="lethea-label">Pay</span>
              <span className="lethea-to">lethea.near</span>
            </span>
          </div>
        </div>
      </section>

      <section className="xp-flow">
        <div>
          <b>01</b>
          <h3>Spot</h3>
          <p>Reads posts as X draws them and finds cashtags, contract addresses and links.</p>
        </div>
        <div>
          <b>02</b>
          <h3>Check</h3>
          <p>Matches each token against NEAR Intents and GoPlus before you get a button for it.</p>
        </div>
        <div>
          <b>03</b>
          <h3>Settle</h3>
          <p>Your swap is one intent: one deposit on your chain, the payout on theirs. Lethea never holds funds.</p>
        </div>
      </section>

      <section className="xp-install" id="install">
        <div>
          <span className="xp-k">Install</span>
          <h2>Running in about a minute</h2>
          <ol className="xp-steps">
            <li>
              <a href={ZIP}>Download the zip</a> and unzip it.
            </li>
            <li>
              Open <CopyLine text="chrome://extensions" /> and turn on <b>Developer mode</b>.
            </li>
            <li>
              Click <b>Load unpacked</b> and pick the <code>lethea-for-x</code> folder.
            </li>
            <li>
              A demo page opens once to show you around. Then open x.com; the toolbar icon keeps your activity.
            </li>
          </ol>
          <p className="xp-fine">
            Version {VERSION}. Checksums and older versions are on the{' '}
            <a href={RELEASES} target="_blank" rel="noreferrer">
              releases page
            </a>
            .
          </p>
        </div>
        <div className="xp-privacy">
          <span className="xp-k">What it sends where</span>
          <ul>
            <li>Token list and quotes from NEAR Intents.</li>
            <li>Contract addresses and link domains from posts to GoPlus for checks.</li>
            <li>Activity counts for the popup stay in your browser.</li>
            <li>No account, no server of ours, no tracking.</li>
          </ul>
          <a className="xp-link" href="/docs" onClick={linkTo('/docs')}>
            Read the docs
          </a>
        </div>
      </section>
    </main>
  );
}
