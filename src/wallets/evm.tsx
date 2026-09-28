import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Eip1193Provider } from 'ethers';
import { useCallback, useMemo, type ReactNode } from 'react';
import { arbitrum, avalanche, base, bsc, mainnet, optimism, polygon } from 'viem/chains';
import {
  WagmiProvider,
  createConfig,
  http,
  useConnect,
  useConnection,
  useConnectors,
  useDisconnect,
  type Connector,
} from 'wagmi';

// Plain wagmi, no hosted service: browser extensions announce themselves through EIP-6963 and
// appear as connectors on their own. There is deliberately no WalletConnect relay or vendor SDK.
const config = createConfig({
  chains: [mainnet, base, arbitrum, optimism, polygon, bsc, avalanche],
  connectors: [],
  multiInjectedProviderDiscovery: true,
  transports: {
    [mainnet.id]: http(),
    [base.id]: http(),
    [arbitrum.id]: http(),
    [optimism.id]: http(),
    [polygon.id]: http(),
    [bsc.id]: http(),
    [avalanche.id]: http(),
  },
});

const queryClient = new QueryClient();

export function EvmProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export type EvmWalletOption = { id: string; name: string; icon?: string; connector: Connector };

export function useEvmWallet() {
  const { address, isConnected, connector } = useConnection();
  const connectors = useConnectors();
  const { mutateAsync: connectAsync } = useConnect();
  const { mutate: disconnect } = useDisconnect();

  // The widget accepts a lazy getter, so the provider is resolved only when a deposit is sent.
  const provider = useMemo(
    () => (connector ? () => connector.getProvider() as Promise<Eip1193Provider> : undefined),
    [connector],
  );

  // One row per installed extension, with its own name and icon. Some wallets announce twice.
  const wallets = useMemo<EvmWalletOption[]>(() => {
    const seen = new Set<string>();
    return connectors
      .filter((c) => !seen.has(c.name) && seen.add(c.name))
      .map((c) => ({ id: c.id, name: c.name, icon: c.icon, connector: c }));
  }, [connectors]);

  const connectWith = useCallback((c: Connector) => connectAsync({ connector: c }), [connectAsync]);

  return {
    address: isConnected ? address : undefined,
    walletName: isConnected ? connector?.name : undefined,
    provider,
    wallets,
    connectWith,
    disconnect: () => disconnect(),
  };
}
