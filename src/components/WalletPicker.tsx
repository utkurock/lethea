import { useEffect, useState } from 'react';
import { short } from '../lib/format';
import { iconFor } from '../lib/tokens';
import { useEvmWallet } from '../wallets/evm';
import { useNearWallet } from '../wallets/near';
import { useSolanaWallet } from '../wallets/solana';
import { useStellarWallet } from '../wallets/stellar';

type Props = {
  open: boolean;
  onClose: () => void;
  /** Show one chain only, without tabs, and close once it is connected (Private Send is Stellar-only). */
  only?: ChainId;
  note?: string;
};
export type ChainId = 'evm' | 'xlm' | 'sol' | 'near';

const LOGO: Record<ChainId, string> = { evm: 'ETH', xlm: 'XLM', sol: 'SOL', near: 'NEAR' };

/** Chain mark. The Stellar logo is black, so it sits on a light plate. */
export function ChainLogo({ chain, size = 20 }: { chain: ChainId; size?: number }) {
  const src = iconFor(LOGO[chain]);
  return src ? (
    <img className={`chain-logo ${chain === 'xlm' ? 'plated' : ''}`} src={src} alt="" width={size} height={size} />
  ) : null;
}

const MoreIcon = () => (
  <svg viewBox="0 0 28 28" width="28" height="28" aria-hidden>
    <rect width="28" height="28" rx="8" fill="var(--surface-3)" />
    {[8, 16].flatMap((x) => [8, 16].map((y) => <rect key={`${x}${y}`} x={x} y={y} width="4" height="4" rx="1" fill="var(--ink-3)" />))}
  </svg>
);

/** One wallet as the picker shows it, whichever library it came from. */
type Option = { key: string; name: string; icon?: string; installed: boolean; url?: string; connect: () => Promise<unknown> };

type Chain = {
  id: ChainId;
  label: string;
  hint: string;
  empty: string;
  address?: string;
  walletName?: string;
  options: Option[];
  /** Not-installed wallets shown before "Show all". */
  popular?: RegExp;
  disconnect: () => void;
};

const reason = (e: unknown) => {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  return /reject|denied|cancel|closed/i.test(msg) ? 'Request rejected in the wallet.' : msg || 'Could not connect.';
};

export function WalletPicker({ open, onClose, only, note }: Props) {
  const evm = useEvmWallet();
  const xlm = useStellarWallet();
  const sol = useSolanaWallet();
  const near = useNearWallet();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [tab, setTab] = useState<ChainId>('evm');
  const { refreshWallets } = xlm;

  const chains: Chain[] = [
    {
      id: 'evm',
      label: 'EVM',
      hint: 'Ethereum, Base, Arbitrum, BNB and more',
      empty: 'No browser wallet found. Install one, such as MetaMask or Rabby, and reload.',
      address: evm.address,
      walletName: evm.walletName,
      options: evm.wallets.map((w) => ({ key: w.id, name: w.name, icon: w.icon, installed: true, connect: () => evm.connectWith(w.connector) })),
      disconnect: evm.disconnect,
    },
    {
      id: 'xlm',
      label: 'Stellar',
      hint: 'XLM and USDC on Stellar',
      empty: 'Loading Stellar wallets…',
      address: xlm.address,
      walletName: xlm.walletName,
      options: xlm.wallets.map((w) => ({ key: w.id, name: w.name, icon: w.icon, installed: w.isAvailable, url: w.url, connect: () => xlm.connectWith(w.id) })),
      popular: /freighter|lobstr|hana|rabet/i,
      disconnect: xlm.disconnect,
    },
    {
      id: 'sol',
      label: 'Solana',
      hint: 'SOL and SPL tokens',
      empty: 'No Solana wallet found. Install one, such as Phantom, Solflare or Backpack, and reload.',
      address: sol.address,
      walletName: sol.walletName,
      options: sol.wallets.map((w) => ({ key: w.name, name: w.name, icon: w.icon, installed: w.installed, url: w.url, connect: () => sol.connectWith(w.name) })),
      popular: /phantom|solflare|backpack/i,
      disconnect: sol.disconnect,
    },
    {
      id: 'near',
      label: 'NEAR',
      hint: 'NEAR and its tokens',
      empty: 'Loading NEAR wallets…',
      address: near.address,
      walletName: near.walletName,
      // The connector's wallets run in its own sandbox, so each one is ready to use.
      options: near.wallets.map((w) => ({ key: w.id, name: w.name, icon: w.icon, installed: true, url: w.url, connect: () => near.connectWith(w.id) })),
      disconnect: near.disconnect,
    },
  ];

  useEffect(() => {
    if (!open) return;
    setError(null);
    refreshWallets();
    // Open on the requested chain, or the first one that still needs a wallet.
    setTab(only ?? (chains.find((c) => !c.address) ?? chains[0]).id);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // Only on open: the tab should not jump while the user is looking at it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, onClose, refreshWallets]);

  const lockedAddress = only ? chains.find((c) => c.id === only)?.address : undefined;
  useEffect(() => {
    if (open && lockedAddress) onClose();
  }, [open, lockedAddress, onClose]);

  if (!open) return null;

  const chain = chains.find((c) => c.id === (only ?? tab))!;
  const visible = chain.options.filter((o) => showAll || o.installed || !chain.popular || chain.popular.test(o.name));
  const hidden = chain.options.length - visible.length;

  const run = async (o: Option) => {
    setPending(o.key);
    setError(null);
    try {
      await o.connect();
    } catch (e) {
      setError(reason(e));
    } finally {
      setPending(null);
    }
  };

  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal wallet-modal" role="dialog" aria-modal="true" aria-label="Wallets" onClick={(e) => e.stopPropagation()}>
        <div className="modal-top">
          <h3>Connect a wallet</h3>
          <button className="modal-x" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <p className="modal-sub">{note ?? 'Connect the chain you send from. Receiving needs no wallet.'}</p>

        {!only && (
          <div className="chain-tabs" role="tablist">
            {chains.map((c) => (
              <button
                key={c.id}
                role="tab"
                aria-selected={tab === c.id}
                className={tab === c.id ? 'on' : ''}
                onClick={() => {
                  setTab(c.id);
                  setError(null);
                  setShowAll(false);
                }}
              >
                <ChainLogo chain={c.id} size={18} />
                {c.label}
                {c.address && <span className="tab-on" aria-label="connected" />}
              </button>
            ))}
          </div>
        )}

        <section className="chain-block">
          <div className="chain-head">
            <ChainLogo chain={chain.id} size={22} />
            <div className="wallet-meta">
              <b>{chain.label}</b>
              <small>
                {chain.address ? `${chain.walletName ? `${chain.walletName} · ` : ''}${short(chain.address)}` : chain.hint}
              </small>
            </div>
            {chain.address && (
              <button className="btn ghost" onClick={chain.disconnect}>
                Disconnect
              </button>
            )}
          </div>

          {!chain.address &&
            (chain.options.length === 0 ? (
              <p className="wallet-empty">{chain.empty}</p>
            ) : (
              <div className="wallet-grid">
                {visible.map((o) =>
                  o.installed ? (
                    <button key={o.key} className="wallet-tile" disabled={!!pending} onClick={() => void run(o)}>
                      {o.icon ? <img src={o.icon} alt="" width={28} height={28} /> : <MoreIcon />}
                      <span>{pending === o.key ? 'Connecting…' : o.name}</span>
                    </button>
                  ) : (
                    <a key={o.key} className="wallet-tile off" href={o.url} target="_blank" rel="noreferrer">
                      {o.icon ? <img src={o.icon} alt="" width={28} height={28} /> : <MoreIcon />}
                      <span>{o.name}</span>
                      <em>Install</em>
                    </a>
                  ),
                )}
                {hidden > 0 && (
                  <button className="wallet-tile" onClick={() => setShowAll(true)}>
                    <MoreIcon />
                    <span>Show all ({hidden})</span>
                  </button>
                )}
              </div>
            ))}
          {error && <p className="wallet-error">{error}</p>}
        </section>

        {!only && (
          <p className="wallet-foot">
            Bitcoin, Zcash, XRP and Dogecoin need no wallet here. Pick the token and send from any wallet to the
            deposit address the swap shows.
          </p>
        )}
      </div>
    </div>
  );
}
