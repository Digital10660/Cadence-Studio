/* Cadence — motion-design scenes: backgrounds, kinetic-typography templates, icon badges, end card.
   A scene draws into an area {x, y, w, h}; words are revealed exactly when they are spoken. */
import { W, H, clamp, lerp, P, eOut, eIn, eInOut, eExpo, eBack, eQuint, rr, withT, text, measure, fitSize, cleanWord, realWeight, rgba, onColor, lum, mixHex, sparkle, rng, hash, grain } from './core.js';
import { drawIcon, hasIcon, iconFor } from './icons.js';

/* ---------- palettes ---------- */
export function palette(bg, b) {
  if (bg === 'brand') return { bg: b.primary, ink: onColor(b.primary, b.ink, '#FFFFFF'), soft: rgba(onColor(b.primary, b.ink, '#FFFFFF'), .72), key: lum(b.primary) > .45 ? b.ink : (lum(b.accent) > .55 ? b.accent : '#FFFFFF'), box: onColor(b.primary, b.ink, '#FFFFFF'), boxInk: b.primary, blob1: mixHex(b.primary, '#FFFFFF', .25), blob2: mixHex(b.primary, '#000000', .25), grid: rgba(onColor(b.primary), .07) };
  if (bg === 'blur') return { bg: '#111', ink: '#FFFFFF', soft: 'rgba(255,255,255,.72)', key: lum(b.accent) > .8 ? b.primary : b.accent, box: b.primary, boxInk: onColor(b.primary), blob1: b.primary, blob2: b.accent, grid: 'rgba(0,0,0,0)', dark: true };
  if (bg === 'dark') return { bg: '#0B0B0E', ink: '#FFFFFF', soft: 'rgba(255,255,255,.66)', key: lum(b.accent) > .8 ? b.primary : b.accent, box: b.primary, boxInk: onColor(b.primary), blob1: b.primary, blob2: mixHex(b.accent, b.primary, .5), grid: 'rgba(255,255,255,.05)', dark: true };
  return { bg: b.light || '#F6F4F0', ink: b.ink || '#0E0E10', soft: rgba(b.ink || '#0E0E10', .62), key: b.primary, box: b.primary, boxInk: onColor(b.primary), blob1: b.primary, blob2: lum(b.accent) > .85 ? mixHex(b.primary, '#FFFFFF', .5) : b.accent, grid: rgba(b.ink || '#000', .055) };
}

/* Light paper with soft gaussian colour blobs + a fine grid (the look the user favours). */
export function drawBg(g, kind, t, b, a = { x: 0, y: 0, w: W, h: H }, seed = 1) {
  const pal = palette(kind, b), R = rng(seed);
  g.save(); g.beginPath(); g.rect(a.x, a.y, a.w, a.h); g.clip();
  g.fillStyle = pal.bg; g.fillRect(a.x, a.y, a.w, a.h);
  const blobs = [[.15 + R() * .2, .12 + R() * .2, .55, pal.blob1, kind === 'light' ? .26 : .5], [.75 + R() * .15, .82 + R() * .1, .6, pal.blob2, kind === 'light' ? .22 : .4], [.85, .2, .35, pal.blob1, kind === 'light' ? .12 : .25]];
  for (const [bx, by, br, col, al] of blobs) {
    const x = a.x + a.w * (bx + Math.sin(t * .35 + bx * 9) * .04), y = a.y + a.h * (by + Math.cos(t * .3 + by * 7) * .03), r = Math.max(a.w, a.h) * br;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, rgba(col, al)); gr.addColorStop(.55, rgba(col, al * .35)); gr.addColorStop(1, rgba(col, 0));
    g.fillStyle = gr; g.fillRect(a.x, a.y, a.w, a.h);
  }
  if (kind === 'dark') { // corner light leak, like the dark references
    const x = a.x + a.w * .1, y = a.y + a.h * .05, gr = g.createRadialGradient(x, y, 0, x, y, a.h * .6); gr.addColorStop(0, rgba(b.primary, .55)); gr.addColorStop(1, rgba(b.primary, 0)); g.fillStyle = gr; g.fillRect(a.x, a.y, a.w, a.h);
    const v = g.createRadialGradient(a.x + a.w / 2, a.y + a.h / 2, a.h * .2, a.x + a.w / 2, a.y + a.h / 2, a.h * .75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = v; g.fillRect(a.x, a.y, a.w, a.h);
  }
  g.restore();
  return pal;
}

/* ---------- helpers ---------- */
const disp = w => cleanWord(w.w, '?!%€$+');
const reveal = (t, w, d = .42) => P(t, w.s - .1, w.s - .1 + d);

/* word that rises out of a blur */
function riseWord(g, s, x, y, f, color, p, o = {}) {
  if (p <= 0) return;
  const e = eExpo(p);
  text(g, s, x, y + (1 - e) * f.size * .55, f, { color, alpha: clamp(p * 2.2) * (o.alpha ?? 1), blur: (1 - eOut(p)) * 16, align: o.align || 'center', shadow: o.shadow, glow: o.glow });
}
/* per-letter stagger (titles) */
function letters(g, s, cx, y, f, color, t, t0, o = {}) {
  const ch = [...s], ws = ch.map(c => measure(c, { ...f, ls: 0 })), tot = ws.reduce((a, b) => a + b, 0) + (f.ls ?? -0.02) * f.size * (ch.length - 1);
  let x = (o.align === 'left' ? cx : cx - tot / 2);
  ch.forEach((c, i) => {
    const p = P(t, t0 + i * (o.step ?? .028), t0 + i * (o.step ?? .028) + .5);
    if (p > 0 && c !== ' ') { const e = eExpo(p); text(g, c, x + ws[i] / 2, y + (1 - e) * f.size * .45, { ...f, ls: 0 }, { color, alpha: clamp(p * 2.5) * (o.alpha ?? 1), blur: (1 - eOut(p)) * 18, glow: o.glow, shadow: o.shadow }); }
    x += ws[i] + (f.ls ?? -0.02) * f.size;
  });
}
/* hand-drawn underline swoosh */
function swoosh(g, x, y, w, color, p, lw = 12) {
  if (p <= 0) return;
  g.save(); g.strokeStyle = color; g.lineWidth = lw; g.lineCap = 'round';
  const len = w * 1.15; g.setLineDash([len, len]); g.lineDashOffset = len * (1 - eOut(p));
  g.beginPath(); g.moveTo(x - w / 2, y + 6); g.bezierCurveTo(x - w / 6, y - 10, x + w / 5, y + 18, x + w / 2, y - 4); g.stroke(); g.restore();
}
/* glossy badge with a line icon */
export function badge(g, name, cx, cy, r, col1, col2, p, rot = 0) {
  if (p <= 0) return;
  const s = eBack(p, 2.2);
  withT(g, cx, cy, s, rot * (1 - eOut(p)), () => {
    g.save(); g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = r * .6; g.shadowOffsetY = r * .18;
    const gr = g.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r); gr.addColorStop(0, col1); gr.addColorStop(1, col2);
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fillStyle = gr; g.fill(); g.restore();
    const hl = g.createRadialGradient(cx - r * .35, cy - r * .5, 0, cx - r * .35, cy - r * .5, r * .75); hl.addColorStop(0, 'rgba(255,255,255,.55)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fillStyle = hl; g.fill();
    drawIcon(g, name, cx, cy, r * 1.0, onColor(col2), clamp(p * 1.4), 2);
  });
}

function fam(b, kind) { return kind === 'serif' ? b.serif : kind === 'caps' ? b.caps : kind === 'font' ? b.font : b.display; }
const F = (b, kind, w, size, it = false, ls) => { const f = fam(b, kind); return { fam: f, w: realWeight(f, w), size, it, ls: ls ?? (kind === 'serif' ? -.01 : -.035) }; };

/* ---------- templates ---------- */
function tplGiant(g, ev, t, b, pal, a) {
  const ws = ev.words, k = Math.max(0, ev.key), kw = ws[k];
  const before = ws.slice(0, k), after = ws.slice(k + 1);
  const ks = disp(kw).toUpperCase();
  const kf = F(b, 'display', 900, 0, false, -.04); kf.size = fitSize(ks, kf, a.w * .86, a.h * .2, 60);
  const sf = F(b, 'serif', 400, Math.min(84, a.w * .075), true);
  const cy = a.y + a.h * .5;
  const line = (arr, y) => { const items = arr.map(w => ({ w, s: disp(w), m: measure(disp(w), sf) })); const gap = sf.size * .28, tot = items.reduce((x, i) => x + i.m, 0) + gap * (items.length - 1); let x = a.x + a.w / 2 - tot / 2; for (const it of items) { riseWord(g, it.s, x + it.m / 2, y, sf, pal.soft, reveal(t, it.w)); x += it.m + gap; } };
  if (before.length) line(before, cy - kf.size * .78);
  letters(g, ks, a.x + a.w / 2, cy, kf, pal.key, t, kw.s - .12, { glow: pal.dark ? { color: pal.key, blur: 40 } : null });
  swoosh(g, a.x + a.w / 2, cy + kf.size * .55, measure(ks, kf) * .8, pal.dark ? '#FFFFFF' : (pal.key === b.primary ? (lum(b.accent) > .85 ? b.ink : b.accent) : b.primary), P(t, kw.s + .25, kw.s + .75), Math.max(8, kf.size * .06));
  if (after.length) line(after, cy + kf.size * .95);
  // floating sparkles
  const R = rng(ev.n * 7 + 3);
  for (let i = 0; i < 3; i++) { const p = eBack(P(t, kw.s + .1 + i * .08, kw.s + .5 + i * .08)); const sx = a.x + a.w * (.18 + R() * .64), sy = cy + (R() > .5 ? -1 : 1) * kf.size * (.75 + R() * .5); sparkle(g, sx + Math.sin(t * 2 + i) * 6, sy + Math.cos(t * 1.7 + i) * 6, 14 + R() * 12, i % 2 ? pal.key : (pal.dark ? '#fff' : b.primary), clamp(p) * .9, t * .6 + i); }
}

function tplStack(g, ev, t, b, pal, a) {
  // biggest size that keeps the phrase on 3 lines max (short phrases get huge type)
  let f, kf, items, gap, lines; const maxW = a.w * .84;
  for (const size of [Math.min(168, a.h * .13), 148, 130, 116, 104, 92, 80]) {
    f = F(b, 'display', 800, size, false, -.04); kf = F(b, 'serif', 400, size * 1.12, true, -.01);
    items = ev.words.map((w, i) => { const isK = i === ev.key; const s = disp(w); const ff = isK ? kf : f; return { w, s, f: ff, m: measure(s, ff), isK }; });
    gap = f.size * .26; lines = []; let cur = [], cw = 0;
    for (const it of items) { if (cur.length && cw + gap + it.m > maxW) { lines.push(cur); cur = []; cw = 0; } cur.push(it); cw += (cur.length > 1 ? gap : 0) + it.m; }
    if (cur.length) lines.push(cur);
    if (lines.length <= 3 && Math.max(...items.map(i => i.m)) <= maxW) break;
  }
  const lh = f.size * 1.08, tot = lines.length * lh, x0 = a.x + a.w * .08;
  lines.forEach((ln, li) => {
    let x = x0; const y = a.y + a.h / 2 - tot / 2 + lh * (li + .5);
    for (const it of ln) {
      const p = reveal(t, it.w);
      if (it.isK) {
        const kp = eExpo(P(t, it.w.s - .05, it.w.s + .3));
        if (kp > 0) { g.save(); rr(g, x - 14, y - it.f.size * .6, (it.m + 28) * kp, it.f.size * 1.2, 16); g.fillStyle = pal.box; g.fill(); g.restore(); }
        riseWord(g, it.s, x + it.m / 2, y, it.f, pal.boxInk, p);
      } else riseWord(g, it.s, x + it.m / 2, y, it.f, pal.ink, p);
      x += it.m + gap;
    }
  });
  // dashed label in the corner
  const lp = eOut(P(t, ev.s + .1, ev.s + .5));
  if (lp > 0) { g.save(); g.globalAlpha = lp; g.setLineDash([10, 8]); g.strokeStyle = pal.soft; g.lineWidth = 2.5; rr(g, x0, a.y + a.h / 2 - tot / 2 - 120, 150, 54, 27); g.stroke(); g.restore(); text(g, String(ev.n + 1).padStart(2, '0'), x0 + 75, a.y + a.h / 2 - tot / 2 - 93, F(b, 'font', 700, 28, false, .05), { color: pal.soft, alpha: lp }); }
}

function tplNumber(g, ev, t, b, pal, a) {
  const all = ev.words.map(disp).join(' ');
  const m = all.match(/(\d[\d\s.,]*)(\s*(%|€|\$|k|m|fcfa|francs?|euros?|ans|jours|heures|minutes|clients|vues|personnes)?)/i);
  const numStr = m ? m[1].trim() : '0', unit = m && m[2] ? m[2].trim() : '';
  const target = parseFloat(numStr.replace(/\s/g, '').replace(',', '.')) || 0;
  const isYear = /^(19|20)\d\d$/.test(numStr.replace(/\s/g, ''));
  const numWord = ev.words.find(w => /\d/.test(w.w)) || ev.words[0];
  const cp = eQuint(P(t, numWord.s - .1, numWord.s + .75));
  const from = isYear ? target - 30 : 0, v = lerp(from, target, cp);
  const decimals = (numStr.split(/[.,]/)[1] || '').length;
  let s = decimals ? v.toFixed(decimals).replace('.', ',') : Math.round(v).toLocaleString('fr-FR').replace(/ /g, ' ');
  if (isYear) s = String(Math.round(v));
  const nf = F(b, 'display', 900, 0, false, -.05); nf.size = fitSize(s + (unit.length <= 2 ? unit : ''), nf, a.w * .82, a.h * .24, 80);
  const cy = a.y + a.h * .44, ap = clamp(P(t, numWord.s - .15, numWord.s + .1) * 1.5);
  withT(g, a.x + a.w / 2, cy, .85 + .15 * eBack(ap), 0, () => text(g, s + (unit.length <= 2 ? unit : ''), a.x + a.w / 2, cy, nf, { color: pal.key, alpha: ap, blur: (1 - ap) * 14, glow: pal.dark ? { color: pal.key, blur: 50 } : null }));
  // remaining words keep their spoken order; a long unit ("jours", "clients") is shown in caps
  const sf = F(b, 'display', 700, Math.min(66, a.w * .062), false, -.03);
  const isUnit = w => unit.length > 2 && cleanWord(w.w, '').toLowerCase().startsWith(unit.toLowerCase());
  const items = ev.words.filter(w => !/\d/.test(w.w)).map(w => { const s2 = isUnit(w) ? disp(w).toUpperCase() : disp(w); return { s: s2, m: measure(s2, sf), w }; });
  const gap = sf.size * .28; let lines = [[]], lw = [0];
  for (const it of items) { const L = lines.length - 1; if (lines[L].length && lw[L] + gap + it.m > a.w * .82) { lines.push([]); lw.push(0); } lines[lines.length - 1].push(it); lw[lw.length - 1] += (lines[lines.length - 1].length > 1 ? gap : 0) + it.m; }
  lines.forEach((ln, li) => { let x = a.x + a.w / 2 - lw[li] / 2; const y = cy + nf.size * .72 + li * sf.size * 1.15; for (const it of ln) { riseWord(g, it.s, x + it.m / 2, y, sf, pal.ink, reveal(t, it.w)); x += it.m + gap; } });
  // ticker bars
  const bp = eOut(P(t, numWord.s, numWord.s + .8));
  for (let i = 0; i < 5; i++) { const bh = (40 + i * 34) * bp, bx = a.x + a.w / 2 - 150 + i * 64; g.save(); g.globalAlpha = .9; rr(g, bx, cy - nf.size * .62 - bh - 30, 40, bh, 10); g.fillStyle = i === 4 ? pal.key : rgba(pal.ink, .16); g.fill(); g.restore(); }
}

function tplIcon(g, ev, t, b, pal, a) {
  const k = Math.max(0, ev.key), kw = ev.words[k], name = iconFor(cleanWord(kw.w, '').toLowerCase().replace(/^(l|d|j|qu|n|s|m|t|c)['’]/, '')) || 'sparkles';
  const cy = a.y + a.h * .4, r = Math.min(a.w, a.h) * .16;
  if (hasIcon(name)) {
    // orbit ring
    const op = eOut(P(t, kw.s - .3, kw.s + .4));
    if (op > 0) { g.save(); g.globalAlpha = op * .8; g.strokeStyle = pal.key; g.lineWidth = 3; g.setLineDash([8, 14]); g.lineDashOffset = -t * 40; g.beginPath(); g.arc(a.x + a.w / 2, cy, r * 1.55 * (.8 + .2 * op), 0, 7); g.stroke(); g.restore();
      g.save(); g.globalAlpha = op; g.fillStyle = pal.key; const ang = t * 1.4; g.beginPath(); g.arc(a.x + a.w / 2 + Math.cos(ang) * r * 1.55, cy + Math.sin(ang) * r * 1.55, 10, 0, 7); g.fill(); g.restore(); }
    badge(g, name, a.x + a.w / 2, cy, r, mixHex(b.primary, '#FFFFFF', .35), b.primary, P(t, kw.s - .25, kw.s + .25), -.4);
  }
  const ks = disp(kw).toUpperCase(); const kf = F(b, 'display', 900, 0, false, -.04); kf.size = fitSize(ks, kf, a.w * .8, a.h * .1, 50);
  letters(g, ks, a.x + a.w / 2, cy + r * 1.95 + kf.size * .2, kf, pal.ink, t, kw.s);
  const others = ev.words.filter((_, i) => i !== k), sf = F(b, 'serif', 400, Math.min(70, a.w * .066), true);
  const items = others.map(w => ({ w, s: disp(w), m: measure(disp(w), sf) })), gap = sf.size * .26, tot = items.reduce((x, i) => x + i.m, 0) + gap * Math.max(0, items.length - 1);
  if (tot < a.w * .9) { let x = a.x + a.w / 2 - tot / 2; for (const it of items) { riseWord(g, it.s, x + it.m / 2, cy + r * 1.95 + kf.size * 1.05, sf, pal.soft, reveal(t, it.w)); x += it.m + gap; } }
}

function tplQuote(g, ev, t, b, pal, a) {
  const f = F(b, 'serif', 400, Math.min(92, a.w * .085), true, -.01);
  const kf = F(b, 'display', 900, f.size * .92, false, -.035);
  const items = ev.words.map((w, i) => { const isK = i === ev.key; const s = isK ? disp(w).toUpperCase() : disp(w); const ff = isK ? kf : f; return { w, s, f: ff, m: measure(s, ff), isK }; });
  const gap = f.size * .26, lines = []; let cur = [], cw = 0;
  for (const it of items) { if (cur.length && cw + gap + it.m > a.w * .8) { lines.push({ it: cur, w: cw }); cur = []; cw = 0; } cur.push(it); cw += (cur.length > 1 ? gap : 0) + it.m; }
  if (cur.length) lines.push({ it: cur, w: cw });
  const lh = f.size * 1.15, tot = lines.length * lh, top = a.y + a.h / 2 - tot / 2;
  const qp = eBack(P(t, ev.s, ev.s + .45));
  if (qp > 0) text(g, '“', a.x + a.w / 2, top - f.size * .55, F(b, 'serif', 400, f.size * 2.4, false), { color: pal.key, alpha: clamp(qp), blur: (1 - clamp(qp)) * 10 });
  lines.forEach((ln, li) => { let x = a.x + a.w / 2 - ln.w / 2; const y = top + lh * (li + .5); for (const it of ln.it) { riseWord(g, it.s, x + it.m / 2, y, it.f, it.isK ? pal.key : pal.ink, reveal(t, it.w)); x += it.m + gap; } });
}

const TPL = { giant: tplGiant, stack: tplStack, number: tplNumber, icon: tplIcon, quote: tplQuote };

/** Draw a full scene (background + template). */
export function drawScene(g, ev, t, b, a = { x: 0, y: 0, w: W, h: H }, withBg = true) {
  const pal = withBg ? drawBg(g, ev.bg, t, b, a, ev.n * 13 + 5) : palette(ev.bg, b);
  (TPL[ev.tpl] || tplGiant)(g, ev, t, b, pal, a);
  return pal;
}

/* ---------- end card ---------- */
export function drawEnd(g, ev, t, b, logoImg, settings) {
  const pal = drawBg(g, 'light', t, b, { x: 0, y: 0, w: W, h: H }, 99);
  const p = P(t, ev.s + .1, ev.s + .7);
  if (logoImg) {
    const s = eBack(p, 1.6), lw = Math.min(560, logoImg.width * (380 / logoImg.height)), lh = lw * logoImg.height / logoImg.width;
    withT(g, W / 2, H * .4, .6 + .4 * s, 0, () => { g.save(); g.globalAlpha = clamp(p * 2); g.drawImage(logoImg, W / 2 - lw / 2, H * .4 - lh / 2, lw, lh); g.restore(); });
  } else {
    const title = (settings.handle || String(b.name || '').replace(/\s*\(.*\)\s*/g, '') || 'Merci').trim();
    const tf = F(b, 'display', 900, 0, false, -.03); tf.size = fitSize(title, tf, W * .8, 130, 50);
    letters(g, title, W / 2, H * .4, tf, pal.ink, t, ev.s + .1);
  }
  const cta = settings.cta || 'Abonne-toi pour la suite';
  const cf = F(b, 'display', 800, fitSize(cta, F(b, 'display', 800, 60), W * .7, 58, 30), false, -.02);
  const bp = eBack(P(t, ev.s + .5, ev.s + .9), 1.8), bw = measure(cta, cf) + 110;
  if (bp > 0) withT(g, W / 2, H * .58, .5 + .5 * bp, 0, () => { g.save(); g.shadowColor = rgba(b.primary, .45); g.shadowBlur = 40; g.shadowOffsetY = 12; rr(g, W / 2 - bw / 2, H * .58 - 56, bw, 112, 56); g.fillStyle = b.primary; g.fill(); g.restore(); text(g, cta, W / 2, H * .58, cf, { color: onColor(b.primary) }); });
  if (settings.handle && logoImg) riseWord(g, settings.handle, W / 2, H * .66, F(b, 'font', 600, 46, false, -.01), pal.soft, P(t, ev.s + .8, ev.s + 1.3));
  for (let i = 0; i < 4; i++) sparkle(g, W / 2 + Math.cos(i * 1.7 + t) * 330, H * .4 + Math.sin(i * 2.3 + t * .8) * 260, 18 + i * 4, i % 2 ? b.primary : (lum(b.accent) > .85 ? b.ink : b.accent), eOut(P(t, ev.s + .3 + i * .1, ev.s + .8 + i * .1)), t + i);
}
