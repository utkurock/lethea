import './polyfills';

// Load the app only after globals exist; static imports would be hoisted above the polyfill.
import('./bootstrap').catch((err: unknown) => {
  console.error(err);
  (window as { __bootFail?: () => void }).__bootFail?.();
});
// The landing and token pages open on the swap widget, the largest chunk: fetch it alongside the app.
if (!/^\/(docs|private)/.test(location.pathname)) import('./components/SwapBox').catch(() => {}); // SwapSlot retries and reports it
