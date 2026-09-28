import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SwapPage from './pages/SwapPage';
import { EvmProvider } from './wallets/evm';
import { NearProvider } from './wallets/near';
import { SolanaProvider } from './wallets/solana';
import { StellarProvider } from './wallets/stellar';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <EvmProvider>
      <StellarProvider>
        <SolanaProvider>
          <NearProvider>
            <SwapPage />
          </NearProvider>
        </SolanaProvider>
      </StellarProvider>
    </EvmProvider>
  </StrictMode>,
);
