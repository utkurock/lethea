# Lethea

Lethea is a cross-chain swap app with a privacy option. You pay from one chain, sign a single deposit, and receive on another. Routing and settlement go through [NEAR Intents](https://docs.near-intents.org), so Lethea never holds funds. Your wallet signs every transfer, and if a swap cannot be filled, NEAR Intents refunds the deposit to the address it came from.

The app is a static React site. It has no backend and stores no user data. Every request goes from the browser straight to the service it needs.

## What it does

### Swap

The swap box is Aurora's [Intents Swap Widget](https://github.com/aurora-is-near/intents-swap-widget) running in external wallet mode, with Lethea's own wallet picker around it. You choose a pair, read the quote, sign the deposit, and solvers compete to fill it. Quotes refresh every 15 seconds and slippage tolerance is 1%. Past swaps and their status show up in the widget's history view.

| Direction | Chains |
| --- | --- |
| Pay with a connected wallet | Stellar, Ethereum, Base, Arbitrum, Optimism, Polygon, BNB Chain, Avalanche, Solana, NEAR |
| Pay by deposit address | Bitcoin, Zcash, XRP Ledger, Dogecoin |
| Receive on | All of the above |

For Bitcoin, Zcash, XRP and Dogecoin there is no wallet to connect. The widget shows a one-time deposit address with a QR code, and you send from any wallet and give a refund address. On the receiving side you only need an address.

### Confidential mode

The widget has a Confidential toggle. With it on, the intent executes on a private NEAR shard run by permissioned validators, so the explorer does not show the route in between. The ends stay public, though. Anyone watching both chains can still see a deposit go in on one side and a payout come out on the other. The trust model is a TEE bridge plus a permissioned validator set, and there is no published independent audit yet.

### Private Send (testnet)

`/private` is a preview of [Stellar Private Payments](https://github.com/NethermindEth/stellar-private-payments), Nethermind's XLM privacy pool on Soroban. It runs on Stellar testnet only, it is unaudited, and it is off unless `VITE_ENABLE_SPP=true`.

One wallet signature derives your privacy keys and registers your public keys with the pool. After that you can deposit, send and withdraw. Each action builds a zero-knowledge proof in the browser with a WASM prover before it is submitted.

| Action | What is public |
| --- | --- |
| Deposit | Your address and the amount |
| Send | Neither the recipient nor the amount |
| Withdraw | The amount out, with no link to your deposit |

Notes and keys are tied to the wallet address, so switching wallets starts a separate private balance.

### Token pages and docs

The price strip at the top links to `/token/:symbol`. Each page shows the live price from NEAR Intents, a chart and 24h volume from Hyperliquid perpetual markets, the range high and low, and a swap box that targets that token. Stablecoins have no chart. `/docs` covers the same ground as this file from a user's point of view.

## Wallets

Wallet connections use open source libraries with no hosted relay in between. WalletConnect is not included, so mobile wallets cannot connect over QR.

| Chain | Library | Examples |
| --- | --- | --- |
| EVM | wagmi, EIP-6963 discovery | MetaMask, Rabby, Phantom |
| Stellar | Stellar Wallets Kit | Freighter, xBull, Lobstr |
| Solana | Solana Wallet Adapter | Phantom, Solflare, Backpack |
| NEAR | NEAR Connect | HOT, Meteor, Intear, MyNearWallet |

## Running locally

You need Node 20 or newer.

```bash
npm install
cp .env.example .env
npm run dev
```

| Variable | Required | Purpose |
| --- | --- | --- |
| `VITE_INTENTS_API_KEY` | Yes | NEAR Intents key from [studio.aurora.dev](https://studio.aurora.dev) |
| `VITE_ALCHEMY_API_KEY` | No | EVM token balances in the swap box |
| `VITE_ENABLE_SPP` | No | `true` turns on Private Send. Keep it `false` on mainnet builds |

`.env.example` also lists `VITE_REOWN_PROJECT_ID`. The current code does not read it.

Without an API key the widget still loads its token list but returns no quotes. That is enough for UI work:

```bash
VITE_INTENTS_API_KEY=preview-only npm run dev
```

Other scripts:

```bash
npm run build     # type check, then production build into dist/
npm run preview   # serve the production build
npm run lint      # oxlint
```

## Deploying

The build is plain static files. Two things matter on the host:

1. The router uses the History API, so `/token/*`, `/docs` and `/private` need an SPA rewrite to `index.html`.
2. `public/spp/` has to be served as is. The Private Send SDK loads its JS, WASM, proving key and workers from there at runtime, outside the bundler.

## Project layout

```
src/
  main.tsx              loads polyfills, then imports bootstrap.tsx
  bootstrap.tsx         wallet providers and the app root
  pages/                SwapPage (shell and routes), TokenPage, PrivatePage, DocsPage, swap.css
  components/           SwapBox, WalletPicker, Ticker, PriceChart, DitherField (animated background)
  intents/              widget configuration: chains, defaults, signers
  wallets/              one provider and hook per chain
  spp/client.ts         Private Send SDK loader and session
  lib/                  router, token list, swap history, theme, formatting
public/
  fonts/                Jeko
  spp/                  vendored Stellar Private Payments SDK and testnet deployments.json
brand/                  logo source images and make-logo.py
```

## Notes for contributors

- `main.tsx` imports the Buffer and process polyfills first and then loads `bootstrap.tsx` with a dynamic import. A static import breaks the app, because Rolldown hoists chunks above the polyfill.
- `vite.config.ts` aliases `algosdk` to its ESM build. The widget pulls it in through Wormhole, and Rolldown cannot resolve its `browser` field.
- If Vite fails to load after a dependency change, clear its optimizer cache with `npx vite --force`.
- Nethermind redeploys the testnet contracts from time to time. When that happens, copy the SDK from their hosted demo into `public/spp/dist` and replace `public/spp/deployments.json` with the one from their repo. The npm package `stellar-private-payments@0.1.0` is behind and fails against the current pool.

## Status

Swaps run on mainnet. Private Send is a testnet preview built on unaudited contracts, so do not use it with real funds.
