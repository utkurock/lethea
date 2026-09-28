import { NearConnector } from '@hot-labs/near-connect';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// HOT's connector (MIT, no dependencies). Wallet code runs in sandboxed iframes loaded from its
// manifest, so HOT, Meteor, Intear, MyNearWallet and the rest need no package of their own.
const connector = new NearConnector({
  network: 'mainnet',
  features: { signMessage: true, signAndSendTransactions: true },
  footerBranding: null,
});

type Wallet = Awaited<ReturnType<NearConnector['wallet']>>;
export type NearWalletOption = { id: string; name: string; icon: string; url: string };

type NearCtx = {
  address?: string;
  walletName?: string;
  wallets: NearWalletOption[];
  connectWith: (id: string) => Promise<void>;
  disconnect: () => void;
  /** Handed to the widget, which calls signMessage and signAndSendTransactions on it. */
  provider?: () => Wallet;
};

const Ctx = createContext<NearCtx | null>(null);

export function NearProvider({ children }: { children: ReactNode }) {
  const [wallets, setWallets] = useState<NearWalletOption[]>([]);
  const [session, setSession] = useState<{ wallet: Wallet; address: string } | null>(null);

  useEffect(() => {
    let live = true;
    void connector.whenManifestLoaded.then(() => {
      if (!live) return;
      setWallets(
        connector.availableWallets.map((w) => ({
          id: w.manifest.id,
          name: w.manifest.name,
          icon: w.manifest.icon,
          url: w.manifest.website,
        })),
      );
    });
    // Restores the last session, if the wallet still has it.
    connector
      .getConnectedWallet()
      .then(({ wallet, accounts }) => live && accounts[0] && setSession({ wallet, address: accounts[0].accountId }))
      .catch(() => {});
    const onOut = () => setSession(null);
    connector.on('wallet:signOut', onOut);
    return () => {
      live = false;
      connector.off('wallet:signOut', onOut);
    };
  }, []);

  const value = useMemo<NearCtx>(
    () => ({
      address: session?.address,
      walletName: session?.wallet.manifest.name,
      wallets,
      connectWith: async (id) => {
        const wallet = await connector.connect({ walletId: id });
        const [account] = await wallet.getAccounts();
        if (!account) throw new Error('The wallet returned no account.');
        setSession({ wallet, address: account.accountId });
      },
      disconnect: () => {
        void connector.disconnect();
        setSession(null);
      },
      provider: session ? () => session.wallet : undefined,
    }),
    [session, wallets],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useNearWallet = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNearWallet must be used inside NearProvider');
  return ctx;
};
