/* Cadence — compositor: draws one frame of the edit (layouts, zooms, cards, b-roll, captions, overlays)
   and exports the finished video as MP4 (H.264 + AAC) with WebCodecs. */
import { W, H, FPS, clamp, lerp, P, eOut, eIn, eInOut, eExpo, eBack, eQuint, rr, withT, text, grain, vignette, rgba, onColor, lum, sparkle } from './core.js';
import { drawCaption, resolveStyle, hasBack } from './captions.js';
import { drawScene, drawBg, drawEnd, badge } from './scenes.js';
import { cutPerson, segReady, headTop } from './seg.js';
import { gradeCtx, lookParams, isNeutral, lutCached } from './grade.js';
const HEAD = new Map();
export const resetHeads = () => HEAD.clear();

/* blurred, darkened footage — background for full-screen cards (like the references) */
function blurredFootage(gg, main, t, R, fx, fy, fz) {
  gg.save(); gg.fillStyle = '#000'; gg.fillRect(0, 0, W, H);
  if (main) { gg.filter = 'blur(34px) saturate(1.15)'; cover(gg, main, -60, -60, W + 120, H + 120, fx, fy, fz * 1.15); gg.filter = 'none'; }
  gg.fillStyle = 'rgba(8,8,12,.58)'; gg.fillRect(0, 0, W, H);
  const gr = gg.createRadialGradient(W / 2, H * .45, 50, W / 2, H * .45, H * .7); gr.addColorStop(0, rgba(R.brand.primary, .16)); gr.addColorStop(1, 'rgba(0,0,0,.35)'); gg.fillStyle = gr; gg.fillRect(0, 0, W, H);
  gg.restore();
}

/* ---------- video sources ---------- */
export class VSrc {
  constructor(url) {
    const el = this.el = document.createElement('video');
    el.muted = true; el.playsInline = true; el.preload = 'auto'; el.src = url;
    this.ready = new Promise(r => { el.addEventListener('loadeddata', r, { once: true }); el.addEventListener('error', r, { once: true }); });
  }
  get dur() { return this.el.duration || 0; }
  get ok() { return this.el.readyState >= 2 && this.el.videoWidth > 0; }
  async seek(t) {
    const el = this.el; t = clamp(t, 0, Math.max(0, this.dur - .04));
    if (Math.abs(el.currentTime - t) < .002 && el.readyState >= 2) return;
    await new Promise(r => { const done = () => { el.removeEventListener('seeked', done); r(); }; el.addEventListener('seeked', done); el.currentTime = t; setTimeout(done, 3000); });
  }
  follow(t, playing) {
    const el = this.el; if (!this.dur) return;
    t = clamp(t, 0, this.dur - .04);
    if (playing) { if (el.paused) el.play().catch(() => { }); if (Math.abs(el.currentTime - t) > .18) el.currentTime = t; }
    else { if (!el.paused) el.pause(); if (Math.abs(el.currentTime - t) > .02 && !el.seeking) el.currentTime = t; }
  }
  pause() { if (!this.el.paused) this.el.pause(); }
}

/* draw a video (or image) to cover a rect, centred on a focus point (0..1 of the source) */
export function cover(g, el, dx, dy, dw, dh, fx = .5, fy = .4, zoom = 1) {
  const sw = el.videoWidth || el.naturalWidth || el.width, sh = el.videoHeight || el.naturalHeight || el.height;
  if (!sw || !sh) return;
  const s = Math.max(dw / sw, dh / sh) * zoom, vw = dw / s, vh = dh / s;
  const sx = clamp(fx * sw - vw / 2, 0, Math.max(0, sw - vw)), sy = clamp(fy * sh - vh / 2, 0, Math.max(0, sh - vh));
  g.drawImage(el, sx, sy, Math.min(vw, sw), Math.min(vh, sh), dx, dy, dw, dh);
}

export function zoomAt(zooms, t) {
  let z = 1;
  for (const k of zooms) { if (k.t > t) break; const p = k.mode === 'cut' ? eOut(P(t, k.t, k.t + .09)) : eInOut(P(t, k.t, k.t + (k.d || .4))); z = lerp(z, k.z, p); }
  return z;
}

const OFF = document.createElement('canvas'); OFF.width = W; OFF.height = H; const og = OFF.getContext('2d');
const OFF2 = document.createElement('canvas'); OFF2.width = W; OFF2.height = H; const og2 = OFF2.getContext('2d');

/* composite an offscreen layer with its entrance / exit transition */
function compositeLayer(g, src, ev, t, tin = .32, tout = .26) {
  const pin = P(t, ev.s - .02, ev.s + tin), pout = P(t, ev.e - tout, ev.e + .02);
  if (pin <= 0 || pout >= 1) return;
  g.save();
  if (pout > 0) {
    const q = eInOut(pout);
    if (ev.trans === 'slide') { g.translate(0, -H * eIn(pout)); g.drawImage(src, 0, 0); }
    else { const s = lerp(1, .9, q); g.globalAlpha = 1 - q; if (q > .02) g.filter = `blur(${(q * 16).toFixed(1)}px)`; g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2); g.drawImage(src, 0, 0); }
  } else if (pin < 1) {
    const q = eExpo(pin);
    if (ev.trans === 'slide') { g.translate(0, H * (1 - q)); g.drawImage(src, 0, 0); }
    else if (ev.trans === 'circle') { g.beginPath(); g.arc(W / 2, H * .6, Math.hypot(W, H) * eInOut(pin), 0, 7); g.clip(); g.drawImage(src, 0, 0); }
    else if (ev.trans === 'whip') { g.translate(W * (1 - q), 0); if (q < .95) g.filter = `blur(${((1 - q) * 22).toFixed(1)}px)`; g.drawImage(src, 0, 0); }
    else { const s = lerp(1.2, 1, q); g.globalAlpha = clamp(pin * 2.2); if (q < .97) g.filter = `blur(${((1 - q) * 18).toFixed(1)}px)`; g.translate(W / 2, H / 2); g.scale(s, s); g.translate(-W / 2, -H / 2); g.drawImage(src, 0, 0); }
  } else g.drawImage(src, 0, 0);
  g.restore();
}

const active = (evs, type, t, a = 0, b = 0) => evs.find(e => e.type === type && t >= e.s - a && t < e.e + b);
const clipTime = (ev, t, src) => { const d = src?.dur || 1; return ((t - ev.s) + Math.min(.4, d * .1)) % Math.max(.1, d - .05); };

/** Which sources must show which time at t (used to seek before exporting a frame, and to sync the preview). */
export function sourceTimes(R, t) {
  const out = [];
  const { plan, settings, srcs } = R;
  if (srcs.main && settings.layout !== 'motion') out.push([srcs.main, Math.min(t, plan.mainDur)]);
  for (const ev of plan.events) {
    if ((ev.type === 'broll' || ev.type === 'top') && ev.clip >= 0 && t >= ev.s - .4 && t < ev.e + .3) { const s = srcs.clips[ev.clip]; if (s) out.push([s, clipTime(ev, t, s)]); }
  }
  return out;
}

/**
 * Draw the frame at time t.
 * R = {plan, settings, brand, srcs:{main, clips[]}, logo}
 */
export function drawFrame(g, t, R) {
  const { plan, settings: S, brand: b, srcs } = R;
  const evs = plan.events, layout = S.layout;
  const fx = S.frame?.x ?? .5, fy = S.frame?.y ?? .4, fz = S.frame?.z ?? 1;
  const main = srcs.main?.ok ? srcs.main.el : null;
  const st = R.style || resolveStyle(S.capStyle, S.typo || {});
  const lutObj = lutCached(S.lut);
  const look = isNeutral(S.look, S.adj, lutObj) ? null : { ...lookParams(S.look, S.lookAmt ?? 1, S.adj || {}), lut: lutObj, lutAmt: S.lutAmt ?? 1 };
  const capOpts = { scale: S.capScale || 1, capY: capY(S), faceY: S.frame?.face ?? .33, cy: layout === 'split' ? H / 2 : undefined };
  g.save();
  g.fillStyle = '#000'; g.fillRect(0, 0, W, H);

  const end = active(evs, 'end', t, .05);
  if (end && t >= end.s + .32) { drawEnd(g, end, t, b, R.logo, S); finishOverlays(g, t, S, R); g.restore(); return; }

  let hideCaps = false;
  /* ---------- base layer ---------- */
  if (layout === 'motion') {
    const scenes = evs.filter(e => e.type === 'card');
    const i = scenes.findIndex(e => t >= e.s && t < e.e), cur = scenes[i < 0 ? (t < (scenes[0]?.s ?? 0) ? 0 : scenes.length - 1) : i];
    if (cur) {
      const prev = scenes[scenes.indexOf(cur) - 1];
      if (prev && t < cur.s + .34) { drawScene(g, prev, t, b); og.clearRect(0, 0, W, H); drawScene(og, cur, t, b); compositeLayer(g, OFF, { ...cur, e: 1e9 }, t, .34); }
      else drawScene(g, cur, t, b);
    } else drawBg(g, 'light', t, b);
    hideCaps = !S.motionCaptions;
  } else if (layout === 'split') {
    drawSplit(g, t, R, main, fx, fy, fz);
    if (look) gradeCtx(g, look);
  } else {
    if (main) {
      const imp = active(evs, 'impact', t);
      let dx = 0, dy = 0;
      if (imp) { const k = 1 - P(t, imp.s + .12, imp.e); dx = Math.sin(t * 93) * 16 * k; dy = Math.cos(t * 71) * 12 * k; }
      g.save(); g.translate(dx, dy);
      if (imp) g.filter = `grayscale(${clamp((1 - P(t, imp.e - .12, imp.e)) * 1).toFixed(2)}) contrast(1.15)`;
      const z = zoomAt(plan.zooms, t) * fz;
      cover(g, main, -Math.abs(dx), -Math.abs(dy), W + Math.abs(dx) * 2, H + Math.abs(dy) * 2, fx, fy, z);
      g.restore();
      if (look) gradeCtx(g, look);
      if (imp) { const fl = 1 - P(t, imp.s, imp.s + .14); if (fl > 0) { g.fillStyle = `rgba(255,255,255,${(fl * .55).toFixed(3)})`; g.fillRect(0, 0, W, H); } }
      if (S.grade !== false) { g.save(); g.globalCompositeOperation = 'soft-light'; g.fillStyle = rgba(b.primary, .08); g.fillRect(0, 0, W, H); g.restore(); vignette(g, .32); }
      /* giant word BEHIND the speaker: background -> word -> person cut-out */
      const cur = S.captions !== false ? currentGroup(plan.groups, t) : null;
      const backs = [leavingGroup(plan.groups, cur, t), cur].filter(x => x && hasBack(x));
      if (backs.length) {
        const person = segReady() ? cutPerson(g.canvas, Math.round(t * FPS)) : null;
        for (const grp of backs) {
          // lock the giant word on the head height measured the first time this phrase is drawn
          const key = grp.id + '|' + grp.s;
          if (!HEAD.has(key) && person && headTop() != null) HEAD.set(key, clamp(headTop() + .085, .14, .5));
          drawCaption(g, grp, t, st, b, { ...capOpts, faceY: HEAD.get(key) ?? capOpts.faceY, layer: 'back' });
        }
        if (person) g.drawImage(person, 0, 0);
      }
    } else drawBg(g, 'dark', t, b);
  }

  /* ---------- b-roll ---------- */
  const br = active(evs, 'broll', t, .05, .05);
  if (br && srcs.clips[br.clip]?.ok) {
    const el = srcs.clips[br.clip].el;
    if (br.mode === 'float') {
      const pin = eBack(P(t, br.s - .05, br.s + .35), 1.5), pout = eIn(P(t, br.e - .25, br.e + .02)), p = pin * (1 - pout);
      if (p > 0) {
        const cw = 820, ch = Math.min(820 * (el.videoHeight / el.videoWidth || .75), 980), cx = W / 2, cy = H * .3;
        withT(g, cx, cy, .6 + .4 * p, -.035 + .02 * Math.sin(t), () => {
          g.save(); g.globalAlpha = clamp(p * 1.5); g.shadowColor = 'rgba(0,0,0,.45)'; g.shadowBlur = 60; g.shadowOffsetY = 26; rr(g, cx - cw / 2, cy - ch / 2, cw, ch, 36); g.fillStyle = '#fff'; g.fill(); g.restore();
          g.save(); g.globalAlpha = clamp(p * 1.5); rr(g, cx - cw / 2 + 10, cy - ch / 2 + 10, cw - 20, ch - 20, 28); g.clip(); cover(g, el, cx - cw / 2 + 10, cy - ch / 2 + 10, cw - 20, ch - 20, .5, .5, 1 + (t - br.s) * .03); g.restore();
        });
      }
    } else {
      og.save(); og.fillStyle = '#000'; og.fillRect(0, 0, W, H); cover(og, el, 0, 0, W, H, .5, .5, 1.02 + (t - br.s) * .035); og.restore(); if (look) gradeCtx(og, look); vignette(og, .35);
      compositeLayer(g, OFF, br, t, .26, .22);
    }
  }

  /* ---------- full-screen motion cards ---------- */
  const card = active(evs, 'card', t, .05, .05);
  if (card && layout !== 'motion') {
    og.clearRect(0, 0, W, H);
    if (card.bg === 'blur') { blurredFootage(og, main, t, R, fx, fy, fz); drawScene(og, card, t, b, { x: 0, y: 0, w: W, h: H }, false); }
    else drawScene(og, card, t, b);
    compositeLayer(g, OFF, card, t);
    if (t > card.s + .1 && t < card.e - .1) hideCaps = true;
  }

  /* ---------- editorial card mode: footage shrinks into a card, type below ---------- */
  const cm = active(evs, 'cardmode', t, .1, .1);
  if (cm) {
    const pin = eQuint(P(t, cm.s - .08, cm.s + .42)), pout = eQuint(P(t, cm.e - .38, cm.e + .04)), p = pin * (1 - pout);
    if (p > 0) {
      og2.clearRect(0, 0, W, H); drawBg(og2, 'light', t, b, { x: 0, y: 0, w: W, h: H }, cm.n * 7 + 1);
      g.save(); g.globalAlpha = clamp(p * 3); g.drawImage(OFF2, 0, 0); g.restore();
      const T = { x: 70, y: 140, w: W - 140, h: 1020, r: 46 };
      const x = lerp(0, T.x, p), y = lerp(0, T.y, p), w = lerp(W, T.w, p), h = lerp(H, T.h, p), r = lerp(0, T.r, p);
      if (main) {
        g.save(); g.shadowColor = `rgba(0,0,0,${(.35 * p).toFixed(2)})`; g.shadowBlur = 60 * p; g.shadowOffsetY = 24 * p; rr(g, x, y, w, h, r); g.fillStyle = '#000'; g.fill(); g.restore();
        g.save(); rr(g, x, y, w, h, r); g.clip(); cover(g, main, x, y, w, h, fx, fy, fz * lerp(zoomAt(plan.zooms, t), 1.04, p)); g.restore();
      }
      if (p > .35) { g.save(); g.globalAlpha = clamp((p - .35) / .5); drawScene(g, { ...cm, bg: 'light' }, t, b, { x: 50, y: 1190, w: W - 100, h: 620 }, false); g.restore(); }
      hideCaps = hideCaps || p > .2;
    }
  }

  /* ---------- icons ---------- */
  const ic = active(evs, 'icon', t, 0, .05);
  if (ic && !hideCaps) {
    const p = P(t, ic.s - .08, ic.s + .3), q = eIn(P(t, ic.e - .15, ic.e + .05));
    const cy = capY(S) * H - 230 * (S.capScale || 1);
    g.save(); g.globalAlpha = 1 - q;
    badge(g, ic.icon, W * .76 + Math.sin(t * 2.2) * 6, cy + Math.cos(t * 1.8) * 8, 74, '#FFFFFF', b.primary, p, -.6);
    sparkle(g, W * .76 - 92, cy - 70, 16, '#fff', eOut(P(t, ic.s + .1, ic.s + .4)), t * 1.5);
    g.restore();
  }

  /* ---------- captions ---------- */
  if (!hideCaps && S.captions !== false) {
    const grp = currentGroup(plan.groups, t), out = leavingGroup(plan.groups, grp, t);
    const fy = x => HEAD.get(x.id + '|' + x.s) ?? capOpts.faceY;
    if (out) drawCaption(g, out, t, st, b, { ...capOpts, faceY: fy(out), layer: 'front' });
    if (grp) drawCaption(g, grp, t, st, b, { ...capOpts, faceY: fy(grp), layer: 'front' });
  }

  if (end) { og.clearRect(0, 0, W, H); drawEnd(og, end, t, b, R.logo, S); compositeLayer(g, OFF, { ...end, trans: 'circle', e: 1e9 }, t, .34); }
  finishOverlays(g, t, S, R);
  g.restore();
}

function finishOverlays(g, t, S, R) {
  if (S.rec) drawRec(g, t);
  if (S.watermark && R.logo) { const lw = 170, lh = lw * R.logo.height / R.logo.width; g.save(); g.globalAlpha = .92; g.drawImage(R.logo, 60, 90, lw, lh); g.restore(); }
  if (S.grain !== false) grain(g, t, .055);
}

export const capY = S => S.layout === 'split' ? .5 : (S.capY ?? .7);
export function currentGroup(groups, t) {
  let c = null;
  for (const gr of groups) { if (gr.s - .03 <= t) c = gr; else break; }
  return c && t < c.end + .2 ? c : null;
}
/* the phrase that is leaving while the next one comes in (kinetic layouts only) */
function leavingGroup(groups, cur, t) {
  if (!cur) return null;
  const i = groups.indexOf(cur), p = groups[i - 1];
  return p && p.comp && p.comp !== 'line' && t < p.end + .16 ? p : null;
}

function drawSplit(g, t, R, main, fx, fy, fz) {
  const { plan, brand: b, srcs } = R, half = H / 2;
  const tops = plan.events.filter(e => e.type === 'top');
  const i = tops.findIndex(e => t >= e.s && t < e.e), cur = tops[i], prev = tops[i - 1];
  const drawTop = (ev, gg) => {
    gg.save(); gg.beginPath(); gg.rect(0, 0, W, half); gg.clip();
    const src = ev && ev.clip >= 0 ? srcs.clips[ev.clip] : null;
    if (src?.ok) { cover(gg, src.el, 0, 0, W, half, .5, .5, 1.02 + ((t - ev.s) * .02)); }
    else {
      const grp = currentGroup(plan.groups, t) || plan.groups.find(x => x.s > t) || plan.groups[plan.groups.length - 1];
      if (grp) drawScene(gg, { type: 'card', words: grp.words, key: Math.max(0, grp.key), tpl: 'giant', bg: (ev?.idx ?? 0) % 2 ? 'brand' : 'light', n: ev?.idx ?? 0, s: grp.s, e: grp.end }, t, b, { x: 0, y: 0, w: W, h: half });
      else drawBg(gg, 'light', t, b, { x: 0, y: 0, w: W, h: half });
    }
    gg.restore();
  };
  if (cur && prev && t < cur.s + .3) {
    drawTop(prev, g);
    const q = eExpo(P(t, cur.s, cur.s + .3));
    g.save(); g.beginPath(); g.rect(W * (1 - q), 0, W * q, half); g.clip(); g.translate(W * (1 - q) * .25, 0); drawTop(cur, g); g.restore();
  } else drawTop(cur || tops[0], g);
  if (main) { g.save(); g.beginPath(); g.rect(0, half, W, half); g.clip(); cover(g, main, 0, half, W, half, fx, fy, fz * zoomAt(plan.zooms, t)); g.restore(); }
  else drawBg(g, 'dark', t, b, { x: 0, y: half, w: W, h: half });
  g.fillStyle = b.primary; g.fillRect(0, half - 4, W, 8);
}

function drawRec(g, t) {
  g.save(); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 5; const m = 64, L = 70;
  for (const [x, y, sx, sy] of [[m, m + 60, 1, 1], [W - m, m + 60, -1, 1], [m, H - m - 120, 1, -1], [W - m, H - m - 120, -1, -1]]) { g.beginPath(); g.moveTo(x, y + sy * L); g.lineTo(x, y); g.lineTo(x + sx * L, y); g.stroke(); }
  if (Math.floor(t * 1.6) % 2 === 0) { g.fillStyle = '#FF2D2D'; g.beginPath(); g.arc(m + 46, m + 118, 13, 0, 7); g.fill(); }
  text(g, 'REC', m + 108, m + 119, { fam: 'Inter Tight', w: 700, size: 34, ls: .05 }, { color: '#fff', align: 'center' });
  const s = Math.floor(t), fr = Math.floor((t % 1) * FPS);
  text(g, `00:${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}:${String(fr).padStart(2, '0')}`, W - m - 30, m + 119, { fam: 'Inter Tight', w: 600, size: 30, ls: .04 }, { color: '#fff', align: 'right' });
  g.restore();
}

/* ---------- export ---------- */
export async function exportMp4(R, mix, { onProgress, isCancelled, bitrate = 12e6 } = {}) {
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const g = cv.getContext('2d', { alpha: false });
  const N = Math.round(R.plan.dur * FPS);
  let vcodec = 'avc1.640028';
  for (const c of ['avc1.640028', 'avc1.640032', 'avc1.4d0028', 'avc1.42e028']) { try { if ((await VideoEncoder.isConfigSupported({ codec: c, width: W, height: H, bitrate, framerate: FPS })).supported) { vcodec = c; break; } } catch { } }
  const muxer = new Mp4Muxer.Muxer({ target: new Mp4Muxer.ArrayBufferTarget(), video: { codec: 'avc', width: W, height: H, frameRate: FPS }, audio: mix ? { codec: 'aac', sampleRate: 48000, numberOfChannels: 2 } : undefined, fastStart: 'in-memory' });
  let err = null;
  const venc = new VideoEncoder({ output: (c, m) => muxer.addVideoChunk(c, m), error: e => { err = e; } });
  venc.configure({ codec: vcodec, width: W, height: H, bitrate, framerate: FPS, latencyMode: 'quality' });
  if (mix) {
    const aenc = new AudioEncoder({ output: (c, m) => muxer.addAudioChunk(c, m), error: e => { err = e; } });
    aenc.configure({ codec: 'mp4a.40.2', sampleRate: 48000, numberOfChannels: 2, bitrate: 192000 });
    const L = mix.getChannelData(0), Rr = mix.numberOfChannels > 1 ? mix.getChannelData(1) : L;
    for (let i = 0; i < mix.length; i += 1024) { const n = Math.min(1024, mix.length - i), buf = new Float32Array(n * 2); buf.set(L.subarray(i, i + n), 0); buf.set(Rr.subarray(i, i + n), n); const ad = new AudioData({ format: 'f32-planar', sampleRate: 48000, numberOfFrames: n, numberOfChannels: 2, timestamp: Math.round(i / 48000 * 1e6), data: buf }); aenc.encode(ad); ad.close(); }
    await aenc.flush();
  }
  for (const s of [R.srcs.main, ...R.srcs.clips]) s?.pause();
  const t0 = performance.now();
  for (let f = 0; f < N; f++) {
    if (isCancelled?.()) { venc.close(); return null; }
    if (err) throw err;
    const t = f / FPS;
    for (const [src, st] of sourceTimes(R, t)) await src.seek(st);
    drawFrame(g, t, R);
    const vf = new VideoFrame(cv, { timestamp: Math.round(f * 1e6 / FPS), duration: Math.round(1e6 / FPS) });
    venc.encode(vf, { keyFrame: f % 60 === 0 }); vf.close();
    while (venc.encodeQueueSize > 6) await new Promise(r => venc.addEventListener('dequeue', r, { once: true }));
    if (f % 6 === 0) { const el = (performance.now() - t0) / 1000, eta = el / (f + 1) * (N - f - 1); onProgress?.(f / N, eta, cv); await new Promise(r => setTimeout(r, 0)); }
  }
  await venc.flush(); muxer.finalize();
  return muxer.target.buffer;
}
