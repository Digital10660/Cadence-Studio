/* Cadence — sound: voice + music (auto-ducked) + sound design.
   Sound effects come from the user's own packs (studio/sfx/<category>/) when present,
   otherwise from a built-in synthesiser tuned like classic editing SFX (whooshes, pops, impacts, risers). */
import { rng } from './core.js';

const SR = 48000;
let _ac = null;
export const audioCtx = () => (_ac ||= new AudioContext({ sampleRate: SR }));

const decoded = new Map();
export async function decodeUrl(url) {
  if (!url) return null;
  if (decoded.has(url)) return decoded.get(url);
  const pr = (async () => {
    for (let k = 0; k < 4; k++) {
      try { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return await audioCtx().decodeAudioData(await r.arrayBuffer()); }
      catch { await new Promise(r => setTimeout(r, 400 * (k + 1))); }
    }
    return null;
  })();
  decoded.set(url, pr);
  const res = await pr; if (!res) decoded.delete(url);
  return res;
}
/* sound of an uploaded media file, extracted server-side (light, exact timing) */
export const audioUrl = m => m?.file ? '/audio/' + m.file : m?.url;

/* bring every pack sound to the same peak level (-6 dBFS) so packs mix evenly */
const NORM = new WeakSet();
function normalize(buf) {
  if (NORM.has(buf)) return buf;
  let pk = 0; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const a = Math.abs(d[i]); if (a > pk) pk = a; } }
  if (pk > 1e-4) { const k = .5 / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= k; } }
  NORM.add(buf); return buf;
}

/* user packs: {category: [AudioBuffer]} */
export async function loadSfxLibrary() {
  const lib = {};
  try {
    const list = await (await fetch('/api/sfx')).json();
    await Promise.all(Object.entries(list).map(async ([cat, urls]) => { lib[cat] = (await Promise.all(urls.map(decodeUrl))).filter(Boolean).map(normalize); }));
  } catch { /* no packs */ }
  return lib;
}

function noiseBuffer(ac, seconds = 2, seed = 1) {
  const b = ac.createBuffer(2, Math.ceil(SR * seconds), SR), r = rng(seed);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); let last = 0; for (let i = 0; i < d.length; i++) { const w = r() * 2 - 1; last = last * .55 + w * .45; d[i] = c ? last : w * .7 + last * .3; } }
  return b;
}
function impulse(ac, seconds = 1.4, decay = 3.2) {
  const b = ac.createBuffer(2, Math.ceil(SR * seconds), SR), r = rng(42);
  for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (r() * 2 - 1) * Math.pow(1 - i / d.length, decay); }
  return b;
}

/* ---------- synthesised SFX (each centred so its "hit" lands on t) ---------- */
function makeSynth(ac, out, send) {
  const NZ = noiseBuffer(ac, 3, 9);
  const nz = (t0, dur) => { const n = ac.createBufferSource(); n.buffer = NZ; n.loop = true; n.start(t0, (t0 * 7.13) % 2.5); n.stop(t0 + dur + .05); return n; };
  const env = (gn, t0, peakT, endT, peak, curve = 'lin') => { gn.gain.setValueAtTime(.0001, Math.max(0, t0)); if (curve === 'exp') gn.gain.exponentialRampToValueAtTime(peak, peakT); else gn.gain.linearRampToValueAtTime(peak, peakT); gn.gain.exponentialRampToValueAtTime(.0001, endT); };
  const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };
  const toOut = (node, sendAmt = .15) => { node.connect(out); if (sendAmt) { const s = ac.createGain(); s.gain.value = sendAmt; node.connect(s); s.connect(send); } };

  return {
    whoosh(t, gain, v) {
      // doppler pass-by: resonant "wind" body + air + low tonal glide, peak exactly on t
      const d = .62 + v * .3, pk = t, t0 = Math.max(0, pk - d * .62), end = pk + d * .38, dir = v > .5 ? 1 : -1;
      const layer = (f0, f1, f2, q, amp, type = 'bandpass', cascade = true) => {
        const src = nz(t0, d + .05), f = ac.createBiquadFilter(), f2b = ac.createBiquadFilter(); f.type = f2b.type = type; f.Q.value = q; f2b.Q.value = q * .7;
        for (const ff of [f, f2b]) { ff.frequency.setValueAtTime(f0, t0); ff.frequency.exponentialRampToValueAtTime(f1, pk); ff.frequency.exponentialRampToValueAtTime(f2, end); }
        const gn = ac.createGain(); gn.gain.setValueAtTime(.0001, t0); gn.gain.exponentialRampToValueAtTime(gain * amp, pk); gn.gain.exponentialRampToValueAtTime(.0001, end);
        const pan = ac.createStereoPanner(); pan.pan.setValueAtTime(-.8 * dir, t0); pan.pan.linearRampToValueAtTime(.8 * dir, end);
        toOut(cascade ? chain(src, f, f2b, gn, pan) : chain(src, f, gn, pan), .25);
      };
      layer(240, 1150 + v * 600, 280, 3.2, 1.6);
      layer(600, 2600 + v * 900, 700, 1.6, .55);
      layer(3500, 7500, 4200, .7, .12, 'highpass', false);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(95, t0); o.frequency.exponentialRampToValueAtTime(190, pk); o.frequency.exponentialRampToValueAtTime(70, end);
      const og = ac.createGain(); og.gain.setValueAtTime(.0001, t0); og.gain.exponentialRampToValueAtTime(gain * .16, pk); og.gain.exponentialRampToValueAtTime(.0001, end); o.start(t0); o.stop(end + .05); toOut(chain(o, og), 0);
    },
    swish(t, gain, v) {
      const d = .2 + v * .1, t0 = Math.max(0, t - d * .4), pk = t0 + d * .4, end = t0 + d;
      const src = nz(t0, d), f = ac.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.1;
      f.frequency.setValueAtTime(1600, t0); f.frequency.exponentialRampToValueAtTime(5200 + v * 2000, pk); f.frequency.exponentialRampToValueAtTime(2400, end);
      const gn = ac.createGain(); env(gn, t0, pk, end, gain * .7, 'exp');
      const pan = ac.createStereoPanner(); pan.pan.setValueAtTime(v > .5 ? .5 : -.5, t0); pan.pan.linearRampToValueAtTime(v > .5 ? -.5 : .5, end);
      toOut(chain(src, f, gn, pan), .12);
    },
    pop(t, gain, v) {
      const o = ac.createOscillator(); o.type = 'sine'; const f0 = 900 + v * 500;
      o.frequency.setValueAtTime(f0 * .45, t); o.frequency.exponentialRampToValueAtTime(f0, t + .012); o.frequency.exponentialRampToValueAtTime(f0 * .32, t + .07);
      const gn = ac.createGain(); env(gn, t, t + .004, t + .11, gain * .55);
      o.start(t); o.stop(t + .15); toOut(chain(o, gn), .1);
      const c = nz(t, .02), hp = ac.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3500; const cg = ac.createGain(); env(cg, t, t + .001, t + .018, gain * .25); toOut(chain(c, hp, cg), 0);
    },
    click(t, gain, v) {
      // tactile UI tap: short bright transient + small resonant body
      const c = nz(t, .02), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2600 + v * 1200; bp.Q.value = 1.2; const cg = ac.createGain(); env(cg, t, t + .0008, t + .012, gain * 1.1); toOut(chain(c, bp, cg), .04);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(820 + v * 260, t); o.frequency.exponentialRampToValueAtTime(520, t + .04); const og = ac.createGain(); env(og, t, t + .001, t + .05, gain * .38); o.start(t); o.stop(t + .07); toOut(chain(o, og), .03);
    },
    tick(t, gain) {
      for (let i = 0; i < 6; i++) { const tt = t + i * .085; const o = ac.createOscillator(); o.type = 'sine'; o.frequency.value = 2600 - i * 60; const og = ac.createGain(); env(og, tt, tt + .001, tt + .02, gain * .22); o.start(tt); o.stop(tt + .04); toOut(chain(o, og), 0); }
    },
    boom(t, gain, v) {
      // cinematic hit: transient + thud + sub drop + noise burst + room
      this.click(t, gain * .6, .9);
      const th = ac.createOscillator(); th.type = 'sine'; th.frequency.setValueAtTime(170, t); th.frequency.exponentialRampToValueAtTime(75, t + .22); const tg = ac.createGain(); env(tg, t, t + .003, t + .3, gain * .7); th.start(t); th.stop(t + .35); toOut(chain(th, tg), .2);
      const o = ac.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(78 + v * 12, t); o.frequency.exponentialRampToValueAtTime(30, t + 1.1);
      const sh = ac.createWaveShaper(); const cv = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; cv[i] = Math.tanh(x * 2.2); } sh.curve = cv;
      const gn = ac.createGain(); env(gn, t, t + .006, t + 1.25, gain * .95); o.start(t); o.stop(t + 1.3); toOut(chain(o, sh, gn), .3);
      const n = nz(t, .45), lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2400, t); lp.frequency.exponentialRampToValueAtTime(180, t + .4); const ng = ac.createGain(); env(ng, t, t + .004, t + .42, gain * .6); toOut(chain(n, lp, ng), .4);
    },
    riser(t, gain, v) {
      const d = .95, end = t + d;
      const n = nz(t, d), bp = ac.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2; bp.frequency.setValueAtTime(300, t); bp.frequency.exponentialRampToValueAtTime(7500, end);
      const gn = ac.createGain(); gn.gain.setValueAtTime(.0001, t); gn.gain.exponentialRampToValueAtTime(gain * .55, end - .02); gn.gain.linearRampToValueAtTime(.0001, end + .03); toOut(chain(n, bp, gn), .25);
      const o = ac.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(980, end); const lp = ac.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const og = ac.createGain(); og.gain.setValueAtTime(.0001, t); og.gain.exponentialRampToValueAtTime(gain * .07, end - .02); og.gain.linearRampToValueAtTime(.0001, end + .03); o.start(t); o.stop(end + .05); toOut(chain(o, lp, og), .2);
    },
    ding(t, gain, v) {
      // FM bell (metallic partials that decay naturally)
      const fc = 1180 + v * 220, car = ac.createOscillator(), mod = ac.createOscillator(), mg = ac.createGain(), og = ac.createGain();
      car.frequency.value = fc; mod.frequency.value = fc * 3.5; mg.gain.setValueAtTime(fc * 2.2, t); mg.gain.exponentialRampToValueAtTime(fc * .05, t + 1.2);
      mod.connect(mg); mg.connect(car.frequency); env(og, t, t + .003, t + 1.6, gain * .32);
      car.start(t); mod.start(t); car.stop(t + 1.7); mod.stop(t + 1.7); toOut(chain(car, og), .45);
      const o2 = ac.createOscillator(); o2.frequency.value = fc * 2; const g2 = ac.createGain(); env(g2, t, t + .002, t + .5, gain * .08); o2.start(t); o2.stop(t + .55); toOut(chain(o2, g2), .3);
    },
    shutter(t, gain) { this.click(t, gain, .2); this.click(t + .07, gain * .7, .8); },
    glitch(t, gain, v) { this.swish(t, gain * .8, v); this.click(t + .04, gain * .5, v); },
  };
}

/* place a user sample so that its loudest moment lands on t */
function playSample(ac, out, buf, t, gain, cat) {
  let start = t;
  if (cat === 'whoosh' || cat === 'swish') { const d = buf.getChannelData(0); let pk = 0, pi = 0; for (let i = 0; i < d.length; i += 64) { const a = Math.abs(d[i]); if (a > pk) { pk = a; pi = i; } } start = t - pi / buf.sampleRate; }
  if (cat === 'riser') start = t + .95 - buf.duration;
  const s = ac.createBufferSource(); s.buffer = buf; const gn = ac.createGain(); gn.gain.value = gain;
  s.connect(gn); gn.connect(out);
  if (start < 0) s.start(0, -start); else s.start(start);
}

/** Render the whole soundtrack (identical for preview and export). */
export async function renderMix(plan, project, settings, sfxLib) {
  const dur = Math.max(.5, plan.dur);
  const ac = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const comp = ac.createDynamicsCompressor(); comp.threshold.value = -8; comp.knee.value = 6; comp.ratio.value = 6; comp.attack.value = .003; comp.release.value = .2;
  const master = ac.createGain(); master.gain.value = .95; master.connect(comp); comp.connect(ac.destination);

  /* voice */
  let voice = null;
  if (project.main?.hasAudio && settings.voiceVol !== 0) {
    voice = await decodeUrl(audioUrl(project.main));
    if (!voice) throw new Error('Le son de la vidéo n’a pas pu être chargé. Vérifie que Cadence tourne toujours, puis réessaie.');
    { const s = ac.createBufferSource(); s.buffer = voice; const gn = ac.createGain(); gn.gain.value = settings.voiceVol ?? 1; s.connect(gn); gn.connect(master); s.start(0); }
  }

  /* music, ducked under the voice */
  if (project.music?.url && (settings.musicVol ?? .2) > 0) {
    const mus = await decodeUrl(audioUrl(project.music));
    if (mus) {
      const s = ac.createBufferSource(); s.buffer = mus; s.loop = true; const gn = ac.createGain(); s.connect(gn); gn.connect(master); s.start(0);
      const vol = settings.musicVol ?? .2, duck = settings.duck ?? .3;
      gn.gain.setValueAtTime(.0001, 0); gn.gain.exponentialRampToValueAtTime(vol, .6);
      if (voice) {
        const d = voice.getChannelData(0), win = Math.floor(voice.sampleRate * .1);
        let prev = 1;
        for (let i = 0, k = 0; i < d.length; i += win, k++) {
          let sum = 0; for (let j = i; j < Math.min(i + win, d.length); j += 8) sum += d[j] * d[j];
          const rms = Math.sqrt(sum / (win / 8)), on = rms > .02 ? duck : 1;
          if (on !== prev && k * .1 > .6) { gn.gain.setTargetAtTime(vol * on, k * .1, on < prev ? .05 : .25); prev = on; }
        }
      }
      gn.gain.setTargetAtTime(.0001, Math.max(.7, dur - 1.6), .45);
    }
  }

  /* sound design */
  if (settings.sfx !== false) {
    const bus = ac.createGain(); bus.gain.value = (settings.sfxVol ?? .7) * .9; bus.connect(master);
    const rev = ac.createConvolver(); rev.buffer = impulse(ac); const rg = ac.createGain(); rg.gain.value = .5; rev.connect(rg); rg.connect(bus);
    const syn = makeSynth(ac, bus, rev), R = rng(77);
    const used = {};
    for (const s of plan.sfx) {
      const v = R(), packs = sfxLib?.[s.k];
      if (packs && packs.length) { used[s.k] = (used[s.k] ?? -1) + 1; playSample(ac, bus, packs[used[s.k] % packs.length], s.t, s.g * .9, s.k); }
      else if (syn[s.k]) syn[s.k](Math.max(0, s.t), s.g, v);
    }
  }
  return ac.startRendering();
}

/* ---------- listen to one sound (Sound panel) ---------- */
export async function auditionSfx(cat, sfxLib, gain = .8) {
  const dur = cat === 'boom' || cat === 'ding' ? 2 : 1.6, ac = new OfflineAudioContext(2, Math.ceil(dur * SR), SR);
  const bus = ac.createGain(); bus.gain.value = .9; bus.connect(ac.destination);
  const rev = ac.createConvolver(); rev.buffer = impulse(ac); const rg = ac.createGain(); rg.gain.value = .5; rev.connect(rg); rg.connect(bus);
  const t = cat === 'riser' ? .05 : .55, packs = sfxLib?.[cat];
  if (packs?.length) playSample(ac, bus, packs[Math.floor(Math.random() * packs.length)], cat === 'riser' ? t + .95 - Math.min(.95, packs[0].duration) : t, gain, cat);
  else makeSynth(ac, bus, rev)[cat]?.(t, gain, Math.random());
  const buf = await ac.startRendering(), ctx = audioCtx(); await ctx.resume();
  const s = ctx.createBufferSource(); s.buffer = buf; s.connect(ctx.destination); s.start();
  return !!packs?.length;
}

/* ---------- preview playback of the rendered mix ---------- */
export class MixPlayer {
  constructor() { this.buf = null; this.src = null; this.t0 = 0; this.off = 0; this.playing = false; }
  set(buf) { const was = this.playing, t = this.time(); this.stop(); this.buf = buf; if (was) this.play(t); }
  play(at) { const ac = audioCtx(); ac.resume(); this.stop(); this.off = at; this.t0 = ac.currentTime; this.playing = true; if (!this.buf) return; const s = ac.createBufferSource(); s.buffer = this.buf; s.connect(ac.destination); s.start(0, Math.min(at, this.buf.duration - .01)); this.src = s; }
  stop() { if (this.src) { try { this.src.stop(); } catch { } this.src.disconnect(); this.src = null; } this.playing = false; }
  time() { return this.playing ? this.off + (audioCtx().currentTime - this.t0) : this.off; }
}
