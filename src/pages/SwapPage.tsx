import '@aurora-is-near/intents-swap-widget/styles.css';
import './swap.css';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { DitherField } from '../components/DitherField';
import { Fence } from '../components/Fence';
import { SwapSlot } from '../components/SwapSlot';
import { Ticker } from '../components/Ticker';
import { ChainLogo, WalletPicker, type ChainId } from '../components/WalletPicker';
import { short } from '../lib/format';
import { lazyChunk } from '../lib/lazy';
import { linkTo, usePath } from '../lib/router';
import { DOT } from '../lib/theme';
import { findToken } from '../lib/tokens';
import { TokenPage } from './TokenPage';
import { FLAGS } from '../features/flags';
import { useEvmWallet } from '../wallets/evm';
import { useNearWallet } from '../wallets/near';
import { useSolanaWallet } from '../wallets/solana';
import { useStellarWallet } from '../wallets/stellar';

// Pages that aren't the landing one load when first visited.
const PrivatePage = lazyChunk(() => import('./PrivatePage').then((m) => ({ default: m.PrivatePage })));
const DocsPage = lazyChunk(() => import('./DocsPage').then((m) => ({ default: m.DocsPage })));

const missingKey = !import.meta.env.VITE_INTENTS_API_KEY;

function Logo() {
  return (
    <a className="logo" href="/" onClick={linkTo('/')} aria-label="Lethea">
      <svg className="mark" viewBox="0 0 52 60" aria-hidden>
        {/* The mascot, same geometry as DitherField and brand/make-logo.py. */}
        <defs>
          <radialGradient id="mark-shade" cx="16.2" cy="16.2" r="45" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#f5f5f6" />
            <stop offset="1" stopColor="#8a8d94" />
          </radialGradient>
        </defs>
        <path
          fill="url(#mark-shade)"
          d="M4.16 23.84a21.84 21.84 0 0 1 43.68 0V54q-7.28 8-14.56 0-7.28 8-14.56 0-7.28 8-14.56 0Z"
        />
        <ellipse cx="17.7" cy="25.84" rx="4.2" ry="5.4" fill="var(--bg)" />
        <ellipse cx="34.3" cy="25.84" rx="4.2" ry="5.4" fill="var(--bg)" />
        <path d="M30.56 34.66a4 4 0 0 1-7.12 0" fill="none" stroke="var(--bg)" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
      Lethea
    </a>
  );
}

export default function SwapPage() {
  // null when closed; `only` narrows it to one chain.
  const [picker, setPicker] = useState<{ only?: ChainId } | null>(null);
  const openPicker = useCallback(() => setPicker({}), []);
  const openStellarPicker = useCallback(() => setPicker({ only: 'xlm' }), []);
  const closePicker = useCallback(() => setPicker(null), []);
  const evmW = useEvmWallet();
  const xlmW = useStellarWallet();
  const solW = useSolanaWallet();
  const nearW = useNearWallet();
  const path = usePath();
  const isPrivate = FLAGS.spp && path === '/private';
  const isDocs = path === '/docs';
  const token = path.startsWith('/token/') ? findToken(decodeURIComponent(path.slice(7))) : undefined;
  const isSwap = !token && !isPrivate && !isDocs;

  // Phone menu: closes on navigation and on Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [path]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  const connected = [
    evmW.address && { chain: 'evm', address: evmW.address },
    xlmW.address && { chain: 'xlm', address: xlmW.address },
    solW.address && { chain: 'sol', address: solW.address },
    nearW.address && { chain: 'near', address: nearW.address },
  ].filter(Boolean) as { chain: ChainId; address: string }[];

  return (
    <div className="app">
      <DitherField dot={DOT} />
      <header className="nav">
        <Logo />
        <nav className="links">
          <a className={token || isPrivate || isDocs ? '' : 'active'} href="/" onClick={linkTo('/')}>
            Swap
          </a>
          {FLAGS.spp ? (
            <a className={isPrivate ? 'active' : ''} href="/private" onClick={linkTo('/private')}>
              Private Send <em className="badge">Testnet</em>
            </a>
          ) : (
            <span className="link-off" title="Stellar Private Payments, testnet only for now">
              Private Send <em className="badge">Testnet</em>
            </span>
          )}
        </nav>
        <div className="nav-right">
          {missingKey && (
            <span className="key-warn" title="Set VITE_INTENTS_API_KEY in .env to load tokens and quotes.">
              No API key
            </span>
          )}
          <button className={`wallet-btn ${connected.length ? 'on' : ''}`} onClick={openPicker}>
            {connected.length
              ? [
                  ...connected.map((c) => (
                    <span key={c.chain} className="wallet-chip">
                      <ChainLogo chain={c.chain} size={16} />
                      {short(c.address)}
                    </span>
                  )),
                  connected.length > 1 && (
                    <span key="more" className="wallet-more">
                      +{connected.length - 1}
                    </span>
                  ),
                ]
              : 'Connect Wallet'}
          </button>
          <button
            className={`burger ${menuOpen ? 'on' : ''}`}
            aria-label="Menu"
            aria-expanded={menuOpen}
            aria-controls="mobile-menu"
            onClick={() => setMenuOpen((o) => !o)}
          >
            <span />
            <span />
          </button>
        </div>
      </header>

      {menuOpen && (
        <div className="menu-scrim" onClick={() => setMenuOpen(false)}>
          <nav id="mobile-menu" className="menu" onClick={(e) => e.stopPropagation()}>
            <a className={isSwap ? 'active' : ''} href="/" onClick={linkTo('/')}>
              Swap
            </a>
            {FLAGS.spp ? (
              <a className={isPrivate ? 'active' : ''} href="/private" onClick={linkTo('/private')}>
                Private Send <em className="badge">Testnet</em>
              </a>
            ) : (
              <span className="link-off">
                Private Send <em className="badge">Testnet</em>
              </span>
            )}
            <a className={isDocs ? 'active' : ''} href="/docs" onClick={linkTo('/docs')}>
              Docs
            </a>
            {missingKey && <p className="menu-note">No API key. Tokens and quotes won't load.</p>}
          </nav>
        </div>
      )}

      <Ticker />

      {isDocs ? (
        <Fence message="This page couldn't load." className="page-crash">
          <Suspense fallback={null}>
            <DocsPage />
          </Suspense>
        </Fence>
      ) : isPrivate ? (
        <Fence message="This page couldn't load." className="page-crash">
          <Suspense fallback={null}>
            <PrivatePage onConnect={openStellarPicker} />
          </Suspense>
        </Fence>
      ) : token ? (
        <TokenPage token={token} onConnect={openPicker} />
      ) : (
        <div className="stage">
          <section className="hero">
            <h1>One click, any chain.</h1>
            <p>Swap between EVM and Stellar through NEAR Intents. Go private when you want to.</p>
          </section>

          <main className="swap-layout">
            <section className="swap-col">
              <div id="swap-root">
                <SwapSlot onConnect={openPicker} />
              </div>

              <p className="mode-note">
                <b>Confidential</b> hides sender, amount and route. The deposit and the payout stay visible on
                their own chains.
              </p>
            </section>
          </main>
        </div>
      )}

      <footer className="foot">
        <span className="foot-left">
          © 2026 Lethea
          <a href="/docs" onClick={linkTo('/docs')}>
            Docs
          </a>
          <a href="https://github.com/utkurock/lethea" target="_blank" rel="noreferrer">
            GitHub
          </a>
        </span>
        <a href="https://near-intents.org" target="_blank" rel="noreferrer">
          Powered by NEAR Intents
        </a>
      </footer>

      <WalletPicker
        open={!!picker}
        onClose={closePicker}
        only={picker?.only}
        note={picker?.only === 'xlm' ? 'Private Send runs on Stellar. Set your wallet to Testnet.' : undefined}
      />
    </div>
  );
}
