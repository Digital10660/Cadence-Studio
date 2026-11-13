/* Cadence — kinetic caption engine (v2).
   Not one centred line: each phrase gets a COMPOSITION, like a motion designer would place it —
     line     : classic centred lines (karaoke, minimal, banner…)
     stack    : small words above/below a huge keyword
     stair    : small words hooked to the keyword's left / right edges ("If the / PROSPECTS / meet you")
     corner   : big block anchored top-left or top-right
     shoulder : small elegant block beside the face
     behind   : giant word BEHIND the speaker (person cut-out drawn on top)
     number   : huge counting number with the words stacked next to it
   Typography = two roles (small words / keyword) with family, case, weight, colour and effect,
   so serif/sans, caps/lowercase, glow, gradient, outline, block… can be mixed freely. */
import { W, H, clamp, lerp, P, eOut, eIn, eInOut, eExpo, eBack, measure, text, rr, withT, cleanWord, realWeight, lum, onColor, mixHex, rgba, rng, hash, fitSize } from './core.js';

export const keyCol = b => (lum(b.accent) > .8 ? b.primary : b.accent);
const FAM = { font: b => b.font, display: b => b.display, serif: b => b.serif, caps: b => b.caps };

/* ---------------------------------------------------------------- presets */
export const PRESETS = {
  neon: {
    label: 'Néon empilé', hint: 'Petits mots en escalier + mot-clé lumineux',
    small: { fam: 'font', w: 600, it: false, case: 'as', size: 46 }, key: { fam: 'display', w: 900, it: false, case: 'as', size: 170, color: 'accent', fx: 'glow' },
    line: { size: 68, w: 700, keyScale: 1.35 }, comps: { stair: 4, stack: 2, behind: 2, number: 3, line: 1 }, ghost: false, density: [26, 5],
  },
  createur: {
    label: 'Créateur', hint: 'Italique géant, lueur, chiffres qui comptent',
    small: { fam: 'font', w: 400, it: false, case: 'as', size: 50 }, key: { fam: 'caps', w: 900, it: true, case: 'upper', size: 160, color: 'accent', fx: 'neon' },
    line: { size: 72, w: 600, keyScale: 1.4 }, comps: { stack: 4, number: 4, line: 2, behind: 1 }, ghost: false, density: [26, 5],
  },
  editorial: {
    label: 'Éditorial', hint: 'Placements variés, mots géants derrière toi',
    small: { fam: 'font', w: 500, it: false, case: 'as', size: 38 }, key: { fam: 'display', w: 800, it: false, case: 'as', size: 190, color: 'white', fx: 'none' },
    line: { size: 62, w: 600, keyScale: 1.25 }, comps: { corner: 3, behind: 4, shoulder: 2, number: 3, stack: 2 }, ghost: false, giant: 'fade', density: [26, 5],
  },
  serif: {
    label: 'Serif luxe', hint: 'Majuscules espacées + serif italique',
    small: { fam: 'font', w: 600, it: false, case: 'upper', size: 30, ls: .16 }, key: { fam: 'serif', w: 400, it: true, case: 'as', size: 156, color: 'white', fx: 'none' },
    line: { size: 60, w: 600, keyScale: 1.5 }, comps: { stack: 4, corner: 2, shoulder: 2, behind: 1 }, ghost: false, density: [24, 5],
  },
  impact: {
    label: 'Impact', hint: 'Condensé italique, mot-clé en couleur',
    small: { fam: 'caps', w: 900, it: true, case: 'upper', size: 64, ls: 0 }, key: { fam: 'caps', w: 900, it: true, case: 'upper', size: 150, ls: 0, color: 'accent', fx: 'none' },
    line: { size: 92, w: 900, keyScale: 1.3, activeScale: 1.05 }, comps: { line: 5, stack: 2 }, ghost: false, density: [16, 3],
  },
  highlight: {
    label: 'Surligneur', hint: 'Mot-clé dans un bloc couleur',
    small: { fam: 'display', w: 800, it: false, case: 'as', size: 56 }, key: { fam: 'display', w: 900, it: false, case: 'as', size: 130, color: 'white', fx: 'box' },
    line: { size: 74, w: 800, keyScale: 1.05 }, comps: { line: 4, stack: 2 }, ghost: false, density: [18, 3],
  },
  minimal: {
    label: 'Minimal', hint: 'Propre, les mots s’allument',
    small: { fam: 'font', w: 500, it: false, case: 'as', size: 58 }, key: { fam: 'font', w: 700, it: false, case: 'as', size: 58, color: 'white', fx: 'none' },
    line: { size: 58, w: 500, keyScale: 1 }, comps: { line: 1 }, ghost: true, density: [28, 5],
  },
  karaoke: {
    label: 'Karaoké', hint: 'Le mot prononcé s’allume',
    small: { fam: 'display', w: 900, it: false, case: 'upper', size: 76 }, key: { fam: 'display', w: 900, it: false, case: 'upper', size: 76, color: 'white', fx: 'none' },
    line: { size: 76, w: 900, keyScale: 1, stroke: 13, active: true, activeScale: 1.1 }, comps: { line: 1 }, ghost: true, density: [16, 3],
  },
  banner: {
    label: 'Bandeau', hint: 'Blocs pleins, idéal en écran partagé',
    small: { fam: 'display', w: 800, it: false, case: 'upper', size: 54 }, key: { fam: 'display', w: 900, it: false, case: 'upper', size: 54, color: 'primary', fx: 'none' },
    line: { size: 54, w: 800, keyScale: 1, lineBox: true }, comps: { line: 1 }, ghost: false, density: [24, 4],
  },
};
Object.assign(PRESETS, {
  lime: {
    label: 'Lime glow', hint: 'Vert lime lumineux, mots en escalier',
    small: { fam: 'font', w: 700, it: false, case: 'as', size: 44 }, key: { fam: 'display', w: 900, it: false, case: 'as', size: 170, color: '#C8FF3D', fx: 'glow' },
    line: { size: 70, w: 800, keyScale: 1.3 }, comps: { stair: 4, stack: 2, behind: 2, line: 1 }, ghost: false, density: [26, 5],
  },
  violet: {
    label: 'Violet néon', hint: 'Majuscules italiques violettes qui brillent',
    small: { fam: 'font', w: 400, it: false, case: 'as', size: 50 }, key: { fam: 'caps', w: 900, it: true, case: 'upper', size: 160, color: '#B26BFF', fx: 'neon' },
    line: { size: 70, w: 500, keyScale: 1.4 }, comps: { stack: 4, number: 4, line: 2 }, ghost: false, density: [26, 5],
  },
  podcast: {
    label: 'Podcast', hint: 'Petite ligne italique + titre condensé orange',
    small: { fam: 'caps', w: 700, it: true, case: 'upper', size: 46, ls: .02 }, key: { fam: 'caps', w: 900, it: true, case: 'upper', size: 140, ls: 0, color: '#FF8A1F', fx: 'none' },
    line: { size: 76, w: 800, keyScale: 1.3 }, comps: { stack: 4, line: 2, number: 2 }, ghost: false, density: [24, 5],
  },
  hormozi: {
    label: 'Hormozi', hint: 'Gros caractères, contour noir, mot actif en couleur',
    small: { fam: 'caps', w: 900, it: true, case: 'upper', size: 70, ls: 0 }, key: { fam: 'caps', w: 900, it: true, case: 'upper', size: 120, ls: 0, color: 'accent', fx: 'none' },
    line: { size: 88, w: 900, keyScale: 1.2, stroke: 11, active: true, activeScale: 1.08 }, comps: { line: 1 }, ghost: false, density: [16, 3],
  },
  mixserif: {
    label: 'Serif doré', hint: 'Grand serif italique doré + sans gras',
    small: { fam: 'display', w: 800, it: false, case: 'as', size: 52 }, key: { fam: 'serif', w: 400, it: true, case: 'as', size: 170, color: '#F1C76B', fx: 'gradient' },
    line: { size: 66, w: 800, keyScale: 1.5 }, comps: { stack: 4, corner: 2, number: 3, shoulder: 1 }, ghost: false, density: [24, 5],
  },
  softline: {
    label: 'Doux souligné', hint: 'Texte propre, mot-clé lavande souligné',
    small: { fam: 'font', w: 500, it: false, case: 'as', size: 56 }, key: { fam: 'display', w: 800, it: false, case: 'as', size: 64, color: '#B9A2FF', fx: 'underline' },
    line: { size: 56, w: 500, keyScale: 1.12 }, comps: { line: 1 }, ghost: true, density: [26, 5],
  },
  redbox: {
    label: 'Bloc rouge', hint: 'Mot-clé serif sur bloc rouge',
    small: { fam: 'font', w: 700, it: false, case: 'as', size: 56 }, key: { fam: 'serif', w: 400, it: true, case: 'as', size: 110, color: 'white', fx: 'box', box: '#E3262E' },
    line: { size: 62, w: 700, keyScale: 1.25 }, comps: { line: 3, stack: 2 }, ghost: false, density: [20, 4],
  },
  bluebox: {
    label: 'Bloc bleu', hint: 'Mot-clé blanc sur bloc bleu électrique',
    small: { fam: 'display', w: 800, it: false, case: 'as', size: 56 }, key: { fam: 'display', w: 900, it: false, case: 'as', size: 110, color: 'white', fx: 'box', box: '#2433FF' },
    line: { size: 76, w: 800, keyScale: 1.05 }, comps: { line: 4, stack: 1 }, ghost: false, density: [18, 3],
  },
  smallcenter: {
    label: 'Discret', hint: 'Petit texte centré, élégant',
    small: { fam: 'font', w: 600, it: false, case: 'as', size: 44 }, key: { fam: 'font', w: 800, it: false, case: 'as', size: 44, color: 'white', fx: 'none' },
    line: { size: 44, w: 600, keyScale: 1 }, comps: { line: 1 }, ghost: false, density: [30, 6],
  },
});
const CAT = { neon: 'Créateurs', lime: 'Créateurs', violet: 'Créateurs', createur: 'Créateurs', podcast: 'Créateurs', hormozi: 'Créateurs', impact: 'Créateurs',
  editorial: 'Éditorial', serif: 'Éditorial', mixserif: 'Éditorial', softline: 'Éditorial',
  highlight: 'Blocs', redbox: 'Blocs', bluebox: 'Blocs', banner: 'Blocs', minimal: 'Minimal', smallcenter: 'Minimal', karaoke: 'Minimal' };
for (const [k, c] of Object.entries(CAT)) PRESETS[k].cat = c;
export const PRESET_CATS = ['Créateurs', 'Éditorial', 'Blocs', 'Minimal'];
/* legacy ids from v1 projects */
const ALIAS = { serifmix: 'serif', neonglow: 'neon' };

/** preset + user customisation (settings.typo) -> resolved style */
export function resolveStyle(id, typo = {}) {
  const p = PRESETS[ALIAS[id] || id] || PRESETS.neon;
  const st = { id, ...p, small: { ...p.small, ...(typo.small || {}) }, key: { ...p.key, ...(typo.key || {}) }, line: { ...p.line } };
  if (typo.comps) { st.comps = {}; for (const [k, on] of Object.entries(typo.comps)) if (on) st.comps[k] = p.comps[k] || 2; if (!Object.keys(st.comps).length) st.comps = { line: 1 }; }
  if (typo.ghost !== undefined) st.ghost = typo.ghost;
  if (typo.giant) st.giant = typo.giant;
  st.keyScale = typo.keyScale ?? 1;
  st.smallScale = typo.smallScale ?? 1;
  return st;
}
export const isLineOnly = st => Object.keys(st.comps).length === 1 && st.comps.line;

/* ---------------------------------------------------------------- helpers */
const shape = (s, c) => c === 'upper' ? s.toLocaleUpperCase('fr') : c === 'lower' ? s.toLocaleLowerCase('fr') : s;
function roleFont(r, b, size) { const fam = r.family || FAM[r.fam]?.(b) || b.font; return { fam, w: realWeight(fam, r.w), it: !!r.it, size, ls: r.ls ?? (r.fam === 'serif' ? -.01 : r.case === 'upper' ? .01 : -.03) }; }
function colorOf(c, b) { if (typeof c === 'string' && c[0] === '#') return c; return c === 'accent' ? keyCol(b) : c === 'primary' ? (lum(b.primary) < .08 ? keyCol(b) : b.primary) : c === 'ink' ? b.ink : '#FFFFFF'; }
const NEG = /^(pas|jamais|rien|plus|faux|erreur|erreurs|échec|not|never|no)$/i;
const SH = { color: 'rgba(0,0,0,.5)', blur: 26, y: 4 };

/* ---------------------------------------------------------------- composition choice (called by the director) */
export function assignComps(groups, st, { behind = false, layout = 'full', seed = 0, faceY = .33 } = {}) {
  const R = rng(1234 + seed * 7);
  let prev = '', lastBehind = -99, lastCorner = -9, side = 1;
  groups.forEach((g, i) => {
    g.side = side;
    if (layout === 'split' || layout === 'motion') { g.comp = 'line'; return; }
    const kw = g.key >= 0 ? cleanWord(g.words[g.key].w, '') : '';
    const hasNum = g.key >= 0 && /\d/.test(kw);
    const w = {};
    for (const [c, wt] of Object.entries(st.comps)) w[c] = wt;
    if (g.key < 0) { g.comp = w.line ? 'line' : (w.shoulder ? 'shoulder' : 'stack'); prev = g.comp; return; }
    if (!hasNum) delete w.number; else if (w.number) w.number *= 4;
    if (!(behind && w.behind && kw.length >= 3 && kw.length <= 11 && g.s - lastBehind > 5 && g.end - g.s > .5)) delete w.behind; else w.behind *= 1.6;
    if (w.corner && i - lastCorner < 3) delete w.corner;
    if (w.shoulder && g.words.length > 4) delete w.shoulder;
    if (w.stair && g.words.length < 2) delete w.stair;
    if (prev && w[prev] && Object.keys(w).length > 1) w[prev] *= .25;
    const tot = Object.values(w).reduce((a, b) => a + b, 0);
    let r = R() * tot, pick = 'line';
    for (const [c, wt] of Object.entries(w)) { if ((r -= wt) <= 0) { pick = c; break; } }
    if (!tot) pick = st.comps.line ? 'line' : 'stack';
    g.comp = pick; prev = pick;
    if (pick === 'behind') lastBehind = g.s;
    if (pick === 'corner' || pick === 'shoulder') { lastCorner = i; side = -side; }
  });
}

/* ---------------------------------------------------------------- layout */
const cache = new Map();
export function clearCaptionCache() { cache.clear(); }

function mkItem(w, j, role, st, b, size) {
  const r = role === 'key' ? st.key : st.small;
  let s = cleanWord(w.w, role === 'key' ? '%€$+?!' : '?!%€$+');
  s = shape(s, r.case);
  const f = roleFont(r, b, size);
  return { s, f, w: measure(s, f), word: w, j, role };
}
function wrapLines(items, maxW, gap) {
  const lines = []; let cur = [], cw = 0;
  for (const it of items) { const add = (cur.length ? gap : 0) + it.w; if (cur.length && cw + add > maxW) { lines.push({ items: cur, w: cw }); cur = []; cw = 0; } cur.push(it); cw += (cur.length > 1 ? gap : 0) + it.w; }
  if (cur.length) lines.push({ items: cur, w: cw });
  return lines;
}
/* place lines: align 'left' at x, 'right' ending at x, 'center' around x; top y */
function placeLines(lines, x, y, align, gap, lh) {
  let yy = y;
  for (const ln of lines) {
    const h = Math.max(...ln.items.map(i => i.f.size)) * lh;
    let xx = align === 'left' ? x : align === 'right' ? x - ln.w : x - ln.w / 2;
    for (const it of ln.items) { it.x = xx; it.y = yy + h / 2; xx += it.w + gap; }
    yy += h;
  }
  return yy;
}
const linesH = (lines, lh) => lines.reduce((a, ln) => a + Math.max(...ln.items.map(i => i.f.size)) * lh, 0);

function layoutBig(group, st, b, o) {
  const comp = group.comp, scale = o.scale || 1, side = group.side || 1;
  const k = group.key >= 0 ? group.key : group.words.reduce((bi, w, i, a) => cleanWord(w.w, '').length > cleanWord(a[bi].w, '').length ? i : bi, 0);
  const ss = st.small.size * scale * st.smallScale * (comp === 'shoulder' ? 1.15 : 1);
  const pre = group.words.slice(0, k).map((w, j) => mkItem(w, j, 'small', st, b, ss));
  const post = group.words.slice(k + 1).map((w, j) => mkItem(w, k + 1 + j, 'small', st, b, ss));
  const gap = ss * .3, lh = 1.12;
  let ks = st.key.size * scale * st.keyScale;
  const key = mkItem(group.words[k], k, 'key', st, b, ks);
  const maxKW = comp === 'behind' ? W * .95 : comp === 'corner' ? W * .8 : comp === 'shoulder' ? W * .42 : comp === 'number' ? W * .62 : W * .86;
  if (comp === 'behind') { key.s = shape(key.s, 'upper'); key.f = { ...key.f, w: realWeight(key.f.fam, 900), it: st.key.fam === 'serif' ? key.f.it : false, ls: st.key.fam === 'serif' ? -.01 : -.035 }; ks = Math.min(470, fitSize(key.s, key.f, maxKW, 470, 120)); }
  else if (comp === 'shoulder') ks = Math.min(ss * 2.1, ks);
  else {
    // hero word: grow short words until they fill most of the width (like the references), within limits
    const target = comp === 'corner' ? W * .72 : comp === 'number' ? W * .5 : W * .8;
    ks = clamp(fitSize(key.s, key.f, target, ks * 1.9, 30), ks * .7, ks * 1.9);
  }
  ks = Math.min(ks, fitSize(key.s, key.f, maxKW, ks, 30));
  key.f = { ...key.f, size: ks }; key.w = measure(key.s, key.f); key.giant = comp === 'behind';
  const items = [...pre, key, ...post];
  const fy = o.faceY ?? .33, capY = o.capY ?? .7;

  if (comp === 'behind') {
    const cy = H * (fy - .02), kx = W / 2 - key.w / 2;
    key.x = kx; key.y = cy; key.layer = 'back';
    // tiny words hooked to the giant word: before -> above-left, after -> below-right
    const pl = wrapLines(pre, W * .6, gap), ql = wrapLines(post, W * .6, gap);
    placeLines(pl, kx + ks * .04, cy - ks * .5 - linesH(pl, lh) - ss * .1, 'left', gap, lh);
    placeLines(ql, kx + key.w - ks * .04, cy + ks * .48 + ss * .1, 'right', gap, lh);
    return { items, comp };
  }
  if (comp === 'number') {
    const others = [...pre, ...post], ol = others.map(i => [i]).map(a => ({ items: a, w: a[0].w }));
    const colW = Math.max(0, ...others.map(i => i.w)), right = key.w + ss * .6 + colW <= W * .86;
    const cy = H * (capY - .06);
    if (right) {
      const x0 = W / 2 - (key.w + ss * .6 + colW) / 2; key.x = x0; key.y = cy;
      placeLines(ol, x0 + key.w + ss * .6, cy - linesH(ol, 1.05) / 2, 'left', gap, 1.05);
    } else {
      key.x = W / 2 - key.w / 2; key.y = cy;
      const ln = wrapLines(others, W * .8, gap); placeLines(ln, W / 2, cy + ks * .55, 'center', gap, lh);
    }
    key.count = true;
    return { items, comp };
  }
  if (comp === 'corner') {
    const left = side > 0, x = left ? 72 : W - 72, top = H * .12;
    const pl = wrapLines(pre, W * .7, gap), ql = wrapLines(post, W * .7, gap);
    let y = placeLines(pl, x, top, left ? 'left' : 'right', gap, lh);
    key.x = left ? x - ks * .03 : x - key.w + ks * .03; key.y = y + ks * .5; y += ks * .98;
    placeLines(ql, x, y, left ? 'left' : 'right', gap, lh);
    return { items, comp };
  }
  if (comp === 'shoulder') {
    const left = side > 0, x = left ? W * .08 : W * .92;
    const lines = [];
    let cur = [];
    for (const it of items) { if (it.role === 'key') { if (cur.length) lines.push(cur); lines.push([it]); cur = []; continue; } cur.push(it); if (cur.length === 2) { lines.push(cur); cur = []; } }
    if (cur.length) lines.push(cur);
    const L = lines.map(a => ({ items: a, w: a.reduce((s, i) => s + i.w, 0) + gap * (a.length - 1) }));
    const tot = linesH(L, 1.08);
    placeLines(L, x, H * (fy + .1) - tot / 2, left ? 'left' : 'right', gap, 1.08);
    return { items, comp };
  }
  /* stack / stair (chest height) */
  const pl = wrapLines(pre, W * .72, gap), ql = wrapLines(post, W * .72, gap);
  const hTot = linesH(pl, lh) + ks * .98 + linesH(ql, lh);
  let y = H * capY - hTot / 2 - ss * .4;
  const kx = W / 2 - key.w / 2;
  if (comp === 'stair' && (!pl.length || pl[0].w < key.w * .9) && (!ql.length || ql[ql.length - 1].w < key.w * .9)) {
    y = placeLines(pl, kx + ks * .06, y, 'left', gap, lh);
    key.x = kx; key.y = y + ks * .49; y += ks * .98;
    placeLines(ql, kx + key.w - ks * .04, y, 'right', gap, lh);
  } else {
    y = placeLines(pl, W / 2, y, 'center', gap, lh);
    key.x = kx; key.y = y + ks * .49; y += ks * .98;
    placeLines(ql, W / 2, y, 'center', gap, lh);
  }
  return { items, comp: comp === 'stair' ? 'stair' : 'stack' };
}

function layoutLine(group, st, b, o) {
  const scale = o.scale || 1, L = st.line;
  const bs = L.size * scale * st.smallScale;
  const items = group.words.map((w, j) => {
    const isKey = !!w.key;
    const it = mkItem(w, j, isKey ? 'key' : 'small', st, b, isKey ? bs * L.keyScale : bs);
    if (!isKey) { it.f = { ...it.f, w: realWeight(it.f.fam, st.small.wLine ?? L.w) }; it.w = measure(it.s, it.f); }
    return it;
  }).filter(i => i.s);
  let gap = bs * .28, lines = wrapLines(items, o.maxW || 920, gap), sc = 1;
  while (lines.length > (L.lines || 2) && sc > .62) { sc *= .88; for (const it of items) { it.f = { ...it.f, size: it.f.size * .88 }; it.w = measure(it.s, it.f); } gap *= .88; lines = wrapLines(items, o.maxW || 920, gap); }
  const lh = L.lineBox ? 1.42 : 1.06, tot = linesH(lines, lh);
  placeLines(lines, o.cx ?? W / 2, (o.cy ?? H * (o.capY ?? .7)) - tot / 2, 'center', gap, lh);
  return { items, comp: 'line', lines, lh };
}

function getLayout(group, st, b, o) {
  const k = `${st.id}|${JSON.stringify(st.small)}|${JSON.stringify(st.key)}|${st.keyScale}|${st.smallScale}|${b.font}|${b.display}|${b.serif}|${b.caps}|${group.id}|${group.comp}|${group.side}|${group.text}|${group.words.map(w => +w.key).join('')}|${o.scale}|${o.capY}|${o.faceY}|${o.cy}`;
  let L = cache.get(k);
  if (!L) { L = group.comp && group.comp !== 'line' ? layoutBig(group, st, b, o) : layoutLine(group, st, b, o); if (cache.size > 4000) cache.clear(); cache.set(k, L); }
  return L;
}

/* ---------------------------------------------------------------- drawing */
function fxText(g, s, x, y, f, color, fx, b, alpha, blur, bloom = 0, extra = {}) {
  const o = { color, alpha, blur, align: 'left', ...extra };
  if (fx === 'glow' || fx === 'neon') o.glow = { color: rgba(color === '#FFFFFF' ? keyCol(b) : color, .7), blur: f.size * (.16 + bloom * .34) };
  if (fx === 'gradient' || fx === 'neon') o.gradient = [mixHex(color, '#FFFFFF', .55), color];
  if (!o.glow && !extra.noShadow) o.shadow = SH;
  if (fx === 'outline') { g.save(); g.globalAlpha *= alpha; if (blur > .4) g.filter = `blur(${blur.toFixed(1)}px)`; g.font = `${f.it ? 'italic ' : ''}${f.w} ${f.size}px "${f.fam}"`; g.letterSpacing = `${(f.ls ?? -.02) * f.size}px`; g.textBaseline = 'middle'; g.lineWidth = Math.max(2, f.size * .028); g.strokeStyle = color; g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 12; g.strokeText(s, x, y); g.restore(); return; }
  text(g, s, x, y, f, o);
  if (fx === 'neon' || fx === 'glow') { const o2 = { ...o, glow: null, shadow: null, alpha: alpha * .9 }; text(g, s, x, y, f, o2); }
}

/* per-letter reveal: letters rise out of a blur, staggered */
function letters(g, it, t, t0, color, fx, b, A, o = {}) {
  const ch = [...it.s], f = it.f, ls = (f.ls ?? -.02) * f.size;
  const fl = { ...f, ls: 0 };
  let x = it.x; const step = o.step ?? Math.min(.035, .3 / Math.max(1, ch.length));
  const bloom = 1 - P(t, t0 + .1, t0 + .7);
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i], cw = measure(c, fl);
    const p = P(t, t0 + i * step, t0 + i * step + (o.dur ?? .42));
    if (p > 0 && c !== ' ') {
      const e = eExpo(p);
      if (o.mask) { // slide up from behind a line (giant words)
        g.save(); g.beginPath(); g.rect(x - 40, it.y - f.size * .7, cw + 80, f.size * 1.08); g.clip();
        fxText(g, c, x, it.y + (1 - e) * f.size * 1.05, fl, color, fx, b, A * clamp(p * 3), 0, bloom, o.extra);
        g.restore();
      } else fxText(g, c, x, it.y + (1 - e) * f.size * .32, fl, color, fx, b, A * clamp(p * 2.4), (1 - eOut(p)) * 16, bloom, o.extra);
    }
    x += cw + ls;
  }
}

function giantColor(st, b, it) {
  const mode = st.giant || 'solid';
  if (mode === 'accent') return { color: keyCol(b), extra: {} };
  if (mode === 'fade') return { color: '#FFFFFF', extra: { gradient: ['rgba(255,255,255,.98)', 'rgba(255,255,255,.18)'], noShadow: true } };
  if (mode === 'outline') return { color: '#FFFFFF', fx: 'outline', extra: {} };
  return { color: '#FFFFFF', extra: { noShadow: false } };
}

/**
 * Draw a caption group.
 * opts: {layer:'front'|'back'|'all', scale, capY, faceY, cx, cy, maxW, noExit, alpha}
 */
export function drawCaption(g, group, t, st, b, opts = {}) {
  if (typeof st === 'string') st = resolveStyle(st);
  const L = getLayout(group, st, b, opts);
  const layer = opts.layer || 'all';
  const exitP = opts.noExit ? 0 : eIn(P(t, group.end - .03, group.end + (L.comp === 'behind' ? .28 : .14)));
  if (exitP >= 1) return;
  const A0 = (opts.alpha ?? 1) * (1 - exitP);

  if (L.comp === 'line') { if (layer !== 'back') drawLine(g, L, group, t, st, b, A0, exitP); return; }

  /* gentle drift of the whole block (keeps it alive) */
  const drift = 1 + .025 * P(t, group.s, group.end + .3);
  const cx = W / 2, cy = L.items.find(i => i.role === 'key')?.y ?? H / 2;
  g.save(); g.translate(cx, cy); g.scale(drift, drift); g.translate(-cx, -cy - exitP * 14);
  const neg = group.words.some(w => NEG.test(cleanWord(w.w, '')));
  for (const it of L.items) {
    const back = it.layer === 'back';
    if ((layer === 'front' && back) || (layer === 'back' && !back)) continue;
    const ws = it.word.s, we = it.word.e;
    if (it.role === 'key') {
      const t0 = ws - .1;
      if (t < t0 && !(st.ghost)) continue;
      if (it.giant) {
        const gc = giantColor(st, b, it);
        letters(g, it, t, t0 - .05, gc.color, gc.fx || (st.key.fx === 'glow' || st.key.fx === 'neon' ? st.key.fx : 'none'), b, A0 * .97, { mask: true, step: .045, dur: .55, extra: gc.extra });
        continue;
      }
      let col = colorOf(st.key.color, b), fx = st.key.fx;
      if (fx === 'box') {
        const kp = eExpo(P(t, ws - .08, ws + .2)), pad = it.f.size * .16, bh = it.f.size * 1.08;
        if (kp > 0) { g.save(); g.globalAlpha *= A0; g.translate(it.x - pad, it.y); g.rotate(-.04); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 8; rr(g, 0, -bh / 2, (it.w + pad * 2) * kp, bh, it.f.size * .14); g.fillStyle = colorOf(st.key.box || 'primary', b); g.fill(); g.restore(); }
        col = onColor(colorOf(st.key.box || 'primary', b)); fx = 'none';
      }
      if (it.count) { drawCount(g, it, t, t0, col, fx, b, A0); }
      else letters(g, it, t, t0, col, fx, b, A0);
      if (fx === 'underline' || (st.key.fx === 'underline')) underline(g, it, P(t, ws + .25, ws + .7), keyCol(b));
      if (neg && it.role === 'key' && st.key.fx !== 'box') strike(g, it, P(t, ws + .3, ws + .6));
      continue;
    }
    /* small words */
    const ghost = st.ghost ? .3 : 0, p = P(t, ws - .08, ws + .26);
    if (p <= 0 && !ghost) continue;
    const alpha = A0 * Math.max(ghost, clamp(p * 2)), e = eExpo(p);
    fxText(g, it.s, it.x, it.y + (1 - e) * it.f.size * .4 * (ghost ? 0 : 1), it.f, colorOf(st.small.color || 'white', b), st.small.fx || 'none', b, alpha, ghost ? 0 : (1 - eOut(p)) * 10);
  }
  g.restore();
}

function underline(g, it, p, color) {
  if (p <= 0) return;
  const y = it.y + it.f.size * .5, w = it.w; g.save(); g.strokeStyle = color; g.lineWidth = Math.max(6, it.f.size * .055); g.lineCap = 'round';
  const len = w * 1.2; g.setLineDash([len, len]); g.lineDashOffset = len * (1 - eOut(p));
  g.beginPath(); g.moveTo(it.x, y + 4); g.bezierCurveTo(it.x + w * .3, y - 8, it.x + w * .65, y + 14, it.x + w, y - 2); g.stroke(); g.restore();
}
function strike(g, it, p) {
  if (p <= 0) return;
  const y = it.y + it.f.size * .02; g.save(); g.strokeStyle = '#FF3B3B'; g.lineWidth = Math.max(6, it.f.size * .07); g.lineCap = 'round'; g.shadowColor = 'rgba(255,40,40,.6)'; g.shadowBlur = 16;
  g.beginPath(); g.moveTo(it.x - 10, y + 6); g.lineTo(it.x - 10 + (it.w + 20) * eOut(p), y - 6); g.stroke(); g.restore();
}
function drawCount(g, it, t, t0, col, fx, b, A) {
  const raw = it.s, m = raw.match(/[\d][\d\s.,]*/);
  if (!m) return letters(g, it, t, t0, col, fx, b, A);
  const numStr = m[0].trim(), target = parseFloat(numStr.replace(/[\s.]/g, '').replace(',', '.')) || 0;
  const p = eOut(P(t, t0, t0 + .75)), year = /^(19|20)\d\d$/.test(numStr);
  let v = year ? Math.round(lerp(target - 25, target, p)) : Math.round(target * p);
  const sep = numStr.includes('.') && !numStr.includes(',') ? '.' : ' ';
  const s = raw.replace(m[0], (year ? String(v) : v.toLocaleString('fr-FR').replace(/ |\s/g, sep)) + (/\s$/.test(m[0]) ? ' ' : ''));
  const a = clamp(P(t, t0, t0 + .15) * 3);
  withT(g, it.x + it.w / 2, it.y, .9 + .1 * eBack(P(t, t0, t0 + .4)), 0, () => fxText(g, s, it.x, it.y, it.f, col, fx, b, A * a, (1 - a) * 12, 1 - P(t, t0 + .5, t0 + 1.2)));
}

/* ---------- classic centred lines (karaoke / minimal / banner / impact…) ---------- */
function drawLine(g, L, group, t, st, b, A, exitP) {
  const Ls = st.line, lift = -exitP * 16;
  const lineFill = lum(b.accent) > .55 ? b.accent : '#FFFFFF';
  if (Ls.lineBox) for (const ln of L.lines) {
    const first = ln.items[0].word, p = eBack(P(t, first.s - .1, first.s + .16), 1.4);
    if (p <= 0) continue;
    const h = Math.max(...ln.items.map(i => i.f.size)), bh = h * 1.1, x0 = ln.items[0].x - h * .3, y = ln.items[0].y - bh / 2 + lift;
    withT(g, x0 + (ln.w + h * .6) / 2, y + bh / 2, .7 + .3 * p, -.012, () => { g.save(); g.globalAlpha *= A * clamp(p * 2); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 24; g.shadowOffsetY = 8; rr(g, x0, y, ln.w + h * .6, bh, 10); g.fillStyle = lineFill; g.fill(); g.restore(); });
  }
  for (const it of L.items) {
    const ws = it.word.s, we = it.word.e;
    const tIn = st.ghost ? group.s - .05 + it.j * .03 : ws - .07;
    const p = P(t, tIn, tIn + .24);
    if (p <= 0) continue;
    const spoken = t >= ws - .04, active = spoken && t < Math.max(we, ws + .14) + .03;
    let sc = .5 + .5 * eBack(p, 2.2), alpha = clamp(p * 3), dy = (1 - eOut(p)) * it.f.size * .16, blur = 0;
    if (st.id === 'minimal' || st.ghost && !Ls.stroke) { sc = 1.1 - .1 * eOut(p); blur = (1 - eOut(p)) * 14; dy = 0; }
    if (st.ghost && !spoken) alpha *= Ls.stroke ? 1 : .32;
    if (active && Ls.activeScale) sc *= 1 + (Ls.activeScale - 1) * eOut(P(t, ws - .04, ws + .08));
    alpha *= A; blur += exitP * 10;
    let color = it.role === 'key' ? colorOf(st.key.color, b) : colorOf(st.small.color || 'white', b);
    if (Ls.lineBox) color = it.role === 'key' && lum(lineFill) > .45 && lum(b.primary) < .45 ? b.primary : onColor(lineFill);
    if (Ls.active && active) color = keyCol(b);
    const cxw = it.x + it.w / 2, y = it.y + dy + lift;
    withT(g, cxw, y, sc, 0, () => {
      let fx = it.role === 'key' ? st.key.fx : (st.small.fx || 'none');
      if (fx === 'box' && it.role === 'key') {
        const kp = eExpo(P(t, ws - .06, ws + .2)), pad = it.f.size * .2, bh = it.f.size * 1.12;
        if (kp > 0) { g.save(); g.globalAlpha *= alpha; g.translate(cxw, y); g.rotate(-.045); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = 22; g.shadowOffsetY = 6; rr(g, -(it.w / 2 + pad), -bh / 2, (it.w + pad * 2) * kp, bh, 12); g.fillStyle = colorOf(st.key.box || 'primary', b); g.fill(); g.restore(); color = onColor(colorOf(st.key.box || 'primary', b)); }
        fx = 'none';
      }
      if (Ls.stroke) text(g, it.s, it.x, y, it.f, { color, alpha, blur, align: 'left', stroke: ['#000', Ls.stroke], shadow: SH });
      else if (Ls.lineBox) text(g, it.s, it.x, y, it.f, { color, alpha, blur, align: 'left' });
      else fxText(g, it.s, it.x, y, it.f, color, fx, b, alpha, blur);
    });
  }
}

/* has this group a part to draw behind the person? */
export const hasBack = g => g?.comp === 'behind';

/* sample for the style picker */
export function sampleGroup(comp = 'stack', words = ['Ton', 'contenu', 'mérite', 'MIEUX'], keyIdx = 1) {
  const ws = words.map((w, i) => ({ w, s: i * .1, e: i * .1 + .1, key: i === keyIdx, i }));
  return { id: 'sample-' + comp + words.join('-'), words: ws, s: 0, e: 1, end: 999, key: keyIdx, text: words.join(' '), comp, side: 1 };
}
