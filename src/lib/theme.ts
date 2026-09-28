import type { Theme } from '@aurora-is-near/intents-swap-widget';

// Silver is the one brand colour. CSS tokens live in swap.css; these are the values code needs as literals.
export const ACCENT = '#c9ced6';
export const SURFACE = '#16171a';

/** Dither dot colour as [r, g, b, alpha]. */
export const DOT: [number, number, number, number] = [201, 206, 214, 64];

export const WIDGET_THEME: Theme = {
  colorScheme: 'dark',
  accentColor: ACCENT,
  backgroundColor: SURFACE,
  successColor: '#22c55e',
  warningColor: '#f59e0b',
  errorColor: '#ef4444',
  stylePreset: 'clean',
  borderRadius: 'md',
  showContainer: false,
};
