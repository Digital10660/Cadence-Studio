/* Cadence — drawing core: maths, easing, colour, text and shape helpers shared by every layer. */
export const W = 1080, H = 1920, FPS = 30;

export const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export const lerp = (a, b, t) => a + (b - a) * t;
export const P = (t, a, b) => clamp((t - a) / (b - a));
export const eOut = x => 1 - Math.pow(1 - clamp(x), 3);
export const eIn = x => Math.pow(clamp(x), 3);
export const eInOut = x => { x = clamp(x); return x < .5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2; };
export const eQuint = x => { x = clamp(x); return x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2; };
export const eExpo = x => { x = clamp(x); return x >= 1 ? 1 : 1 - Math.pow(2, -10 * x); };
export const eBack = (x, s = 1.70158) => { x = clamp(x); const c3 = s + 1; return 1 + c3 * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2); };
export const eElastic = x => { x = clamp(x); if (x === 0 || x === 1) return x; return Math.pow(2, -10 * x) * Math.sin((x * 10 - .75) * (2 * Math.PI) / 3) + 1; };

/* deterministic randomness (same edit every render) */
export function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
export const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };

/* ---------- colour ---------- */
export function hexRgb(hex) {
  let h = String(hex || '#000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  const n = parseInt(h.slice(0, 6), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export const rgba = (hex, a = 1) => { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; };
export function lum(hex) { const [r, g, b] = hexRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }); return .2126 * r + .7152 * g + .0722 * b; }
export const onColor = (bg, dark = '#0E0E10', light = '#FFFFFF') => lum(bg) > .45 ? dark : light;
export function mixHex(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return '#' + A.map((v, i) => Math.round(lerp(v, B[i], t)).toString(16).padStart(2, '0')).join(''); }

/* ---------- shapes ---------- */
export function rr(g, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
export function withT(g, cx, cy, s, rot, fn) { g.save(); g.translate(cx, cy); if (rot) g.rotate(rot); if (s !== 1) g.scale(s, s); g.translate(-cx, -cy); fn(); g.restore(); }

/* 4-point sparkle (the small stars that float around keywords) */
export function sparkle(g, x, y, r, color, alpha = 1, rot = 0) {
  if (alpha <= 0 || r <= 0) return;
  g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot); g.fillStyle = color; g.beginPath();
  for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.quadraticCurveTo(Math.cos(a + Math.PI / 4) * r * .18, Math.sin(a + Math.PI / 4) * r * .18, Math.cos(a + Math.PI / 2) * r, Math.sin(a + Math.PI / 2) * r); }
  g.closePath(); g.fill(); g.restore();
}

/* ---------- text ---------- */
export const fontStr = f => `${f.it ? 'italic ' : ''}${f.w || 700} ${Math.max(1, f.size).toFixed(1)}px "${f.fam}"`;
const _m = document.createElement('canvas').getContext('2d');
const _mc = new Map();
export function measure(s, f) {
  const k = fontStr(f) + '|' + (f.ls ?? 'd') + '|' + s;
  let v = _mc.get(k);
  if (v === undefined) {
    _m.font = fontStr(f); _m.letterSpacing = `${(f.ls ?? -0.02) * f.size}px`;
    v = _m.measureText(s).width; if (_mc.size > 20000) _mc.clear(); _mc.set(k, v);
  }
  return v;
}
export function clearMeasureCache() { _mc.clear(); }

/** Draws one string. o: {color, align, alpha, blur, shadow:{color,blur,y}, stroke:[color,width], gradient:[c1,c2], glow:{color,blur}} */
export function text(g, s, x, y, f, o = {}) {
  const alpha = o.alpha ?? 1; if (alpha <= .003 || !s) return;
  g.save(); g.globalAlpha *= alpha;
  if (o.blur > .4) g.filter = `blur(${o.blur.toFixed(1)}px)`;
  g.font = fontStr(f); g.letterSpacing = `${(f.ls ?? -0.02) * f.size}px`;
  g.textAlign = o.align || 'center'; g.textBaseline = 'middle';
  let fill = o.color || '#fff';
  if (o.gradient) { const gr = g.createLinearGradient(0, y - f.size * .45, 0, y + f.size * .45); gr.addColorStop(0, o.gradient[0]); gr.addColorStop(1, o.gradient[1]); fill = gr; }
  if (o.stroke && o.stroke[1] > 0) { g.lineWidth = o.stroke[1]; g.strokeStyle = o.stroke[0]; g.lineJoin = 'round'; g.miterLimit = 2; if (o.shadow) { g.shadowColor = o.shadow.color; g.shadowBlur = o.shadow.blur; g.shadowOffsetY = o.shadow.y || 0; } g.strokeText(s, x, y); g.shadowColor = 'transparent'; }
  if (o.glow) { g.shadowColor = o.glow.color; g.shadowBlur = o.glow.blur; g.fillStyle = fill; g.fillText(s, x, y); }
  if (o.shadow && !(o.stroke && o.stroke[1] > 0)) { g.shadowColor = o.shadow.color; g.shadowBlur = o.shadow.blur; g.shadowOffsetY = o.shadow.y || 0; }
  g.fillStyle = fill; g.fillText(s, x, y); g.restore();
}

/* greedy word wrap; returns array of lines (arrays of items) */
export function wrapItems(items, maxW, gap) {
  const lines = []; let cur = [], w = 0;
  for (const it of items) {
    const add = (cur.length ? gap : 0) + it.w;
    if (cur.length && (w + add > maxW || it.forceBreak)) { lines.push(cur); cur = []; w = 0; }
    cur.push(it); w += (cur.length > 1 ? gap : 0) + it.w;
    if (it.breakAfter) { lines.push(cur); cur = []; w = 0; }
  }
  if (cur.length) lines.push(cur);
  return lines;
}

/* Fit a string inside width: returns the size that makes it fit (capped). */
export function fitSize(s, f, maxW, maxSize, minSize = 20) { const w = measure(s, { ...f, size: 100 }); return clamp(maxW / Math.max(w, 1) * 100, minSize, maxSize); }

/* Clean a spoken word for display. */
export function cleanWord(w, keepPunct = '?!') {
  const re = new RegExp(`[^\\p{L}\\p{N}'’%€$+\\-${keepPunct.replace(/[-\\^\]]/g, '\\$&')}]`, 'gu');
  return String(w).replace(re, '').replace(/^[\-]+|[\-]+$/g, '');
}
export const isNumberWord = w => /\d/.test(w);

/* ---------- film grain ---------- */
const GRAIN = document.createElement('canvas'); GRAIN.width = GRAIN.height = 256;
{ const gg = GRAIN.getContext('2d'), id = gg.createImageData(256, 256), r = rng(7); for (let i = 0; i < id.data.length; i += 4) { const v = 128 + (r() - .5) * 110; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 255; } gg.putImageData(id, 0, 0); }
export function grain(g, t, a = .05) {
  const f = Math.floor(t * FPS), ox = (f * 73) % 256, oy = (f * 151) % 256;
  g.save(); g.globalCompositeOperation = 'overlay'; g.globalAlpha = a; g.translate(-ox, -oy); g.fillStyle = g.createPattern(GRAIN, 'repeat'); g.fillRect(ox, oy, W, H); g.restore();
}
export function vignette(g, a = .35) {
  const gr = g.createRadialGradient(W / 2, H * .45, H * .25, W / 2, H * .5, H * .78); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, `rgba(0,0,0,${a})`);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
}

/* ---------- curated Google fonts (all loaded by index.html) ---------- */
export const FONT_GROUPS = {
  'Sans modernes': ['Inter Tight', 'Inter', 'Montserrat', 'Poppins', 'Plus Jakarta Sans', 'Outfit', 'Sora', 'Manrope', 'DM Sans', 'Lexend', 'Rubik', 'Kanit', 'Space Grotesk', 'Bricolage Grotesque', 'Syne', 'Unbounded'],
  'Condensées & impact': ['Barlow Condensed', 'Anton', 'Bebas Neue', 'Oswald', 'Big Shoulders Display', 'Archivo Black', 'Bowlby One', 'Lilita One'],
  'Serif élégantes': ['Instrument Serif', 'Playfair Display', 'DM Serif Display', 'Cormorant Garamond', 'Fraunces', 'Abril Fatface'],
  'Manuscrites & fun': ['Caveat', 'Permanent Marker', 'Righteous'],
  'Mono': ['Space Mono'],
};
export const FONT_LIST = Object.values(FONT_GROUPS).flat();
const SINGLE_WEIGHT = { 'Anton': 400, 'Bebas Neue': 400, 'Archivo Black': 400, 'Instrument Serif': 400, 'DM Serif Display': 400, 'Bowlby One': 400, 'Lilita One': 400, 'Abril Fatface': 400, 'Permanent Marker': 400, 'Righteous': 400 };
/* Some families exist in one weight only: map any requested weight to the real one. */
export const realWeight = (fam, w) => SINGLE_WEIGHT[fam] ?? w;
export async function ensureFonts(fams) {
  const specs = [];
  for (const f of new Set(fams.filter(Boolean))) {
    if (SINGLE_WEIGHT[f]) { specs.push(`400 60px "${f}"`); if (/Serif/.test(f)) specs.push(`italic 400 60px "${f}"`); continue; }
    for (const w of [400, 500, 600, 700, 800, 900]) specs.push(`${w} 60px "${f}"`);
    specs.push(`italic 700 60px "${f}"`, `italic 800 60px "${f}"`, `italic 900 60px "${f}"`, `italic 400 60px "${f}"`);
  }
  await Promise.all(specs.map(s => document.fonts.load(s).catch(() => null)));
  clearMeasureCache();
}
