#!/usr/bin/env python3
"""Generates the iOS launch images (public/splash) for the home-screen app: the Pulse mark centred on the page colour,
light and dark, portrait only. Run `python3 scripts/generate-splash.py` after changing the logo or page colours;
keep SPLASH_DEVICES in src/lib/splash-screens.ts in sync with DEVICES below."""
import math
from PIL import Image, ImageDraw

DEVICES = [  # css width, css height, device pixel ratio
    (440, 956, 3), (402, 874, 3), (430, 932, 3), (428, 926, 3), (393, 852, 3), (390, 844, 3), (375, 812, 3),
    (414, 896, 3), (414, 896, 2), (414, 736, 3), (375, 667, 2),
    (820, 1180, 2), (834, 1194, 2), (834, 1112, 2), (810, 1080, 2), (1024, 1366, 2), (1032, 1376, 2), (744, 1133, 2), (768, 1024, 2),
]
THEMES = {"light": ((245, 244, 239), (208, 237, 119), (23, 60, 45)), "dark": ((15, 20, 18), (208, 237, 119), (23, 60, 45))}
SS = 4  # supersampling


def mark(size, tile, ink):
    """Returns the tilted mark on a transparent canvas 1.4x its size, so the rotation does not clip the corners."""
    big = size * SS
    pad = int(big * 0.2)
    img = Image.new("RGBA", (big + 2 * pad, big + 2 * pad), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((pad, pad, pad + big - 1, pad + big - 1), radius=int(big * 0.31), fill=tile + (255,))
    # The pulse line from AppLogo (24 x 24 viewBox, scaled into the middle 55% of the tile).
    pts = [(3, 12), (7, 12), (9.2, 6), (13.2, 18), (15.5, 12), (21, 12)]
    scale, off = big * 0.55 / 18, pad + big * 0.225
    xy = [(off + (x - 3) * scale, pad + big * 0.5 + (y - 12) * scale) for x, y in pts]
    d.line(xy, fill=ink + (255,), width=int(big * 0.062), joint="curve")
    for x, y in (xy[0], xy[-1]):
        r = big * 0.031
        d.ellipse((x - r, y - r, x + r, y + r), fill=ink + (255,))
    img = img.rotate(4, resample=Image.BICUBIC, expand=False)
    return img.resize((img.width // SS, img.height // SS), Image.LANCZOS)


for name, (bg, tile, ink) in THEMES.items():
    for w, h, dpr in DEVICES:
        pw, ph = w * dpr, h * dpr
        canvas = Image.new("RGB", (pw, ph), bg)
        size = int(min(pw, ph) * 0.24)
        m = mark(size, tile, ink)
        canvas.paste(m, ((pw - m.width) // 2, (ph - m.height) // 2), m)
        canvas.save(f"public/splash/{name}-{pw}x{ph}.png", optimize=True)
print("done")
