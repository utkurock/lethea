import type { Chains } from '@aurora-is-near/intents-swap-widget';

// Kept apart from useIntentsConfig, which pulls in the chain adapters, so pages outside the widget can
// check a chain without loading them. The X extension (extension/background.js) keeps a copy of CHAINS.

// Chains we can sign on with a connected wallet.
export const WALLET_CHAINS: Chains[] = ['stellar', 'eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax', 'sol', 'near'];
// No browser wallet signs for these through the widget: the user sends from their own wallet to a
// one-time deposit address instead. SwapBox turns allowSwapWithExternalWallet on for them.
export const DEPOSIT_CHAINS: Chains[] = ['btc', 'zec', 'xrp', 'doge'];
export const CHAINS: Chains[] = [...WALLET_CHAINS, ...DEPOSIT_CHAINS];
