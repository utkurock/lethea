import type { Chains, WidgetConfig } from '@aurora-is-near/intents-swap-widget';
import { evm } from '@aurora-is-near/intents-swap-widget-evm';
import { sol } from '@aurora-is-near/intents-swap-widget-solana';
import { stellar } from '@aurora-is-near/intents-swap-widget-stellar';
import { useMemo } from 'react';
import { useEvmWallet } from '../wallets/evm';
import { useNearWallet } from '../wallets/near';
import { useSolanaWallet } from '../wallets/solana';
import { useStellarWallet } from '../wallets/stellar';

// Chains we can sign on with a connected wallet.
export const WALLET_CHAINS: Chains[] = ['stellar', 'eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax', 'sol', 'near'];
// No browser wallet signs for these through the widget: the user sends from their own wallet to a
// one-time deposit address instead. SwapBox turns allowSwapWithExternalWallet on for them.
export const DEPOSIT_CHAINS: Chains[] = ['btc', 'zec', 'xrp', 'doge'];
const CHAINS: Chains[] = [...WALLET_CHAINS, ...DEPOSIT_CHAINS];
// Quick chain chips in the token picker. The type asks for four, but the widget renders the whole list;
// its chip row is one line tall and hides overflow, and six is what fits.
const SHORTCUTS = ['eth', 'stellar', 'base', 'arb', 'bsc', 'btc'] as unknown as [Chains, Chains, Chains, Chains];

export function useIntentsConfig(openWalletPicker: () => void): Partial<WidgetConfig> {
  const evmW = useEvmWallet();
  const xlmW = useStellarWallet();
  const solW = useSolanaWallet();
  const nearW = useNearWallet();

  return useMemo(
    () => ({
      apiKey: import.meta.env.VITE_INTENTS_API_KEY,
      referral: 'lethea',
      alchemyApiKey: import.meta.env.VITE_ALCHEMY_API_KEY || undefined,

      // Address is picked by the selected token's chain, falling back to `default`, which therefore
      // covers the EVM chains only. Falling back to a Stellar or Solana address there handed the widget
      // a non-EVM address as the ETH wallet.
      connectedWallets: {
        default: evmW.address ?? null,
        stellar: xlmW.address ?? null,
        sol: solW.address ?? null,
        near: nearW.address ?? null,
      },

      providers: {
        ...(evmW.provider ? { evm: evmW.provider } : {}),
        ...(xlmW.address
          ? {
              stellar: {
                publicKey: xlmW.address,
                signMessage: xlmW.signMessage,
                signTransaction: xlmW.signTransaction,
              },
            }
          : {}),
        ...(solW.provider ? { sol: solW.provider } : {}),
        ...(nearW.provider ? { near: nearW.provider } : {}),
      },

      plugins: { evm, stellar, sol },

      onWalletSignin: openWalletPicker,
      // No type means every wallet.
      onWalletSignout: (type) => {
        if (!type || type === 'evm') evmW.disconnect();
        if (!type || type === 'stellar') xlmW.disconnect();
        if (!type || type === 'sol') solW.disconnect();
        if (!type || type === 'near') nearW.disconnect();
      },

      allowedSourceChainsList: CHAINS,
      allowedTargetChainsList: CHAINS,
      chainsOrder: CHAINS,
      topChainShortcuts: () => SHORTCUTS,
      // Native ETH on Ethereum, not the NEAR-bridged one the widget picks by default.
      defaultSourceToken: { symbol: 'ETH', blockchain: 'eth' },
      // The widget only fills the target itself when it picked the source too.
      defaultTargetToken: { symbol: 'USDC', blockchain: 'stellar' },

      confidentialMode: 'user-choice',

      slippageTolerance: 100, // bps, 1%
      enableAutoTokensSwitching: true,
      showTransactionHistory: true,
      showConversionPreview: true,
      showProfileButton: false,
      refetchQuoteInterval: 15_000,
      themeParentElementSelector: '#swap-root',
    }),
    [
      evmW.address, evmW.provider, xlmW.address, xlmW.signMessage, xlmW.signTransaction,
      solW.address, solW.provider, nearW.address, nearW.provider, openWalletPicker,
    ],
  );
}
