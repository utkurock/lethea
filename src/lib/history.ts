import { useEffect, useState } from 'react';

export type Range = '1D' | '1W' | '1M' | '3M' | '1Y';
export const RANGES: Range[] = ['1D', '1W', '1M', '3M', '1Y'];

const SPEC: Record<Range, { interval: string; ms: number }> = {
  '1D': { interval: '15m', ms: 864e5 },
  '1W': { interval: '1h', ms: 7 * 864e5 },
  '1M': { interval: '4h', ms: 30 * 864e5 },
  '3M': { interval: '1d', ms: 90 * 864e5 },
  '1Y': { interval: '1d', ms: 365 * 864e5 },
};

export type Point = { t: number; p: number };
export type Stats = { dayVolume: number; openInterest: number; markPx: number };

const HL = 'https://api.hyperliquid.xyz/info';
const post = (body: unknown) =>
  fetch(HL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(
    (r) => r.json(),
  );

type Candle = { t: number; c: string };

export function useHistory(coin: string | undefined, range: Range) {
  const [state, setState] = useState<{ key: string; points: Point[]; error?: boolean }>({ key: '', points: [] });
  const key = `${coin}:${range}`;

  useEffect(() => {
    if (!coin) return;
    let alive = true;
    const { interval, ms } = SPEC[range];
    const now = Date.now();
    post({ type: 'candleSnapshot', req: { coin, interval, startTime: now - ms, endTime: now } })
      .then((rows: Candle[]) => {
        if (alive) setState({ key, points: rows.map((r) => ({ t: r.t, p: Number(r.c) })) });
      })
      .catch(() => alive && setState({ key, points: [], error: true }));
    return () => {
      alive = false;
    };
  }, [coin, range, key]);

  const ready = state.key === key;
  return { points: ready ? state.points : [], loading: !!coin && !ready, error: ready && state.error };
}

type AssetCtx = { dayNtlVlm: string; openInterest: string; markPx: string };

export function usePerpStats(coin: string | undefined) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => {
    if (!coin) return;
    let alive = true;
    setStats(null);
    post({ type: 'metaAndAssetCtxs' })
      .then(([meta, ctxs]: [{ universe: { name: string }[] }, AssetCtx[]]) => {
        const i = meta.universe.findIndex((u) => u.name === coin);
        if (!alive || i < 0) return;
        const c = ctxs[i];
        const markPx = Number(c.markPx);
        setStats({ dayVolume: Number(c.dayNtlVlm), openInterest: Number(c.openInterest) * markPx, markPx });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [coin]);
  return stats;
}
