import { useEffect, useRef, useState } from 'react';
import type { Point, Range } from '../lib/history';
import { fmtUsd } from '../lib/tokens';

// Same 4x4 corner of the Bayer matrix the page background uses, so the fill reads as one system.
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16);
const CELL = 4;
const DOT = 2;
const PAD_Y = 12;

type Props = { points: Point[]; range: Range; color: string };

const fmtTime = (t: number, range: Range) =>
  new Date(t).toLocaleString('en-US', range === '1D' || range === '1W'
    ? { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }
    : { month: 'short', day: 'numeric', year: 'numeric' });

export function PriceChart({ points, range, color }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  const min = n ? Math.min(...points.map((p) => p.p)) : 0;
  const max = n ? Math.max(...points.map((p) => p.p)) : 1;
  const xAt = (i: number) => (n > 1 ? (i / (n - 1)) * size.w : 0);
  const yAt = (p: number) => PAD_Y + (1 - (p - min) / (max - min || 1)) * (size.h - PAD_Y * 2);

  useEffect(() => {
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx || !size.w || n < 2) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = Math.round(size.w * dpr);
    c.height = Math.round(size.h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size.w, size.h);

    // Line height at any x, by linear interpolation between samples.
    const lineY = (x: number) => {
      const f = (x / size.w) * (n - 1);
      const i = Math.min(n - 2, Math.floor(f));
      const k = f - i;
      return yAt(points[i].p) * (1 - k) + yAt(points[i + 1].p) * k;
    };

    // Dither fill: dense right under the line, thinning toward the bottom.
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    for (let cx = 0; cx * CELL < size.w; cx++) {
      const x = cx * CELL;
      const top = lineY(Math.min(size.w, x + DOT / 2));
      for (let cy = Math.ceil(top / CELL); cy * CELL < size.h; cy++) {
        const y = cy * CELL;
        const tone = 0.7 * (1 - (y - top) / (size.h - top || 1));
        if (tone > BAYER4[(cy & 3) * 4 + (cx & 3)]) ctx.fillRect(x, y, DOT, DOT);
      }
    }

    ctx.globalAlpha = 1;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.75;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach((pt, i) => (i ? ctx.lineTo(xAt(i), yAt(pt.p)) : ctx.moveTo(xAt(i), yAt(pt.p))));
    ctx.stroke();
  }, [points, size, color]);

  const onMove = (e: React.PointerEvent) => {
    if (n < 2) return;
    const r = wrap.current!.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * (n - 1));
    setHover(Math.max(0, Math.min(n - 1, i)));
  };

  const h = hover !== null && n > 1 ? points[hover] : null;

  return (
    <div className="chart" ref={wrap} onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
      <canvas ref={canvas} style={{ width: size.w, height: size.h }} />
      {h && (
        <>
          <span className="chart-cross" style={{ left: xAt(hover!) }} />
          <span className="chart-dot" style={{ left: xAt(hover!), top: yAt(h.p), background: color }} />
          <span
            className="chart-tip"
            style={{ left: Math.min(Math.max(xAt(hover!), 70), size.w - 70) }}
          >
            <b>${fmtUsd(h.p)}</b>
            {fmtTime(h.t, range)}
          </span>
        </>
      )}
    </div>
  );
}
