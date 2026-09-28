export const FLAGS = {
  // Stellar Private Payments: testnet only, unaudited. Keep false on mainnet builds.
  spp: import.meta.env.VITE_ENABLE_SPP === 'true',
};
