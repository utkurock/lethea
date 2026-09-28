import { StellarWalletsKit } from '@creit.tech/stellar-wallets-kit/sdk';
import { defaultModules } from '@creit.tech/stellar-wallets-kit/modules/utils';
import { KitEventType, Networks, SwkAppDarkTheme, type ISupportedWallet } from '@creit.tech/stellar-wallets-kit/types';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { ACCENT, SURFACE } from '../lib/theme';

// The widget's Stellar adapter only builds mainnet payments.
StellarWalletsKit.init({
  modules: defaultModules(),
  network: Networks.PUBLIC,
  theme: { ...SwkAppDarkTheme, primary: ACCENT, 'primary-foreground': '#0c0c0e', background: SURFACE },
});

type SignTxOpts = { networkPassphrase?: string; address?: string };

type StellarCtx = {
  address?: string;
  walletName?: string;
  /** Every wallet the kit supports, with whether it is installed here. */
  wallets: ISupportedWallet[];
  refreshWallets: () => void;
  connectWith: (id: string) => Promise<void>;
  disconnect: () => void;
  signMessage: (msg: string) => Promise<{ signedMessage: string; signerAddress: string | undefined }>;
  signTransaction: (
    xdr: string,
    opts?: SignTxOpts,
  ) => Promise<{ signedTxXdr: string; signerAddress: string | undefined }>;
};

const Ctx = createContext<StellarCtx | null>(null);

export function StellarProvider({ children }: { children: ReactNode }) {
  const [address, setAddress] = useState<string>();
  const [walletName, setWalletName] = useState<string>();
  const [wallets, setWallets] = useState<ISupportedWallet[]>([]);

  // Availability is checked against the page (extensions inject late), so this runs again when the picker opens.
  const refreshWallets = useCallback(() => {
    StellarWalletsKit.refreshSupportedWallets()
      .then((list) => setWallets([...list].sort((a, b) => Number(b.isAvailable) - Number(a.isAvailable))))
      .catch(() => {});
  }, []);
  useEffect(refreshWallets, [refreshWallets]);

  // Fires once on launch too, which restores a previous session.
  useEffect(() => {
    const offState = StellarWalletsKit.on(KitEventType.STATE_UPDATED, (e) =>
      setAddress(e.payload.address || undefined),
    );
    const offDisconnect = StellarWalletsKit.on(KitEventType.DISCONNECT, () => setAddress(undefined));
    return () => {
      offState();
      offDisconnect();
    };
  }, []);

  const value = useMemo<StellarCtx>(
    () => ({
      address,
      walletName,
      wallets,
      refreshWallets,
      connectWith: async (id) => {
        StellarWalletsKit.setWallet(id);
        const res = await StellarWalletsKit.fetchAddress();
        setAddress(res.address);
        setWalletName(wallets.find((w) => w.id === id)?.name);
      },
      disconnect: () => {
        void StellarWalletsKit.disconnect();
        setAddress(undefined);
        setWalletName(undefined);
      },
      signMessage: async (msg) => {
        const res = await StellarWalletsKit.signMessage(msg, {
          address,
          networkPassphrase: Networks.PUBLIC,
        });
        return { signedMessage: res.signedMessage, signerAddress: res.signerAddress };
      },
      signTransaction: async (xdr, opts) => {
        const res = await StellarWalletsKit.signTransaction(xdr, {
          address: opts?.address ?? address,
          networkPassphrase: opts?.networkPassphrase ?? Networks.PUBLIC,
        });
        return { signedTxXdr: res.signedTxXdr, signerAddress: res.signerAddress };
      },
    }),
    [address, walletName, wallets, refreshWallets],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStellarWallet = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStellarWallet must be used inside StellarProvider');
  return ctx;
};
