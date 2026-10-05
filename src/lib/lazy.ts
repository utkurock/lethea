import { lazy, type ComponentType } from 'react';

const RELOADED = 'lethea:chunk-reload';

const read = () => {
  try {
    return sessionStorage.getItem(RELOADED);
  } catch {
    return null;
  }
};

const write = (value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(RELOADED);
    else sessionStorage.setItem(RELOADED, value);
    return true;
  } catch {
    return false;
  }
};

/**
 * React.lazy for split chunks. A chunk that won't load is usually one a newer deploy replaced (the SPA
 * rewrite answers its old URL with index.html), so the first failure reloads onto the current build.
 * A failure right after that reload is real and reaches the nearest error boundary. Without storage
 * there is no way to tell the two apart, so it never reloads rather than risk a loop.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyChunk<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().then(
      (m) => {
        write(null);
        return m;
      },
      (err: unknown) => {
        if (read() || !write('1')) throw err;
        location.reload();
        return new Promise<never>(() => {});
      },
    ),
  );
}
