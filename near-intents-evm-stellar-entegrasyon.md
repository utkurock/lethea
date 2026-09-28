# NEAR Intents Entegrasyonu — EVM + Stellar (Mainnet)

> Hedef: Uygulamamıza NEAR Intents swap widget'ını **EVM** ve **Stellar mainnet** desteğiyle, kendi markamıza uygun, temiz bir UI ile entegre etmek. Gizlilik tarafında mainnet'te **Confidential Intents**, ileride **Stellar Private Payments (SPP)**.

---

## 1. Özet ve Kararlar

| Konu | Karar |
|---|---|
| Widget paketi | `@aurora-is-near/intents-swap-widget` (core) + EVM ve Stellar adapter'ları — cüzdan UI'ı bizde kalsın diye **external mode** |
| EVM cüzdan | Reown AppKit + wagmi (MetaMask, Rabby, WalletConnect…) |
| Stellar cüzdan | Stellar Wallets Kit (Freighter, xBull, Lobstr, Albedo…) |
| Ağ | Mainnet (Stellar adapter yalnızca mainnet payment kurar) |
| Gizlilik (mainnet) | `confidentialMode: 'user-choice'` — kullanıcı toggle ile açar |
| Gizlilik (gelecek) | SPP — şu an **sadece testnet, audit'siz**; feature flag arkasında |
| API key / fee | studio.aurora.dev → API key; komisyon key üzerinde tanımlanır |

**Neden external mode?** Standalone paket daha hızlı ama cüzdan modalları (AppKit/Stellar Wallets Kit) değiştirilemiyor ve `connectedWallets` yok sayılıyor. "Güzel UI" hedefimiz için bağlantı akışını kendimiz yönetiyoruz.

> Hızlı prototip isterseniz: `@aurora-is-near/intents-swap-widget-standalone` kurup `<WidgetConfigProvider><Widget /></WidgetConfigProvider>` yeterli — EVM, Solana, Stellar ve NEAR dahili.

---

## 2. Mimari

```
┌──────────────────────── Uygulama ────────────────────────┐
│  Header: [Logo]            [EVM bağla] [Stellar bağla]   │
│                                                          │
│  ┌───────────── SwapCard ─────────────┐                  │
│  │  Tab: Swap | Transfer | Withdraw   │                  │
│  │  <Widget />  (NEAR Intents core)   │                  │
│  │  [🔒 Gizli mod]  (confidential)     │                  │
│  └────────────────────────────────────┘                  │
└──────────────────────────────────────────────────────────┘
          │ quote / status                │ deposit tx
          ▼                               ▼
   1Click API (NEAR Intents)     EVM adapter  → EIP-1193 provider
                                 Stellar adapter → Stellar Wallets Kit
```

- **Core**: quote → deposit → status akışını tüm zincirler için yürütür.
- **Adapter'lar**: sadece kaynak zincirdeki deposit işlemini gönderir. Kullanıcı yalnızca *alıcı* olacaksa adapter gerekmez.

---

## 3. Kurulum

```bash
# Widget
npm install @aurora-is-near/intents-swap-widget \
            @aurora-is-near/intents-swap-widget-evm \
            @aurora-is-near/intents-swap-widget-stellar

# EVM cüzdan
npm install @reown/appkit @reown/appkit-adapter-wagmi wagmi viem @tanstack/react-query

# Stellar cüzdan
npm install @creit.tech/stellar-wallets-kit
```

`.env`

```bash
VITE_INTENTS_API_KEY=xxxxxxxx          # studio.aurora.dev
VITE_REOWN_PROJECT_ID=xxxxxxxx         # cloud.reown.com
VITE_ALCHEMY_API_KEY=xxxxxxxx          # opsiyonel: EVM bakiyeleri için
```

> Next.js kullanıyorsanız `NEXT_PUBLIC_` önekini kullanın ve widget'ı içeren bileşeni `'use client'` yapın.

---

## 4. Cüzdan Katmanı

### 4.1 EVM — `src/wallets/evm.tsx`

```tsx
import { createAppKit, useAppKit, useAppKitAccount, useDisconnect } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { mainnet, base, arbitrum, optimism, polygon, bsc, avalanche } from '@reown/appkit/networks';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
const networks = [mainnet, base, arbitrum, optimism, polygon, bsc, avalanche];

const wagmiAdapter = new WagmiAdapter({ projectId, networks });

createAppKit({
  adapters: [wagmiAdapter],
  networks,
  projectId,
  metadata: {
    name: 'MyApp',
    description: 'Cross-chain swaps',
    url: 'https://myapp.xyz',
    icons: ['https://myapp.xyz/icon.png'],
  },
  themeMode: 'dark',
  themeVariables: { '--w3m-accent': '#7C5CFF', '--w3m-border-radius-master': '4px' },
});

const queryClient = new QueryClient();

export function EvmProvider({ children }: { children: React.ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

export function useEvmWallet() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const { disconnect } = useDisconnect();
  const { connector } = useAccount();
  const [provider, setProvider] = useState<unknown>();

  // Widget'a EIP-1193 provider lazım
  useEffect(() => {
    if (!connector) return setProvider(undefined);
    connector.getProvider().then(setProvider);
  }, [connector]);

  return {
    address: isConnected ? address : undefined,
    provider,
    connect: () => open(),
    disconnect: () => disconnect(),
  };
}
```

### 4.2 Stellar — `src/wallets/stellar.tsx`

> Aşağıdaki örnek Stellar Wallets Kit **v1.x** API'si ile yazıldı. v2 kullanıyorsanız metot adlarını paket dokümanına göre uyarlayın. Widget adapter'ı hem Wallets Kit (2 argümanlı) hem Freighter (tek argümanlı) imzasını otomatik tanıyor.

```tsx
import {
  StellarWalletsKit, WalletNetwork, allowAllModules, FREIGHTER_ID,
} from '@creit.tech/stellar-wallets-kit';
import { createContext, useContext, useMemo, useState } from 'react';

const kit = new StellarWalletsKit({
  network: WalletNetwork.PUBLIC,        // MAINNET
  selectedWalletId: FREIGHTER_ID,
  modules: allowAllModules(),
});

type StellarCtx = {
  address?: string;
  connect: () => Promise<void>;
  disconnect: () => void;
  signMessage: (msg: string) => Promise<{ signedMessage: string; signerAddress: string }>;
  signTransaction: (xdr: string, opts?: { networkPassphrase?: string; address?: string }) =>
    Promise<{ signedTxXdr: string }>;
};

const Ctx = createContext<StellarCtx | null>(null);

export function StellarProvider({ children }: { children: React.ReactNode }) {
  const [address, setAddress] = useState<string>();

  const value = useMemo<StellarCtx>(() => ({
    address,
    connect: () =>
      new Promise((resolve) => {
        kit.openModal({
          onWalletSelected: async (option) => {
            kit.setWallet(option.id);
            const { address } = await kit.getAddress();
            setAddress(address);
            resolve();
          },
          onClosed: () => resolve(),
        });
      }),
    disconnect: () => {
      kit.disconnect?.();
      setAddress(undefined);
    },
    signMessage: (msg) => kit.signMessage(msg, { address }),
    signTransaction: (xdr, opts) =>
      kit.signTransaction(xdr, { address, networkPassphrase: opts?.networkPassphrase }),
  }), [address]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useStellarWallet = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useStellarWallet must be used inside StellarProvider');
  return ctx;
};
```

---

## 5. Widget Konfigürasyonu — `src/intents/useIntentsConfig.ts`

```ts
import { evm } from '@aurora-is-near/intents-swap-widget-evm';
import { stellar } from '@aurora-is-near/intents-swap-widget-stellar';
import { useEvmWallet } from '../wallets/evm';
import { useStellarWallet } from '../wallets/stellar';

export function useIntentsConfig(openWalletPicker: () => void) {
  const evmW = useEvmWallet();
  const xlmW = useStellarWallet();

  return {
    apiKey: import.meta.env.VITE_INTENTS_API_KEY,
    referral: 'myapp',
    alchemyApiKey: import.meta.env.VITE_ALCHEMY_API_KEY,

    // Seçilen token'ın zincirine göre adres seçilir, yoksa `default`'a düşer
    connectedWallets: {
      default: evmW.address ?? xlmW.address,
      stellar: xlmW.address,
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
    },

    plugins: { evm, stellar },

    onWalletSignin: openWalletPicker,     // kendi "cüzdan seç" modalımız
    onWalletSignout: () => { evmW.disconnect(); xlmW.disconnect(); },

    // Sadece EVM + Stellar göster
    allowedChainsList: ['stellar', 'eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax'],
    chainsOrder: ['stellar', 'eth', 'base', 'arb', 'op', 'pol', 'bsc', 'avax'],

    // Gizlilik: kullanıcı toggle'ı
    confidentialMode: 'user-choice' as const,

    // UX
    slippageTolerance: 100,               // bps → %1
    enableAutoTokensSwitching: true,
    showTransactionHistory: true,
    showConversionPreview: true,
    showProfileButton: false,             // header'da kendi butonlarımız var
    refetchQuoteInterval: 15_000,

    theme: {
      colorScheme: 'dark' as const,
      accentColor: '#7C5CFF',
      backgroundColor: '#0B0B12',
      successColor: '#22C55E',
      warningColor: '#F59E0B',
      errorColor: '#EF4444',
      stylePreset: 'clean' as const,
      borderRadius: 'lg' as const,
      showContainer: false,               // kartı kendimiz çiziyoruz
    },
    themeParentElementSelector: '#swap-root',
  };
}
```

> **Chain ID'leri:** Yukarıdaki kısaltmalar EVM adapter README'sindeki ID'lerdir (`eth`, `base`, `arb`, `bsc`, `pol`, `op`, `avax`…). Stellar için `stellar` kullanıldı; token listesinde görünmezse [Supported Chains](https://docs.near-intents.org/resources/chain-support) sayfasındaki ID ile doğrulayın.
>
> **Stellar kaynak varlıkları:** Adapter şu an Stellar'dan yalnızca **XLM** ve **USDC (Circle)** gönderiyor. USDC için kullanıcının trustline'ı olmalı. Memo zorunlu ve adapter tarafından otomatik ekleniyor.

---

## 6. UI

### 6.1 Sayfa — `src/pages/SwapPage.tsx`

```tsx
import '@aurora-is-near/intents-swap-widget/styles.css';
import './swap.css';
import { WidgetConfigProvider, Widget } from '@aurora-is-near/intents-swap-widget';
import { useState } from 'react';
import { useIntentsConfig } from '../intents/useIntentsConfig';
import { useEvmWallet } from '../wallets/evm';
import { useStellarWallet } from '../wallets/stellar';
import { WalletPicker } from '../components/WalletPicker';

const short = (a?: string) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : '');

export default function SwapPage() {
  const [pickerOpen, setPickerOpen] = useState(false);
  const config = useIntentsConfig(() => setPickerOpen(true));
  const evmW = useEvmWallet();
  const xlmW = useStellarWallet();

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">◆ MyApp</div>
        <div className="wallets">
          <button className={`pill ${evmW.address ? 'on' : ''}`} onClick={evmW.address ? evmW.disconnect : evmW.connect}>
            <span className="dot evm" /> {evmW.address ? short(evmW.address) : 'EVM bağla'}
          </button>
          <button className={`pill ${xlmW.address ? 'on' : ''}`} onClick={xlmW.address ? xlmW.disconnect : xlmW.connect}>
            <span className="dot xlm" /> {xlmW.address ? short(xlmW.address) : 'Stellar bağla'}
          </button>
        </div>
      </header>

      <main className="hero">
        <h1>Her zincirden, tek tıkla.</h1>
        <p className="sub">EVM ↔ Stellar arası swap — NEAR Intents ile. Opsiyonel gizli mod.</p>

        <section id="swap-root" className="sw card">
          <WidgetConfigProvider config={config}>
            <Widget />
          </WidgetConfigProvider>
        </section>

        <ul className="trust">
          <li>Non-custodial</li>
          <li>35+ zincir likiditesi</li>
          <li>Gizli mod: gönderen / miktar / rota gizli</li>
        </ul>
      </main>

      <WalletPicker
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onEvm={() => { setPickerOpen(false); evmW.connect(); }}
        onStellar={() => { setPickerOpen(false); xlmW.connect(); }}
      />
    </div>
  );
}
```

### 6.2 Cüzdan seçici — `src/components/WalletPicker.tsx`

```tsx
export function WalletPicker({ open, onClose, onEvm, onStellar }: {
  open: boolean; onClose: () => void; onEvm: () => void; onStellar: () => void;
}) {
  if (!open) return null;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>Cüzdan bağla</h3>
        <button className="option" onClick={onEvm}>
          <span className="dot evm" /> EVM <small>MetaMask, Rabby, WalletConnect…</small>
        </button>
        <button className="option" onClick={onStellar}>
          <span className="dot xlm" /> Stellar <small>Freighter, xBull, Lobstr…</small>
        </button>
      </div>
    </div>
  );
}
```

### 6.3 Stil — `src/pages/swap.css`

```css
:root {
  --bg: #0b0b12;
  --surface: #14141f;
  --border: #25253a;
  --text: #f4f4f8;
  --muted: #9a9ab0;
  --accent: #7c5cff;
  --evm: #627eea;
  --xlm: #fdda24;
}

body { margin: 0; background: var(--bg); color: var(--text); font-family: Inter, system-ui, sans-serif; }

.app { min-height: 100vh; background:
  radial-gradient(60% 40% at 50% 0%, rgba(124, 92, 255, .18), transparent 70%), var(--bg); }

.topbar { display: flex; justify-content: space-between; align-items: center; padding: 16px 24px; }
.brand { font-weight: 700; letter-spacing: .02em; }
.wallets { display: flex; gap: 8px; }

.pill { display: inline-flex; align-items: center; gap: 8px; padding: 8px 14px;
  border-radius: 999px; border: 1px solid var(--border); background: var(--surface);
  color: var(--text); font: 500 14px/1 inherit; cursor: pointer; transition: border-color .15s; }
.pill:hover, .pill.on { border-color: var(--accent); }
.dot { width: 8px; height: 8px; border-radius: 50%; }
.dot.evm { background: var(--evm); }
.dot.xlm { background: var(--xlm); }

.hero { max-width: 480px; margin: 0 auto; padding: 48px 16px 64px; text-align: center; }
.hero h1 { font-size: clamp(28px, 5vw, 40px); margin: 0 0 8px; }
.sub { color: var(--muted); margin: 0 0 32px; }

.card { text-align: left; background: var(--surface); border: 1px solid var(--border);
  border-radius: 24px; padding: 12px; box-shadow: 0 20px 60px rgba(0, 0, 0, .45); }

/* Widget ince ayar — tam liste: paket içindeki theme.css (--sw-*) */
#swap-root {
  --sw-font-sans: Inter, system-ui, sans-serif;
  --sw-radius-m: 14px;
}

.trust { display: flex; flex-wrap: wrap; justify-content: center; gap: 16px;
  list-style: none; padding: 0; margin: 24px 0 0; color: var(--muted); font-size: 13px; }
.trust li::before { content: '✓ '; color: var(--accent); }

.overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); display: grid; place-items: center; z-index: 50; }
.modal { width: min(360px, calc(100vw - 32px)); background: var(--surface); border: 1px solid var(--border);
  border-radius: 20px; padding: 20px; display: grid; gap: 10px; }
.modal h3 { margin: 0 0 6px; }
.option { display: flex; align-items: center; gap: 10px; padding: 14px; border-radius: 14px;
  border: 1px solid var(--border); background: transparent; color: var(--text); font: 600 15px inherit; cursor: pointer; }
.option:hover { border-color: var(--accent); }
.option small { color: var(--muted); font-weight: 400; margin-left: auto; }

@media (max-width: 480px) {
  .topbar { padding: 12px 16px; }
  .pill { padding: 8px 10px; font-size: 13px; }
}
```

### 6.4 Root — `src/main.tsx`

```tsx
import { createRoot } from 'react-dom/client';
import { EvmProvider } from './wallets/evm';
import { StellarProvider } from './wallets/stellar';
import SwapPage from './pages/SwapPage';

createRoot(document.getElementById('root')!).render(
  <EvmProvider>
    <StellarProvider>
      <SwapPage />
    </StellarProvider>
  </EvmProvider>,
);
```

### 6.5 UI ipuçları

- Widget Studio'da (studio.aurora.dev) renkleri canlı deneyip config'i export edin, sonra `theme` objesine taşıyın.
- `stylePreset: 'bold'` daha dolgun butonlar verir; marka daha "fintech" ise `clean` kalın.
- Ayrı sekmeler istenirse `WidgetSwap`, `WidgetTransfer`, `WidgetWithdraw` bileşenleri tek tek kullanılabilir.
- Belirli bir Stellar ↔ EVM çiftini öne çıkarmak için `defaultSourceToken` / `defaultTargetToken` (NEAR Intents asset ID) ve `priorityAssets` kullanın.
- Sabit alıcı adresi gereken akışlar (ör. ödeme sayfası) için `sendAddress` + `hideSendAddress`.

---

## 7. Gizlilik

### 7.1 Confidential Intents (mainnet — şimdi)

- `confidentialMode`: `'public'` | `'confidential'` | `'user-choice'`
- **Gizlenen:** gönderen, miktar ve rota. İşlem, izinli validatörlerin çalıştırdığı özel bir NEAR shard'ında yürütülür.
- **Görünür kalan:** Stellar / EVM üzerindeki giriş ve çıkış işlemleri.
- **Güven modeli:** TEE (donanım enclave) köprüsü + izinli validatör seti; Temmuz 2026 itibarıyla yayımlanmış bağımsız audit yok.
- UI'da toggle'ın yanına kısa bir açıklama koyun: *"Gizli mod: gönderen/miktar/rota explorer'da görünmez; zincire giriş ve çıkış görünür."*
- ⚠️ Stellar'ın confidential rotada desteklendiğini küçük bir mainnet işlemiyle doğrulayın.

### 7.2 Stellar Private Payments — SPP (testnet — gelecek)

- Nethermind'in privacy pool'u: havuza yatır → içeride transfer → bağlantısız çek.
- **Durum:** yalnızca testnet, audit yok, "gerçek varlıkla production'da kullanmayın" uyarısı var. Mainnet için tarih yok.
- Testnet havuzları: XLM, EURC. SDK: npm'de JS/TS (WASM) — `deposit()`, `transfer()`, `withdraw()`.
- Uyum: Association Set Provider (allow/block list), view key'ler, selective disclosure.

**Plan:** Ayrı bir "Private Send" sekmesi, `VITE_ENABLE_SPP=true` flag'i ve **yalnızca testnet** ağına bağlı. Audit + mainnet dağıtımı çıkınca flag açılır.

```ts
// src/features/flags.ts
export const FLAGS = {
  spp: import.meta.env.VITE_ENABLE_SPP === 'true', // sadece testnet build'lerinde true
};
```

---

## 8. Test Kontrol Listesi (mainnet, küçük miktarlarla)

- [ ] Studio API key doğru, fee (bps) ve alıcı adresi key üzerinde tanımlı
- [ ] EVM → Stellar: ETH (Base) → XLM
- [ ] EVM → Stellar: USDC (Arbitrum) → USDC (Stellar) — alıcıda USDC trustline var
- [ ] Stellar → EVM: XLM → ETH
- [ ] Stellar → EVM: USDC (Stellar) → USDC (Base)
- [ ] Freighter ve xBull ile imzalama (2 farklı Stellar cüzdanı)
- [ ] MetaMask'ta yanlış ağdayken otomatik `wallet_switchEthereumChain`
- [ ] Confidential mod açık/kapalı swap — explorer'da görünürlüğü karşılaştır
- [ ] Hatalar: yetersiz bakiye, reddedilen imza, quote süresi dolması, trustline yok
- [ ] Mobil (≤ 480px) görünüm, dark mode
- [ ] `showTransactionHistory` geçmişi doğru gösteriyor

---

## 9. Sık Karşılaşılan Hatalar

| Hata | Sebep | Çözüm |
|---|---|---|
| `Stellar transfers are not supported. Add the Stellar plugin…` | `plugins.stellar` yok | `plugins: { stellar }` ekle |
| `… Add a Stellar provider …` | `providers.stellar` yok | Stellar cüzdan bağlıyken provider'ı geç |
| `EVM transfers are not supported…` / `… Add an EVM provider …` | `plugins.evm` veya `providers.evm` eksik | EIP-1193 provider'ı ve `evm` plugin'ini geç |
| Wallet chain error `4902` | Cüzdan zinciri tanımıyor | Kullanıcıdan zinciri cüzdana eklemesini iste |
| USDC gönderimi Stellar'da başarısız | Trustline yok | Kullanıcıya USDC trustline ekletecek UI adımı |

---

## 10. Kaynaklar

- [React Widget — NEAR Intents Docs](https://docs.near-intents.org/integration/devkit/react-widget)
- [Supported Chains](https://docs.near-intents.org/resources/chain-support)
- [intents-swap-widget monorepo](https://github.com/aurora-is-near/intents-swap-widget)
- [Stellar adapter README](https://github.com/aurora-is-near/intents-swap-widget/tree/main/packages/intents-swap-widget-stellar)
- [EVM adapter README](https://github.com/aurora-is-near/intents-swap-widget/tree/main/packages/intents-swap-widget-evm)
- [Wallet Connection](https://github.com/aurora-is-near/intents-swap-widget/blob/main/docs/wallet-connection.md) · [Configuration](https://github.com/aurora-is-near/intents-swap-widget/blob/main/docs/configuration.md) · [Theming](https://github.com/aurora-is-near/intents-swap-widget/blob/main/docs/theming.md)
- [NEAR — Confidential Intents](https://www.near.org/blog/confidential-intents)
- [Stellar — Developer Preview: Stellar Private Payments](https://stellar.org/blog/developers/developer-preview-stellar-private-payments)
- [NethermindEth/stellar-private-payments](https://github.com/NethermindEth/stellar-private-payments)
