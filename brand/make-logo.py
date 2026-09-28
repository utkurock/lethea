"""Renders the Lethea ghost as brand images, with the same geometry and shading as DitherField.tsx.

python3 brand/make-logo.py  ->  brand/*.jpg (X/Twitter) and public/ icons (favicon, touch icon).
"""
import math
from pathlib import Path
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
BG = (12, 12, 14)          # --bg
DOT = (230, 233, 238)      # silver dots, as bright as the site's ghost
SILVER_LO = (111, 114, 122)  # --ink-4
SILVER_HI = (245, 245, 246)  # --ink

W, H = 52, 60              # ghost units, same as GHOST_W / GHOST_H
BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52,
         20, 62, 30, 54, 22, 3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13,
         45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21]
BAYER = [(v + 0.5) / 64 for v in BAYER]

r = W * 0.42
cx = W / 2
top = r + 2
hem = H - 6
eye_y = top + 2


def body_polygon(steps=64):
    pts = [(cx + r * math.cos(math.pi + math.pi * i / steps), top + r * math.sin(math.pi + math.pi * i / steps))
           for i in range(steps + 1)]
    pts.append((cx + r, hem))
    bw = 2 * r / 3
    for i in range(3):
        x0 = cx + r - i * bw
        c = (x0 - bw / 2, hem + 8)
        e = (x0 - bw, hem)
        s = pts[-1]
        for j in range(1, 17):
            k = j / 16
            pts.append(((1 - k) ** 2 * s[0] + 2 * (1 - k) * k * c[0] + k * k * e[0],
                        (1 - k) ** 2 * s[1] + 2 * (1 - k) * k * c[1] + k * k * e[1]))
    return pts


def tone_map(scale):
    """Greyscale render at `scale` px per ghost unit: body shading 0..255, eyes/smile at 0, outside transparent."""
    w, h = round(W * scale), round(H * scale)
    shade = Image.new('L', (w, h), 0)
    alpha = Image.new('L', (w, h), 0)
    ImageDraw.Draw(alpha).polygon([(x * scale, y * scale) for x, y in body_polygon()], fill=255)
    # Radial light from the upper left, the canvas gradient's stops.
    fx, fy = cx - r * 0.45, top - r * 0.35
    rad = H * 0.75
    stops = [(0, 255), (0.35, 180), (0.75, 74), (1, 26)]
    px = shade.load()
    for y in range(h):
        for x in range(w):
            t = min(1, math.hypot(x / scale - fx, y / scale - fy) / rad)
            for (a, va), (b, vb) in zip(stops, stops[1:]):
                if t <= b:
                    px[x, y] = round(va + (vb - va) * (t - a) / (b - a))
                    break
    d = ImageDraw.Draw(shade)
    for ex in (cx - r * 0.38, cx + r * 0.38):
        d.ellipse([(ex - 4.2) * scale, (eye_y - 5.4) * scale, (ex + 4.2) * scale, (eye_y + 5.4) * scale], fill=0)
        d.rectangle([(ex - 2) * scale, (eye_y - 3) * scale, ex * scale - 1, (eye_y - 1) * scale - 1], fill=255)
    d.arc([(cx + 1 - 4) * scale, (eye_y + 7 - 4) * scale, (cx + 1 + 4) * scale, (eye_y + 7 + 4) * scale],
          start=0.15 * 180, end=0.85 * 180, fill=0, width=max(1, round(1.6 * scale)))
    return shade, alpha


def dithered(size, ghost_h_frac=0.62, cell_frac=None):
    """The site's look: one ghost cell per grid cell, a lit square in each lit cell."""
    cell = size * ghost_h_frac / H
    shade, alpha = tone_map(1)
    img = Image.new('RGB', (size, size), BG)
    d = ImageDraw.Draw(img)
    ox = (size - W * cell) / 2
    oy = (size - H * cell) / 2 + cell
    dot = cell / 2
    for y in range(H):
        for x in range(W):
            if alpha.getpixel((x, y)) < 128:
                continue
            raw = shade.getpixel((x, y))
            # A floor on the body tone so the hem and the lower half still read at avatar size.
            v = 0 if raw < 10 else 0.3 + 0.7 * raw / 255
            if v > BAYER[(y & 7) * 8 + (x & 7)]:
                x0, y0 = ox + x * cell, oy + y * cell
                d.rectangle([x0, y0, x0 + dot - 1, y0 + dot - 1], fill=DOT)
    return img


def solid(size, pad=0.1, bg=BG, radius=0.22):
    """Small sizes: the silhouette filled in silver, shaded, with the eyes cut out."""
    ss = 4
    S = size * ss
    scale = S * (1 - 2 * pad) / H
    shade, alpha = tone_map(scale)
    lut = [tuple(round(lo + (hi - lo) * (0.35 + 0.65 * v / 255)) for lo, hi in zip(SILVER_LO, SILVER_HI))
           for v in range(256)]
    colour = Image.new('RGB', shade.size)
    colour.putdata([lut[v] if v > 20 else BG for v in shade.getdata()])
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    if bg:
        ImageDraw.Draw(img).rounded_rectangle([0, 0, S - 1, S - 1], radius=round(S * radius), fill=bg + (255,))
    img.paste(colour, ((S - shade.width) // 2, round(S * pad) + round(scale * 1.5)), alpha)
    return img.resize((size, size), Image.LANCZOS)


brand = ROOT / 'brand'
public = ROOT / 'public'
for s in (400, 1000):
    dithered(s).save(brand / f'lethea-avatar-{s}.jpg', quality=95, subsampling=0)
solid(1024, pad=0.14, radius=0).convert('RGB').save(brand / 'lethea-mark-solid-1024.jpg', quality=95, subsampling=0)

solid(32, pad=0.06, radius=0.25).save(public / 'favicon-32.png')
solid(180, pad=0.14, radius=0).convert('RGB').save(public / 'apple-touch-icon.png')
solid(512, pad=0.14).save(public / 'icon-512.png')
solid(48, pad=0.06, radius=0.25).save(public / 'favicon.ico', sizes=[(16, 16), (32, 32), (48, 48)])
print('ok')
