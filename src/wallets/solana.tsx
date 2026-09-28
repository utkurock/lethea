import { WalletReadyState, type WalletName } from '@solana/wallet-adapter-base';
import { WalletProvider, useWallet } from '@solana/wallet-adapter-react';
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';

// No adapters listed on purpose: Phantom, Solflare, Backpack and the rest register through the
// Wallet Standard, and the provider picks them up from the page.
export function SolanaProvider({ children }: { children: ReactNode }) {
  return (
    <WalletProvider wallets={[]} autoConnect>
      {children}
    </WalletProvider>
  );
}

export type SolanaWalletOption = { name: string; icon: string; installed: boolean; url: string };

export function useSolanaWallet() {
  const w = useWallet();
  const { select, connect, wallet, connected, publicKey, signMessage, signTransaction, disconnect } = w;

  const wallets = useMemo<SolanaWalletOption[]>(
    () =>
      w.wallets
        .map((x) => ({
          name: x.adapter.name,
          icon: x.adapter.icon,
          installed: x.readyState === WalletReadyState.Installed,
          url: x.adapter.url,
        }))
        .sort((a, b) => Number(b.installed) - Number(a.installed)),
    [w.wallets],
  );

  // `select` only records the choice; the connect call has to wait until the adapter is swapped in.
  const pending = useRef<{ name: string; resolve: () => void; reject: (e: unknown) => void } | null>(null);
  useEffect(() => {
    const p = pending.current;
    if (!p || wallet?.adapter.name !== p.name || connected) return;
    pending.current = null;
    connect().then(p.resolve, p.reject);
  }, [wallet, connected, connect]);

  const connectWith = useCallback(
    (name: string) =>
      new Promise<void>((resolve, reject) => {
        pending.current = { name, resolve, reject };
        select(name as WalletName);
        // Already selected: the effect will not fire again, so connect directly.
        if (wallet?.adapter.name === name && !connected) {
          pending.current = null;
          connect().then(resolve, reject);
        }
      }),
    [select, connect, wallet, connected],
  );

  const address = connected ? publicKey?.toBase58() : undefined;

  // The widget's Solana adapter signs through this shape.
  const provider = useMemo(
    () =>
      address && signMessage && signTransaction
        ? { publicKey, signMessage, signTransaction: signTransaction as (tx: unknown) => Promise<unknown> }
        : undefined,
    [address, publicKey, signMessage, signTransaction],
  );

  return {
    address,
    walletName: connected ? wallet?.adapter.name : undefined,
    wallets,
    connectWith,
    provider,
    disconnect: () => void disconnect(),
  };
}
