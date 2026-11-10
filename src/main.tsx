import './polyfills';

// Load the app only after globals exist; static imports would be hoisted above the polyfill.
import('./bootstrap').catch((err: unknown) => {
  console.error(err);
  (window as { __bootFail?: () => void }).__bootFail?.();
});
// The swap widget, by far the largest chunk, is fetched when SwapSlot first renders. Fetching it here as
// well made it compete with the app shell for bandwidth and pushed the first paint back on slow links.
