import { useSyncExternalStore, type MouseEvent } from 'react';

const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  window.addEventListener('popstate', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('popstate', cb);
  };
};

export const usePath = () => useSyncExternalStore(subscribe, () => window.location.pathname);

export function navigate(to: string) {
  if (to === window.location.pathname) return;
  window.history.pushState(null, '', to);
  window.scrollTo(0, 0);
  listeners.forEach((cb) => cb());
}

// onClick for plain <a href>, so links still open in a new tab with a modifier key.
export const linkTo = (to: string) => (e: MouseEvent) => {
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
  e.preventDefault();
  navigate(to);
};
