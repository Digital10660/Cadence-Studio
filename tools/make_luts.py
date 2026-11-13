# -*- coding: utf-8 -*-
"""Generates Cadence's built-in cinematic 3D LUTs (.cube, 33^3) into studio/luts/.
Each LUT is a film-style transform built from tone curves, split-toning and hue-selective moves."""
import os
import numpy as np

N = 33
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "luts")
os.makedirs(OUT, exist_ok=True)

g = np.linspace(0, 1, N)
B, G, R = np.meshgrid(g, g, g, indexing="ij")          # index order: b slowest, r fastest
RGB = np.stack([R, G, B], -1).reshape(-1, 3)


def lum(c): return c @ np.array([.2126, .7152, .0722])
def sat(c, s): l = lum(c)[:, None]; return l + (c - l) * s
def scurve(x, k): return x + k * (x * x * (3 - 2 * x) - x)
def smooth(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def lift(c, a): return a + c * (1 - a)
def gain(c, a): return c * a


def rgb2hsv(c):
    r, g_, b = c[:, 0], c[:, 1], c[:, 2]
    mx, mn = c.max(1), c.min(1); d = mx - mn + 1e-9
    h = np.where(mx == r, ((g_ - b) / d) % 6, np.where(mx == g_, (b - r) / d + 2, (r - g_) / d + 4)) / 6
    s = np.where(mx > 0, (mx - mn) / (mx + 1e-9), 0)
    return np.stack([h, s, mx], -1)


def hsv2rgb(hsv):
    h, s, v = hsv[:, 0] * 6, hsv[:, 1], hsv[:, 2]
    i = np.floor(h).astype(int) % 6; f = h - np.floor(h)
    p, q, t = v * (1 - s), v * (1 - s * f), v * (1 - s * (1 - f))
    out = np.choose(i, [np.stack(x, -1).T for x in [(v, t, p), (q, v, p), (p, v, t), (p, q, v), (t, p, v), (v, p, q)]]).T
    return out


def split(c, sh, hi, amt):
    l = lum(c)[:, None]
    ws, wh = 1 - smooth(0, .55, l), smooth(.45, 1, l)
    return c + (np.array(sh) - .5) * ws * amt + (np.array(hi) - .5) * wh * amt


def teal_orange(c, amt=.6):
    hsv = rgb2hsv(c); h = hsv[:, 0] * 360
    skin = np.exp(-((((h - 28 + 180) % 360) - 180) / 22) ** 2)            # keep skin tones warm
    target = np.where(skin > .3, 28, 192)
    dh = ((target - h + 180) % 360) - 180
    w = np.where(skin > .3, .25, .55) * amt * np.clip(hsv[:, 1] * 2, 0, 1)
    hsv[:, 0] = ((h + dh * w) % 360) / 360
    hsv[:, 1] = np.clip(hsv[:, 1] * (1 + .25 * amt * skin), 0, 1)
    return hsv2rgb(hsv)


def film_curve(c, toe=.04, shoulder=.94, k=.35):
    c = scurve(np.clip(c, 0, 1), k)
    return toe + c * (shoulder - toe)


LUTS = {}

def L(name):
    def deco(f): LUTS[name] = f; return f
    return deco


@L("Kodak 2383 (film)")
def kodak(c):
    c = np.stack([scurve(c[:, 0], .42), scurve(c[:, 1], .38), scurve(c[:, 2], .3)], -1)
    c = split(c, [.38, .5, .56], [.62, .54, .42], .35)
    c = sat(c, .92); return film_curve(c, .035, .95, .1)

@L("Fuji Eterna (doux)")
def eterna(c):
    c = film_curve(c, .05, .93, .12); c = sat(c, .78)
    return split(c, [.42, .55, .54], [.56, .53, .46], .3)

@L("Teal & Orange Pro")
def to_pro(c):
    c = teal_orange(c, .75); c = np.stack([scurve(x, .35) for x in c.T], -1)
    return split(c, [.36, .52, .6], [.64, .53, .4], .3)

@L("Bleach bypass")
def bleach(c):
    l = lum(c)[:, None]; m = scurve(l, .7)
    return np.clip(.55 * sat(c, .45) + .45 * np.repeat(m, 3, 1) * (c / np.maximum(l, 1e-4) * .3 + .7), 0, 1)

@L("Matte film chaud")
def matte(c):
    c = gain(lift(c, .07), .93); c = sat(c, .88)
    c = split(c, [.52, .48, .44], [.62, .55, .44], .3); return np.stack([scurve(x, .2) for x in c.T], -1)

@L("Cinestill 800T (nuit)")
def cinestill(c):
    c = np.stack([c[:, 0] * .92, c[:, 1] * .98, c[:, 2] * 1.08 + .02], -1)
    l = lum(c)[:, None]; c = c + np.array([.12, .02, -.04]) * smooth(.65, 1, l)   # red halation in highlights
    return np.stack([scurve(x, .4) for x in np.clip(c, 0, 1).T], -1)

@L("Portra (peau douce)")
def portra(c):
    c = lift(c, .03); c = np.stack([scurve(c[:, 0], .22) * 1.03, scurve(c[:, 1], .2), scurve(c[:, 2], .2) * .96], -1)
    c = sat(c, .9); return split(c, [.5, .5, .52], [.6, .54, .46], .25)

@L("Cross process")
def cross(c):
    r = scurve(c[:, 0], .6); g_ = scurve(c[:, 1], .3) * .98 + .02; b = .12 + c[:, 2] * .72
    return sat(np.stack([r, g_, b], -1), 1.1)

@L("Noir filtre rouge")
def noir(c):
    m = c @ np.array([.55, .38, .07]); m = scurve(m, .65); m = lift(m, .02)
    return np.repeat(m[:, None], 3, 1)

@L("Neon nuit")
def neon(c):
    c = np.stack([scurve(x, .45) for x in c.T], -1)
    c = split(c, [.44, .5, .66], [.66, .45, .62], .4); return sat(c, 1.15)

@L("Golden hour")
def golden(c):
    c = np.stack([c[:, 0] * 1.06, c[:, 1] * 1.0, c[:, 2] * .86], -1)
    c = split(c, [.56, .5, .44], [.66, .56, .4], .35); return film_curve(c, .03, .96, .25)

@L("Blockbuster froid")
def cold(c):
    c = sat(c, .8); c = np.stack([scurve(x, .5) for x in c.T], -1)
    return split(c, [.4, .52, .64], [.5, .54, .6], .35)


def write(name, f):
    out = np.clip(f(RGB.copy()), 0, 1)
    fn = "".join(ch if (ch.isascii() and ch.isalnum()) else "_" for ch in name.lower()).strip("_")
    fn = "_".join(x for x in fn.split("_") if x) + ".cube"
    with open(os.path.join(OUT, fn), "w", encoding="utf-8") as fh:
        fh.write(f'TITLE "{name}"\nLUT_3D_SIZE {N}\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n')
        fh.write("\n".join(f"{r:.6f} {g_:.6f} {b:.6f}" for r, g_, b in out))
        fh.write("\n")
    return fn


if __name__ == "__main__":
    for n, f in LUTS.items():
        print(write(n, f))
