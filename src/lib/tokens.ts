import type { Chains } from '@aurora-is-near/intents-swap-widget';
// The constants entry, not the package root: the root would pull the whole widget into the first chunk.
import { TOKENS as TOKENS_DATA } from '@aurora-is-near/intents-swap-widget/constants';
import { useEffect, useState } from 'react';

export type IntentsToken = {
  assetId: string;
  blockchain: string;
  symbol: string;
  price: number;
  decimals: number;
  contractAddress?: string;
};

export type TokenInfo = {
  symbol: string;
  name: string;
  /** Chain the widget buys it on, and whose NEAR Intents listing gives the price. */
  chain: Chains;
  chainLabel: string;
  /** Hyperliquid coin for price history; stablecoins have none. */
  hlCoin?: string;
  about: string;
};

export const TOKENS: TokenInfo[] = [
  { symbol: 'XLM', name: 'Stellar Lumens', chain: 'stellar', chainLabel: 'Stellar', hlCoin: 'XLM', about: 'The native asset of the Stellar network. It pays network fees and keeps the minimum account balance, and it bridges between assets on the built-in order book.' },
  { symbol: 'ETH', name: 'Ethereum', chain: 'eth', chainLabel: 'Ethereum', hlCoin: 'ETH', about: 'The native asset of Ethereum. It pays gas on Ethereum and on most rollups built on top of it, such as Base, Arbitrum and Optimism.' },
  { symbol: 'cbBTC', name: 'Coinbase Wrapped BTC', chain: 'base', chainLabel: 'Base', hlCoin: 'BTC', about: 'Bitcoin held by Coinbase and issued 1:1 as a token on Base and Ethereum. Its chart follows BTC.' },
  { symbol: 'wNEAR', name: 'Wrapped NEAR', chain: 'near', chainLabel: 'NEAR', hlCoin: 'NEAR', about: 'NEAR in token form. NEAR Intents settles every swap on NEAR, which makes wNEAR the home asset of the protocol this app routes through.' },
  { symbol: 'USDC', name: 'USD Coin', chain: 'stellar', chainLabel: 'Stellar', about: 'A dollar stablecoin issued by Circle and redeemable 1:1 for USD. On Stellar, receiving it needs a trustline to the Circle issuer.' },
  { symbol: 'SOL', name: 'Solana', chain: 'sol', chainLabel: 'Solana', hlCoin: 'SOL', about: 'The native asset of Solana. It pays fees and secures the network through staking.' },
  { symbol: 'ZEC', name: 'Zcash', chain: 'zec', chainLabel: 'Zcash', hlCoin: 'ZEC', about: 'A privacy coin. Shielded transfers hide sender, receiver and amount with zero-knowledge proofs.' },
  { symbol: 'ARB', name: 'Arbitrum', chain: 'arb', chainLabel: 'Arbitrum', hlCoin: 'ARB', about: 'The governance token of the Arbitrum DAO, which runs the Arbitrum One rollup on Ethereum.' },
  { symbol: 'AAVE', name: 'Aave', chain: 'eth', chainLabel: 'Ethereum', hlCoin: 'AAVE', about: 'The governance token of Aave, a lending protocol. Holders vote on risk parameters and can stake it as a backstop for the protocol.' },
  { symbol: 'LINK', name: 'Chainlink', chain: 'eth', chainLabel: 'Ethereum', hlCoin: 'LINK', about: 'The token of Chainlink, an oracle network. Node operators earn and stake it for delivering price feeds and other off-chain data.' },
  { symbol: 'UNI', name: 'Uniswap', chain: 'eth', chainLabel: 'Ethereum', hlCoin: 'UNI', about: 'The governance token of Uniswap, the largest automated market maker on Ethereum and its rollups.' },
  { symbol: 'BNB', name: 'BNB', chain: 'bsc', chainLabel: 'BNB Chain', hlCoin: 'BNB', about: 'The native asset of BNB Chain. It pays gas on the network.' },
  { symbol: 'AVAX', name: 'Avalanche', chain: 'avax', chainLabel: 'Avalanche', hlCoin: 'AVAX', about: 'The native asset of Avalanche. It pays fees on the C-Chain and secures the network through staking.' },
  { symbol: 'XRP', name: 'XRP', chain: 'xrp', chainLabel: 'XRP Ledger', hlCoin: 'XRP', about: 'The native asset of the XRP Ledger, used for fees and as a bridge currency in cross-border payments.' },
  { symbol: 'DOGE', name: 'Dogecoin', chain: 'doge', chainLabel: 'Dogecoin', hlCoin: 'DOGE', about: 'A proof-of-work coin that began as a meme in 2013 and became one of the most traded assets.' },
];

export const findToken = (symbol: string) =>
  TOKENS.find((t) => t.symbol.toLowerCase() === symbol.toLowerCase());

const EXTRA_ICONS: Record<string, string> = {
  xlm: 'https://s2.coinmarketcap.com/static/img/coins/128x128/512.png',
};

// Logos drawn in black on a transparent ground; they need a light plate on our dark page.
export const platedIcon = (symbol: string) => symbol.toLowerCase() === 'xlm';

export const iconFor = (symbol: string) => {
  const key = symbol.toLowerCase();
  return EXTRA_ICONS[key] ?? TOKENS_DATA[key]?.icon;
};

// One shared poll of the NEAR Intents token list, used by the ticker and the token pages.
let cache: IntentsToken[] = [];
let inflight: Promise<void> | null = null;
const subs = new Set<(list: IntentsToken[]) => void>();

const refresh = () =>
  (inflight ??= fetch('https://1click.chaindefuser.com/v0/tokens')
    .then((r) => r.json())
    .then((list: IntentsToken[]) => {
      cache = list;
      subs.forEach((cb) => cb(list));
    })
    .catch(() => {
      // Keep the last list on a failed refresh.
    })
    .finally(() => {
      inflight = null;
    }));

let timer: ReturnType<typeof setInterval> | undefined;

export function useIntentsTokens() {
  const [list, setList] = useState(cache);
  useEffect(() => {
    subs.add(setList);
    if (!cache.length) void refresh();
    timer ??= setInterval(refresh, 60_000);
    return () => {
      subs.delete(setList);
      if (!subs.size && timer) {
        clearInterval(timer);
        timer = undefined;
      }
    };
  }, []);
  return list;
}

export const priceOf = (list: IntentsToken[], t: TokenInfo) =>
  (list.find((x) => x.symbol === t.symbol && x.blockchain === t.chain) ??
    list.find((x) => x.symbol === t.symbol))?.price;

export const fmtUsd = (p: number) =>
  p >= 1
    ? p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : p.toLocaleString('en-US', { maximumSignificantDigits: 4 });

export const fmtCompact = (n: number) =>
  n.toLocaleString('en-US', { notation: 'compact', maximumFractionDigits: 2 });
