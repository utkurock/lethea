import { useEffect, useRef, useState } from 'react';

// 8x8 Bayer matrix, normalised to 0..1 thresholds.
const BAYER = [
  0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52,
  20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13,
  45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21,
].map((v) => (v + 0.5) / 64);

const CELL = 4; // px per dither cell
const DOT = 2; // lit square inside each cell, the gap is what reads as "dotted"
const FRAME_MS = 80;

// Value noise with smooth interpolation, summed over octaves (fbm) for an organic field.
const hash = (x: number, y: number) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const noise = (x: number, y: number) => {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash(xi, yi);
  const b = hash(xi + 1, yi);
  const c = hash(xi, yi + 1);
  const d = hash(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};
const fbm = (x: number, y: number) =>
  noise(x, y) * 0.5 + noise(x * 2.03, y * 2.03) * 0.28 + noise(x * 4.1, y * 4.1) * 0.14 + noise(x * 8.3, y * 8.3) * 0.08;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/* Mascot: a small ghost, shaded in greyscale and dithered on the same grid as the field. */

const GHOST_W = 52; // cells, at full size
const GHOST_H = 60;
const HALO = 1; // cells of empty space kept around the silhouette

type Sprite = { w: number; h: number; tones: Float32Array; owned: Uint8Array };

/**
 * Renders the ghost at a depth and a turn, as a tone map (-1 outside the silhouette, else 0 to 1)
 * plus the cells it owns (silhouette grown by HALO). `turn` runs -1 (facing left) to 1 (facing right):
 * the body narrows, the face slides toward that side and the light wraps around, which is what reads
 * as a figure turning in space rather than a flat sticker sliding.
 */
function ghostSprite(blink: boolean, turn: number, scale: number): Sprite {
  const w = Math.max(6, Math.round(GHOST_W * scale));
  const h = Math.max(7, Math.round(GHOST_H * scale));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  g.scale(w / GHOST_W, h / GHOST_H);

  const W = GHOST_W;
  const H = GHOST_H;
  const r = W * 0.42;
  const cx = W / 2;
  const top = r + 2;
  const hem = H - 6;
  const side = Math.abs(turn);

  // Lean into the direction of travel, and narrow as the body turns side-on.
  g.translate(cx, H / 2);
  g.rotate(turn * 0.14);
  g.scale(1 - 0.2 * side, 1);
  g.translate(-cx, -H / 2);

  // Body: dome, straight sides, three soft scallops at the hem.
  g.beginPath();
  g.moveTo(cx - r, top);
  g.arc(cx, top, r, Math.PI, 0);
  g.lineTo(cx + r, hem);
  const bumps = 3;
  const bw = (2 * r) / bumps;
  for (let i = 0; i < bumps; i++) {
    const x0 = cx + r - i * bw;
    g.quadraticCurveTo(x0 - bw / 2, hem + 8, x0 - bw, hem);
  }
  g.closePath();
  // Light from the upper left, sliding across the dome as the ghost turns.
  const lx = cx - r * 0.45 + turn * r * 0.4;
  const shade = g.createRadialGradient(lx, top - r * 0.35, 1, cx + turn * r * 0.2, top + r * 0.5, H * 0.75);
  shade.addColorStop(0, '#fff');
  shade.addColorStop(0.35, '#b4b4b4');
  shade.addColorStop(0.75, '#4a4a4a');
  shade.addColorStop(1, '#1a1a1a');
  g.fillStyle = shade;
  g.fill();

  // Eyes are holes in the dots. Turned, they crowd toward one side and the far one foreshortens.
  const eyeY = top + 2;
  const face = turn * r * 0.34;
  const gap = r * 0.38 * (1 - 0.4 * side);
  for (const dir of [-1, 1]) {
    const ex = cx + face + dir * gap;
    const far = dir === -Math.sign(turn) ? 1 - 0.45 * side : 1;
    g.fillStyle = '#000';
    if (blink) {
      g.fillRect(ex - 4 * far, eyeY, 8 * far, 2);
    } else {
      g.beginPath();
      g.ellipse(ex, eyeY, 4.2 * far, 5.4, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.fillRect(ex - 2 * far, eyeY - 3, 2 * far, 2);
    }
  }
  // A small closed smile, following the face.
  g.strokeStyle = '#000';
  g.lineWidth = 1.6;
  g.beginPath();
  g.arc(cx + 1 + face, eyeY + 7, 4 * (1 - 0.3 * side), 0.15 * Math.PI, 0.85 * Math.PI);
  g.stroke();

  // Farther away is fainter: fewer dots light up.
  const depth = 0.55 + 0.45 * scale;
  const px = g.getImageData(0, 0, w, h).data;
  const tones = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = px[i * 4 + 3] / 255;
    tones[i] = a < 0.5 ? -1 : (px[i * 4] / 255) * a * depth;
  }

  const OW = w + HALO * 2;
  const owned = new Uint8Array(OW * (h + HALO * 2));
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      if (tones[y * w + x] < 0) continue;
      for (let dy = 0; dy <= HALO * 2; dy++)
        for (let dx = 0; dx <= HALO * 2; dx++) owned[(y + dy) * OW + (x + dx)] = 1;
    }
  return { w, h, tones, owned };
}

/* Flights: the ghost is away most of the time, then turns up in one of a few ways, from any edge. */

const AWAY_MIN = 10; // s between flights
const AWAY_MAX = 24;
const FIRST = 3;
const WORDS = ['psst…', 'shh…', 'boo', 'hi', 'psst…'];

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)];
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;
const easeOut = (k: number) => 1 - (1 - k) ** 3;
const easeIn = (k: number) => k * k * k;

type Pt = { x: number; y: number };
const quad = (a: Pt, c: Pt, b: Pt, e: number): Pt => ({
  x: (1 - e) ** 2 * a.x + 2 * (1 - e) * e * c.x + e * e * b.x,
  y: (1 - e) ** 2 * a.y + 2 * (1 - e) * e * c.y + e * e * b.y,
});

/** A pose in cells, centred on the ghost. `turn` is only set where the flight wants it; otherwise it faces its motion. */
type Pose = Pt & { scale: number; turn?: number; talk?: boolean };
type Flight = { at: number; path: (k: number, t: number) => Pose | null; words?: string; talkFor?: number };

type Side = 'left' | 'right' | 'top' | 'bottom';
const SIDES: Side[] = ['left', 'right', 'top', 'bottom'];

/** A point just off screen on one edge, anywhere along it. */
function offscreen(side: Side, cols: number, rows: number): Pt {
  const m = GHOST_H * 0.9;
  if (side === 'left') return { x: -m, y: rand(rows * 0.15, rows * 0.85) };
  if (side === 'right') return { x: cols + m, y: rand(rows * 0.15, rows * 0.85) };
  if (side === 'top') return { x: rand(cols * 0.1, cols * 0.9), y: -m };
  return { x: rand(cols * 0.1, cols * 0.9), y: rows + m };
}

/** Swoops in from one edge to a free spot, hangs around there, and leaves by another edge. */
function visit(spot: Pt, cols: number, rows: number, size: number): Flight {
  const from = offscreen(pick(SIDES), cols, rows);
  const to = offscreen(pick(SIDES), cols, rows);
  const bend = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2 + rand(-40, 40), y: (a.y + b.y) / 2 - rand(0, 40) });
  const c1 = bend(from, spot);
  const c2 = bend(spot, to);
  const enter = rand(1.8, 2.8);
  const stay = rand(3.6, 5.4);
  const leave = rand(1.6, 2.6);
  const trick = pick(['bob', 'bob', 'loop', 'spin'] as const);
  return {
    at: 0,
    words: pick(WORDS),
    talkFor: stay,
    path: (k, t) => {
      if (k < enter) {
        const e = easeOut(k / enter);
        return { ...quad(from, c1, spot, e), scale: lerp(0.3, 1, e) * size };
      }
      k -= enter;
      if (k < stay) {
        const p: Pose = {
          x: spot.x + Math.sin(t * 0.9) * 1.5,
          y: spot.y + Math.sin(t * 1.3) * 1.5,
          scale: size,
          turn: Math.sin(t * 0.7) * 0.22,
          talk: true,
        };
        // A trick right after arriving: a loop-the-loop, or a full turn on the spot.
        if (trick === 'loop' && k < 1.8) {
          const a = (Math.PI * 2 * k) / 1.8;
          p.x += Math.sin(a) * 12;
          p.y -= (1 - Math.cos(a)) * 12;
          p.scale = size * (1 - 0.15 * Math.sin(a / 2));
          p.turn = undefined;
        } else if (trick === 'spin' && k < 1.4) {
          p.turn = Math.sin((Math.PI * 4 * k) / 1.4) * 0.95;
        }
        return p;
      }
      k -= stay;
      if (k < leave) {
        const e = easeIn(k / leave);
        return { ...quad(spot, c2, to, e), scale: lerp(1, 0.3, e) * size };
      }
      return null;
    },
  };
}

/** Crosses the whole screen without stopping, coming near in the middle, passing behind the page. */
function flyby(cols: number, rows: number, size: number): Flight {
  const side = pick(SIDES);
  const opposite: Record<Side, Side> = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' };
  const from = offscreen(side, cols, rows);
  const to = offscreen(Math.random() < 0.7 ? opposite[side] : pick(SIDES.filter((x) => x !== side)), cols, rows);
  const c = { x: rand(cols * 0.2, cols * 0.8), y: rand(rows * 0.2, rows * 0.8) };
  const dur = rand(4.5, 7.5);
  const near = rand(0.55, 1.05); // how close it comes at the middle of the pass
  const wave = rand(3, 8);
  return {
    at: 0,
    path: (k) => {
      if (k >= dur) return null;
      const e = k / dur;
      const p = quad(from, c, to, e);
      return { x: p.x, y: p.y + Math.sin(e * Math.PI * 3) * wave, scale: size * (0.3 + (near - 0.3) * Math.sin(Math.PI * e)) };
    },
  };
}

/** Pokes its head in from the bottom or a side edge, looks around, and ducks back out. */
function peek(at: Pt, edge: 'bottom' | 'left' | 'right', hidden: Pt, size: number): Flight {
  const rise = rand(0.7, 1.1);
  const hold = rand(2.4, 3.6);
  const duck = rand(0.45, 0.7);
  const lean = edge === 'left' ? 0.5 : edge === 'right' ? -0.5 : 0;
  return {
    at: 0,
    words: pick(WORDS),
    talkFor: hold,
    path: (k) => {
      if (k < rise) {
        const e = easeOut(k / rise);
        return { x: lerp(hidden.x, at.x, e), y: lerp(hidden.y, at.y, e), scale: size, turn: lean };
      }
      k -= rise;
      if (k < hold) return { ...at, scale: size, turn: lean + Math.sin(k * 1.9) * 0.6, talk: true };
      k -= hold;
      if (k < duck) {
        const e = easeIn(k / duck);
        return { x: lerp(at.x, hidden.x, e), y: lerp(at.y, hidden.y, e), scale: size, turn: lean };
      }
      return null;
    },
  };
}

// Everything text or UI sits on. The field flows under these too, only dimmer.
const CLEAR = [
  '.logo', '.links', '.nav-right', '.hero h1', '.hero p', '#swap-root', '.mode-note',
  '.token-main > *', '.token-buy', '.external-switch', '.private-card', '.private-page .mode-note', '.psst',
  '.docs-toc', '.docs-head > *', '.doc-section > *',
].join(',');
const PAD = 2; // px around each box that stays at the dimmest level
const FALL = 40; // px over which the dots brighten back, so no edge shows
// Rows that span the page get a tight fade over their text line only; the long one reads as a dark band.
// inset: px trimmed off the box's top and bottom, down to the text line.
const STRIPS = [
  { sel: '.ticker', inset: 10 },
  { sel: '.foot > *', inset: 0 },
];
const STRIP_FALL = 10;

type Props = {
  /** Dot colour as [r, g, b, alpha]. */
  dot: [number, number, number, number];
};

type Bubble = { x: number; y: number; words: string; secs: number } | null;
type Box = { left: number; right: number; top: number; bottom: number };

export function DitherField({ dot }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [bubble, setBubble] = useState<Bubble>(null);

  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    const still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Packed little-endian as ABGR for the Uint32 view. The ghost is drawn well above the field so it reads as a figure.
    const pack = (a: number) => ((a << 24) | (dot[2] << 16) | (dot[1] << 8) | dot[0]) >>> 0;
    // The pattern never breaks. Behind content the dots only dim, in 8 steps, down to DIM of full strength;
    // clearing them outright left dark patches behind every box.
    const DIM = 0.35;
    const fieldColors = Array.from({ length: 8 }, (_, i) => pack(Math.round(dot[3] * (DIM + (1 - DIM) * (i / 7)))));
    const ghostColor = pack(Math.min(255, dot[3] + 120));
    // Poses are quantised so a flight reuses a few dozen sprites instead of drawing one per frame.
    const sprites = new Map<string, Sprite>();
    const sprite = (blink: boolean, turn: number, scale: number) => {
      const tq = Math.round(turn * 10) / 10;
      const sq = Math.round(scale * 20) / 20;
      const key = `${blink ? 1 : 0}:${tq}:${sq}`;
      let sp = sprites.get(key);
      if (!sp) sprites.set(key, (sp = ghostSprite(blink, tq, sq)));
      return sp;
    };

    let img: ImageData;
    let buf: Uint32Array;
    let cols = 0;
    let rows = 0;
    let mask = new Float32Array(0); // per cell: 0 = behind content (dimmest), 1 = open page (full)
    let field = new Float32Array(0); // half-resolution tone, refreshed each frame
    let boxes: Box[] = []; // content boxes in px, where the ghost may not stop
    let flight: Flight | null = null;
    let nextFlight = FIRST;
    let bubbleOn = false;
    let lastKey = '';

    const resize = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      cols = Math.ceil(w / CELL);
      rows = Math.ceil(h / CELL);
      img = ctx.createImageData(w, h);
      buf = new Uint32Array(img.data.buffer);
      mask = new Float32Array(cols * rows);
      field = new Float32Array(Math.ceil(cols / 2) * Math.ceil(rows / 2));
      lastKey = '';
      measure();
    };

    // Reads where the content sits and rebuilds the clear mask when the layout changed.
    const measure = () => {
      const box = (el: Element, inset: number, fall: number) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right, top: r.top + inset, bottom: r.bottom - inset, fall };
      };
      const rects = [
        ...[...document.querySelectorAll(CLEAR)].map((el) => box(el, 0, FALL)),
        ...STRIPS.flatMap(({ sel, inset }) =>
          [...document.querySelectorAll(sel)].map((el) => box(el, inset, STRIP_FALL)),
        ),
      ].filter((r) => {
        // Boxes scrolled out of view can't reach the canvas; skipping them keeps long pages cheap.
        const reach = PAD + r.fall;
        return (
          r.right > r.left && r.bottom > r.top &&
          r.bottom > -reach && r.top < window.innerHeight + reach &&
          r.right > -reach && r.left < window.innerWidth + reach
        );
      });
      boxes = rects;
      const key = rects.map((r) => `${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}`).join(';');
      if (key === lastKey) return;
      lastKey = key;

      for (let cy = 0; cy < rows; cy++) {
        const y = cy * CELL + DOT / 2;
        for (let cx = 0; cx < cols; cx++) {
          const x = cx * CELL + DOT / 2;
          let m = 1;
          for (const r of rects) {
            const dx = Math.max(r.left - x, 0, x - r.right);
            const dy = Math.max(r.top - y, 0, y - r.bottom);
            m = Math.min(m, smooth(PAD, PAD + r.fall, Math.hypot(dx, dy)));
          }
          mask[cy * cols + cx] = m;
        }
      }

    };

    /** True when a ghost-sized box centred at (x, y) cells, clipped to the screen, touches no content. */
    const clear = (x: number, y: number, w: number, h: number) => {
      const gap = 12; // px
      const l = Math.max(0, (x - w / 2) * CELL) - gap;
      const r = Math.min(window.innerWidth, (x + w / 2) * CELL) + gap;
      const tp = Math.max(0, (y - h / 2) * CELL) - gap;
      const b = Math.min(window.innerHeight, (y + h / 2) * CELL) + gap;
      return boxes.every((o) => o.right < l || o.left > r || o.bottom < tp || o.top > b);
    };

    /** Tries random spots until one is clear; null when the page leaves no room. */
    const findSpot = (w: number, h: number, sample: () => Pt) => {
      for (let i = 0; i < 40; i++) {
        const p = sample();
        if (clear(p.x, p.y, w, h)) return p;
      }
      return null;
    };

    const newFlight = (t: number): Flight => {
      const size = rand(0.75, 1.1);
      const w = GHOST_W * size;
      const h = GHOST_H * size;
      const roll = Math.random();
      let f: Flight | null = null;
      if (roll < 0.45) {
        const spot = findSpot(w, h, () => ({ x: rand(w / 2 + 2, cols - w / 2 - 2), y: rand(h / 2 + 2, rows - h / 2 - 2) }));
        if (spot) f = visit(spot, cols, rows, size);
      } else if (roll < 0.75) {
        const edge = pick(['bottom', 'bottom', 'left', 'right'] as const);
        // Two thirds of the ghost shows; the rest stays past the edge.
        const at =
          edge === 'bottom'
            ? findSpot(w, h * 0.7, () => ({ x: rand(w / 2 + 2, cols - w / 2 - 2), y: rows - h * 0.35 }))
            : findSpot(w * 0.6, h, () => ({ x: edge === 'left' ? w * 0.3 : cols - w * 0.3, y: rand(h / 2 + 2, rows - h / 2 - 2) }));
        if (at) {
          const spot = edge === 'bottom' ? { x: at.x, y: rows - h * 0.3 } : { x: edge === 'left' ? w * 0.1 : cols - w * 0.1, y: at.y };
          const hidden = edge === 'bottom' ? { x: spot.x, y: rows + h * 0.6 } : { x: edge === 'left' ? -w * 0.6 : cols + w * 0.6, y: spot.y };
          f = peek(spot, edge, hidden, size);
        }
      }
      // A flyby needs no free spot, so it is also the fallback on crowded pages.
      f ??= flyby(cols, rows, size);
      f.at = t;
      return f;
    };

    const showBubble = (p: Pose | null, sp: Sprite | null) => {
      const on = !!(p?.talk && sp && flight?.words);
      if (on === bubbleOn) return;
      bubbleOn = on;
      setBubble(
        on
          ? {
              x: Math.min(window.innerWidth - 60, (p!.x + sp!.w * 0.22) * CELL),
              y: Math.max(24, (p!.y - sp!.h / 2) * CELL - 8),
              words: flight!.words!,
              secs: flight!.talkFor ?? 4,
            }
          : null,
      );
    };

    const plot = (cx: number, cy: number, color: number) => {
      const w = canvas.width;
      const px = cx * CELL;
      const py = cy * CELL;
      for (let dy = 0; dy < DOT && py + dy < canvas.height; dy++) {
        const row = (py + dy) * w + px;
        for (let dx = 0; dx < DOT && px + dx < w; dx++) buf[row + dx] = color;
      }
    };

    const draw = (t: number) => {
      buf.fill(0);

      // Schedule and advance the flight.
      if (!flight && t >= nextFlight && cols > 0) flight = newFlight(t);
      const k = flight ? t - flight.at : 0;
      const p = flight ? flight.path(k, t) : null;
      if (flight && !p) {
        flight = null;
        nextFlight = t + rand(AWAY_MIN, AWAY_MAX);
      }
      let turn = 0;
      if (p) {
        // Face the direction of travel unless the flight says otherwise.
        const ahead = flight!.path(k + 0.08, t + 0.08);
        const vx = ahead ? (ahead.x - p.x) / 0.08 : 0;
        turn = p.turn ?? Math.max(-0.9, Math.min(0.9, vx / 45));
      }
      const sp = p ? sprite(!!p.talk && t % 3.1 > 2.95, turn, p.scale) : null;
      showBubble(p, sp);
      // Whole cells, so the ghost stays on the grid.
      const gx = sp ? Math.round(p!.x - sp.w / 2) : 0;
      const gy = sp ? Math.round(p!.y - sp.h / 2) : 0;

      // Domain-warped fbm at half resolution: a slow flow of islands and voids rather than an even haze.
      const hc = Math.ceil(cols / 2);
      const hr = Math.ceil(rows / 2);
      for (let y = 0; y < hr; y++) {
        for (let x = 0; x < hc; x++) {
          const px = x * 0.05;
          const py = y * 0.05;
          const q = fbm(px * 0.6 + t * 0.02, py * 0.6 - t * 0.015);
          const n = fbm(px + q * 1.8 + t * 0.03, py - q * 1.4 - t * 0.02);
          const islands = smooth(0.3, 0.72, fbm(px * 0.35 - t * 0.01, py * 0.35 + 3.1));
          const edge = 0.55 + 0.45 * smooth(0.1, 0.5, Math.abs(x / hc - 0.5));
          field[y * hc + x] = (0.08 + 0.8 * smooth(0.36, 0.8, n)) * (0.45 + 0.55 * islands) * edge;
        }
      }

      for (let cy = 0; cy < rows; cy++) {
        for (let cx = 0; cx < cols; cx++) {
          const threshold = BAYER[(cy & 7) * 8 + (cx & 7)];

          if (sp) {
            const lx = cx - gx;
            const ly = cy - gy;
            // The silhouette plus a thin halo belongs to the ghost alone, so the two never interleave.
            if (
              lx >= -HALO && lx < sp.w + HALO && ly >= -HALO && ly < sp.h + HALO &&
              sp.owned[(ly + HALO) * (sp.w + HALO * 2) + lx + HALO]
            ) {
              const inside = lx >= 0 && lx < sp.w && ly >= 0 && ly < sp.h;
              // Passing behind content it fades, as if further back than the page.
              const v = inside ? sp.tones[ly * sp.w + lx] * (0.3 + 0.7 * mask[cy * cols + cx]) : -1;
              if (v > threshold) plot(cx, cy, ghostColor);
              continue;
            }
          }

          if (field[(cy >> 1) * hc + (cx >> 1)] > threshold) {
            plot(cx, cy, fieldColors[Math.round(mask[cy * cols + cx] * 7)]);
          }
        }
      }
      ctx.putImageData(img, 0, 0);
    };

    resize();
    draw(0);
    const onResize = () => {
      resize();
      draw(0);
    };
    window.addEventListener('resize', onResize);
    // Content moves on navigation and while the widget loads, so the mask is re-read now and then.
    const poll = setInterval(measure, 500);
    // Scrolling moves every box at once; re-read on the next frame so the dim areas follow the text.
    let scrollRaf = 0;
    const onScroll = () => {
      if (scrollRaf) return;
      scrollRaf = requestAnimationFrame(() => {
        scrollRaf = 0;
        measure();
        if (still) draw(0);
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    if (still) {
      // Reduced motion: the field holds still and the ghost does not fly.
      nextFlight = Infinity;
      const redraw = setInterval(() => draw(0), 500);
      return () => {
        clearInterval(poll);
        clearInterval(redraw);
        cancelAnimationFrame(scrollRaf);
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onScroll);
      };
    }

    let raf = 0;
    let last = 0;
    const start = performance.now();
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      if (document.hidden || now - last < FRAME_MS) return;
      last = now;
      draw((now - start) / 1000);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      cancelAnimationFrame(scrollRaf);
      clearInterval(poll);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll);
    };
  }, [dot]);

  return (
    <>
      <canvas ref={ref} className="dither" aria-hidden />
      {bubble && (
        <span
          className="psst"
          style={{ left: bubble.x, top: bubble.y, animationDuration: `${bubble.secs}s` }}
          aria-hidden
        >
          {bubble.words}
        </span>
      )}
    </>
  );
}
