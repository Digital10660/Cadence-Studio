/* Cadence Studio — UI: import, automatic edit, style pickers, transcript editing, preview, export. */
import { W, H, FPS, clamp, FONT_LIST, FONT_GROUPS, ensureFonts, clearMeasureCache } from './core.js';
import { makePlan } from './director.js';
import { PRESETS, resolveStyle, drawCaption, sampleGroup, clearCaptionCache } from './captions.js';
import { loadIcons } from './icons.js';
import { renderMix, MixPlayer, loadSfxLibrary, audioCtx, auditionSfx } from './audio.js';
import { VSrc, drawFrame, sourceTimes, exportMp4, resetHeads } from './compositor.js';
import { initSeg, segReady } from './seg.js';
import { TEMPLATES, TEMPLATE_CATS, applyTemplate, snapshotStyle } from './templates.js';
import { LOOKS, loadLut } from './grade.js';
import { PRESET_CATS } from './captions.js';

const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = t => { t = Math.max(0, t || 0); return `${String(Math.floor(t / 60)).padStart(2, '0')}:${(t % 60).toFixed(1).padStart(4, '0')}`; };
const uid = () => Math.random().toString(36).slice(2, 10);
const debounce = (fn, ms) => { let h; return (...a) => { clearTimeout(h); h = setTimeout(() => fn(...a), ms); }; };

const DEFAULT_SETTINGS = {
  layout: 'full', capStyle: 'neon', typo: {}, behind: true, look: 'clean', lookAmt: 1, adj: {}, lut: '/luts/kodak_2383_film.cube', lutAmt: .8, template: '', motion: 1, captions: true, capY: .68, capScale: 1,
  cards: true, zooms: true, icons: true, impacts: true, broll: true, cardBg: 'blur', grade: false, grain: true, rec: false, watermark: false,
  endCard: false, cta: 'Abonne-toi pour la suite', handle: '', motionCaptions: false,
  frame: { x: .5, y: .4, z: 1, face: .33 }, sfx: true, sfxVol: .7, voiceVol: 1, musicVol: .18, duck: .3, seed: 0,
};
const DEFAULT_BRAND = { id: 'cadence', name: 'Cadence', primary: '#FF5A1F', accent: '#FFD83D', ink: '#0E0E10', light: '#F6F4F0', font: 'Inter Tight', display: 'Inter Tight', serif: 'Instrument Serif', caps: 'Barlow Condensed', logo: null };
const newState = () => ({ id: uid(), name: 'Nouveau projet', main: null, clips: [], music: null, words: [], lang: 'fr', settings: structuredClone(DEFAULT_SETTINGS), brand: structuredClone(DEFAULT_BRAND), overrides: { kw: {}, card: {}, broll: {}, text: {} }, customFonts: [] });

let S = newState();
const R = { plan: null, settings: S.settings, brand: S.brand, srcs: { main: null, clips: [] }, logo: null };
let plan = null, sfxLib = {}, brands = [], luts = [], myStyles = [], tab = 'templates', tNow = 0;
const player = new MixPlayer();
const cv = $('#cv'), ctx = cv.getContext('2d');

/* ---------------------------------------------------------------- feedback */
function toast(msg, ms = 2600) { const el = $('#toast'); el.textContent = msg; el.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => el.hidden = true, ms); }
function busy(msg, p = null) { $('#busy').hidden = false; $('#busyText').textContent = msg; $('#busyBar').parentElement.style.visibility = p == null ? 'hidden' : 'visible'; if (p != null) $('#busyBar').style.width = `${Math.round(p * 100)}%`; }
const busyOff = () => { $('#busy').hidden = true; };

/* ---------------------------------------------------------------- server */
function upload(file, onP) {
  return new Promise((res, rej) => {
    const x = new XMLHttpRequest(); x.open('POST', '/api/upload?name=' + encodeURIComponent(file.name));
    x.upload.onprogress = e => onP?.(e.loaded / e.total);
    x.onload = () => x.status < 300 ? res(JSON.parse(x.responseText)) : rej(new Error(x.responseText));
    x.onerror = () => rej(new Error('Le serveur Cadence ne répond pas.')); x.send(file);
  });
}
/* "90" + "%" -> "90%", "vrai" + "?" -> "vrai?" (Whisper sometimes splits symbols off) */
function glueSymbols(words) {
  const out = [];
  for (const w of words) {
    const p = out[out.length - 1];
    if (p && (/^[%€$:;!?»”…,.]+$/.test(w.w) || /^['’]/.test(w.w) || /['’]$/.test(p.w))) { p.w += w.w; p.e = Math.max(p.e, w.e); p.p = Math.min(p.p ?? 1, w.p ?? 1); }
    else out.push({ ...w });
  }
  return out;
}
async function transcribe() {
  if (!S.main?.hasAudio) return;
  busy('Transcription : démarrage…', 0);
  const { job } = await (await fetch('/api/transcribe', { method: 'POST', body: JSON.stringify({ file: S.main.file, lang: S.lang === 'auto' ? '' : S.lang, model: S.model || '' }) })).json();
  for (;;) {
    await new Promise(r => setTimeout(r, 700));
    const j = await (await fetch('/api/job?id=' + job)).json();
    if (j.status === 'done') { S.words = glueSymbols(j.result.words); S.overrides = { kw: {}, card: {}, broll: {}, text: {} }; break; }
    if (j.status === 'error') { busyOff(); toast('Transcription impossible : ' + j.error, 6000); return; }
    busy(`${j.stage || 'Transcription'}… ${Math.round((j.progress || 0) * 100)} %`, j.progress || 0);
  }
  busyOff();
}
const saveNow = async () => {
  try {
    $('#saveState').textContent = 'Enregistrement…';
    await fetch('/api/project?id=' + S.id, { method: 'POST', body: JSON.stringify(S) });
    $('#saveState').textContent = 'Enregistré';
  } catch { $('#saveState').textContent = 'Non enregistré'; }
};
const scheduleSave = debounce(saveNow, 1500);

/* ---------------------------------------------------------------- sources */
async function setupSources() {
  for (const s of [R.srcs.main, ...R.srcs.clips]) s?.pause();
  R.srcs.main = S.main?.hasVideo ? new VSrc(S.main.url) : null;
  R.srcs.clips = S.clips.map(c => new VSrc(c.url));
  R.logo = null;
  if (S.brand.logo) { const im = new Image(); im.src = S.brand.logo; await im.decode().catch(() => { }); R.logo = im; }
  for (const f of S.customFonts) await registerFont(f.name, f.url);
  await ensureFonts([S.brand.font, S.brand.display, S.brand.serif, S.brand.caps, S.settings.typo?.small?.family, S.settings.typo?.key?.family]);
  await Promise.all([R.srcs.main?.ready, ...R.srcs.clips.map(c => c.ready)]);
}
async function registerFont(name, url) {
  if ([...document.fonts].some(f => f.family === name)) return;
  try { const ff = new FontFace(name, `url(${url})`); await ff.load(); document.fonts.add(ff); } catch { toast('Police illisible : ' + name); }
}

/* ---------------------------------------------------------------- edit plan + sound */
function rebuild({ panel = false, keepMix = false } = {}) {
  R.settings = S.settings; R.brand = S.brand;
  S.settings.typo ||= {}; S.settings.frame ||= { x: .5, y: .4, z: 1 }; S.settings.frame.face ??= .33;
  R.style = resolveStyle(S.settings.capStyle, S.settings.typo); resetHeads();
  plan = R.plan = makePlan({ words: S.words, settings: S.settings, overrides: S.overrides, clips: S.clips, mainDur: S.main?.duration || 0, segReady: segReady(), hasVideo: !!S.main?.hasVideo });
  if (tNow > plan.dur) tNow = 0;
  renderTimeline(); renderGroups(); renderStats();
  if (panel) renderPanel();
  if (!keepMix) scheduleMix();
  scheduleSave();
  $('#btnExport').disabled = !(plan.dur > .5);
}
const scheduleMix = debounce(async () => {
  if (!plan) return;
  try { const buf = await renderMix(plan, S, S.settings, sfxLib); player.set(buf); } catch (e) { console.error(e); toast(e.message || 'Son indisponible', 6000); }
}, 450);

function brandChanged() { clearCaptionCache(); clearMeasureCache(); ensureFonts([S.brand.font, S.brand.display, S.brand.serif, S.brand.caps]).then(() => { clearCaptionCache(); drawStyleCards(); rebuild({ keepMix: true }); }); }

/* ---------------------------------------------------------------- playback loop */
function setPlayIcon(on) { $('#icoPlay').innerHTML = on ? '<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>' : '<path d="M7 5l12 7-12 7z"/>'; }
function play() { if (!plan) return; if (tNow >= plan.dur - .05) tNow = 0; audioCtx().resume(); player.play(tNow); setPlayIcon(true); }
function pause() { tNow = player.time(); player.stop(); player.off = tNow; setPlayIcon(false); for (const s of [R.srcs.main, ...R.srcs.clips]) s?.pause(); }
function seek(t) { tNow = clamp(t, 0, plan?.dur || 0); if (player.playing) player.play(tNow); else player.off = tNow; }

let lastGroup = null;
function loop() {
  if (plan) {
    if (player.playing) { tNow = player.time(); if (tNow >= plan.dur) { pause(); tNow = plan.dur; } }
    const need = sourceTimes(R, tNow), used = new Set(need.map(n => n[0]));
    for (const [src, st] of need) src.follow(st, player.playing);
    for (const s of [R.srcs.main, ...R.srcs.clips]) if (s && !used.has(s)) s.pause();
    drawFrame(ctx, tNow, R);
    $('#playhead').style.left = `${(tNow / plan.dur) * 100}%`;
    $('#tc').textContent = `${fmt(tNow)} / ${fmt(plan.dur)}`;
    const g = plan.groups.find(x => tNow >= x.s - .05 && tNow < x.end);
    if (g?.id !== lastGroup) { document.querySelector('.grp.now')?.classList.remove('now'); if (g) { const el = document.querySelector(`.grp[data-id="${g.id}"]`); el?.classList.add('now'); if (player.playing) el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } lastGroup = g?.id; }
  } else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, W, H); }
  requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------- timeline */
function renderTimeline() {
  const el = $('#tlTracks'), d = plan.dur || 1, pc = t => `${(t / d) * 100}%`;
  const tr = (top, label, inner) => `<div class="trk" style="top:${top}px"><span class="lbl">${label}</span>${inner}</div>`;
  const NAMES = { card: 'Carte', cardmode: 'Carte édito', broll: 'B-roll', top: 'Écran haut', icon: 'Icône', impact: 'Impact', end: 'Fin' };
  const caps = plan.groups.map(g => `<div class="blk cap ${g.key >= 0 ? 'key' : ''}" style="left:${pc(g.s)};width:calc(${pc(g.e - g.s)} - 1px)" title="${esc(g.text)}">${esc(g.text)}</div>`).join('');
  const mo = plan.events.filter(e => ['card', 'cardmode', 'broll', 'top', 'end'].includes(e.type)).map(e => `<div class="blk ${e.type}" style="left:${pc(e.s)};width:calc(${pc(e.e - e.s)} - 1px)">${NAMES[e.type]}${e.tpl ? ' · ' + e.tpl : ''}</div>`).join('');
  const fx = plan.events.filter(e => ['icon', 'impact'].includes(e.type)).map(e => `<div class="blk ${e.type}" style="left:${pc(e.s)};width:calc(${pc(Math.max(.4, e.e - e.s))} - 1px)">${e.type === 'icon' ? e.icon : 'Impact'}</div>`).join('')
    + plan.zooms.slice(1).map(z => `<div class="zk" style="left:${pc(z.t)}" title="Zoom ×${z.z.toFixed(2)}"></div>`).join('');
  const sx = plan.sfx.map(s => `<div class="tick" style="left:${pc(s.t)}" title="${s.k}"></div>`).join('');
  el.innerHTML = tr(0, '', caps) + tr(26, '', mo) + tr(52, '', fx) + tr(78, '', sx);
}
function renderStats() {
  const c = t => plan.events.filter(e => t.includes(e.type)).length;
  const items = [['Sous-titres', plan.groups.length, '#8C8C9A'], ['Cartes', c(['card', 'cardmode']), 'var(--card)'], ['B-roll', c(['broll']), 'var(--broll)'], ['Icônes', c(['icon']), 'var(--icon)'], ['Zooms', Math.max(0, plan.zooms.length - 1), 'var(--zoom)'], ['SFX', plan.sfx.length, 'var(--accent2)']];
  $('#stats').innerHTML = items.filter(i => i[1]).map(([l, n, col]) => `<span class="chip"><i style="background:${col}"></i>${n} ${l}</span>`).join('');
}

/* ---------------------------------------------------------------- transcript editor */
function renderGroups() {
  const el = $('#groups'), sc = el.scrollTop;
  const cards = new Set(plan.events.filter(e => e.type === 'card' || e.type === 'cardmode').map(e => e.gid));
  const brolls = new Map(plan.events.filter(e => e.type === 'broll').map(e => [e.gid, e.clip]));
  if (!plan.groups.length) { el.innerHTML = `<p class="muted small" style="padding:12px">${S.main && !S.main.hasAudio ? 'Cette vidéo n’a pas de son : ajoute une voix off ou passe en mode texte.' : 'Le texte apparaîtra ici après la transcription.'}</p>`; return; }
  el.innerHTML = plan.groups.map(g => {
    const co = S.overrides.card[g.id], bo = S.overrides.broll[g.id];
    const cState = co === true ? 'on' : co === false ? 'off' : (cards.has(g.id) ? 'on auto' : 'auto');
    const bState = bo === -1 ? 'off' : bo !== undefined ? 'on' : (brolls.has(g.id) ? 'on auto' : 'auto');
    return `<div class="grp ${cards.has(g.id) ? 'hascard' : ''} ${brolls.has(g.id) ? 'hasbroll' : ''}" data-id="${g.id}" data-s="${g.s}">
      <span class="t">${fmt(g.s)}</span>
      <div class="words">${g.words.map(w => `<span class="w ${w.key ? 'k' : ''} ${w.p != null && w.p < .45 ? 'low' : ''}" data-i="${w.i}" title="${w.p != null && w.p < .45 ? 'Mot peut-être mal compris : double-clic pour corriger' : ''}">${esc(w.w)}</span>`).join('')}</div>
      <div class="gbtns">${S.settings.layout === 'motion' ? '' : `<button class="${cState} c" data-card="${g.id}" title="Carte motion : auto / forcée / jamais">✦</button>`}${S.clips.length && !['motion', 'split'].includes(S.settings.layout) ? `<button class="${bState} b" data-broll="${g.id}" title="B-roll : auto / clip choisi / jamais">${bo >= 0 ? bo + 1 : 'B'}</button>` : ''}</div>
    </div>`;
  }).join('');
  el.scrollTop = sc;
}
$('#groups').addEventListener('click', e => {
  const w = e.target.closest('.w'), cb = e.target.closest('[data-card]'), bb = e.target.closest('[data-broll]'), row = e.target.closest('.grp');
  if (e.target.closest('input')) return;
  if (w) {
    const i = +w.dataset.i, g = plan.groups.find(x => x.words.some(y => y.i === i)), cur = g.words.find(y => y.i === i).key;
    if (!cur) g.words.forEach(y => { if (y.key && y.i !== i) S.overrides.kw[y.i] = false; });
    S.overrides.kw[i] = !cur; rebuild(); return;
  }
  if (cb) { const id = +cb.dataset.card, o = S.overrides.card[id]; if (o === undefined) S.overrides.card[id] = true; else if (o === true) S.overrides.card[id] = false; else delete S.overrides.card[id]; rebuild(); return; }
  if (bb) { const id = +bb.dataset.broll, o = S.overrides.broll[id], n = S.clips.length; if (o === undefined) S.overrides.broll[id] = 0; else if (o === -1) delete S.overrides.broll[id]; else if (o + 1 < n) S.overrides.broll[id] = o + 1; else S.overrides.broll[id] = -1; rebuild(); return; }
  if (row) seek(+row.dataset.s);
});
$('#groups').addEventListener('dblclick', e => {
  const w = e.target.closest('.w'); if (!w) return;
  const i = +w.dataset.i, orig = S.words[i].w, inp = document.createElement('input');
  inp.value = S.overrides.text[i] ?? orig; w.textContent = ''; w.appendChild(inp); inp.focus(); inp.select();
  const commit = ok => { if (ok) { const v = inp.value.trim(); if (v && v !== orig) S.overrides.text[i] = v; else delete S.overrides.text[i]; } rebuild(); };
  inp.addEventListener('keydown', ev => { if (ev.key === 'Enter') commit(true); if (ev.key === 'Escape') commit(false); ev.stopPropagation(); });
  inp.addEventListener('blur', () => commit(true), { once: true });
});

/* ---------------------------------------------------------------- left panels */
const LAYOUTS = [
  ['full', 'Face caméra dynamique', 'Plein écran, zooms punch-in, sous-titres et cartes motion aux moments forts.', `<i class="sc-face" style="top:22px"></i><i class="sc-body" style="top:52px"></i><i class="sc-cap" style="top:72px"></i>`],
  ['split', 'Écran partagé', 'En haut : ton écran, tes b-rolls ou les mots-clés animés. En bas : ton visage. Sous-titres au centre.', `<i style="inset:0 0 50% 0;background:#3A3F55"></i><i class="sc-face" style="top:58px;width:18px;height:18px"></i><i class="sc-body" style="top:78px;width:34px;height:24px"></i><i class="sc-cap" style="top:47px;left:14px;right:14px;background:#FFD83D"></i>`],
  ['card', 'Carte éditoriale', 'Ta vidéo se transforme en carte sur fond clair, la typo prend le relais. Style podcast premium.', `<i style="inset:0;background:#EDEAE4"></i><i style="left:8px;right:8px;top:8px;height:52px;border-radius:7px;background:#55555F"></i><i class="sc-line" style="left:12px;right:20px;top:68px;background:#111"></i><i class="sc-line" style="left:12px;right:30px;top:77px;background:var(--accent)"></i>`],
  ['broll', 'B-roll cinéma', 'Plus d’images d’illustration plein écran, coupes rythmées, moins de cartes texte.', `<i class="sc-face" style="top:22px"></i><i class="sc-body" style="top:52px"></i><i style="left:6px;right:6px;top:10px;height:40px;border-radius:5px;background:#2EC4E6;opacity:.85"></i><i class="sc-cap" style="top:76px"></i>`],
  ['motion', 'Motion design pur', 'Typographie animée sur ta voix off ou ton texte : chaque phrase devient une scène.', `<i style="inset:0;background:#F2EFEA"></i><i class="sc-line" style="left:14px;right:24px;top:34px;background:#111;height:8px"></i><i class="sc-line" style="left:14px;right:14px;top:48px;background:var(--accent);height:12px"></i><i class="sc-line" style="left:20px;right:30px;top:66px;background:#8C8C9A"></i>`],
];
const sw = (k, label) => `<div class="row"><label>${label}</label><label class="switch"><input type="checkbox" data-set="${k}" ${get(k) ? 'checked' : ''}><span></span></label></div>`;
const range = (k, label, min, max, step, f = v => v) => `<div class="row"><label>${label}</label><input type="range" data-set="${k}" min="${min}" max="${max}" step="${step}" value="${get(k)}"><span class="val" data-val="${k}">${f(get(k))}</span></div>`;
const seg = (k, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-seg="${k}" data-v="${v}" class="${String(get(k)) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
const pct = v => `${Math.round(v * 100)} %`;
function get(path) { return path.split('.').reduce((o, k) => o?.[k], S.settings); }
function set(path, v) { const ks = path.split('.'); let o = S.settings; for (const k of ks.slice(0, -1)) o = o[k] ||= {}; o[ks[ks.length - 1]] = v; }
const fontGroups = cur => Object.entries({ ...FONT_GROUPS, ...(S.customFonts.length ? { 'Mes polices': S.customFonts.map(f => f.name) } : {}) }).map(([g, list]) => `<optgroup label="${esc(g)}">${list.map(f => `<option value="${esc(f)}" ${cur === f ? 'selected' : ''} style="font-family:'${esc(f)}'">${esc(f)}</option>`).join('')}</optgroup>`).join('');
const fontSel = k => `<select data-brand="${k}">${fontGroups(S.brand[k])}</select>`;
/* exact typeface for a caption role; empty = the brand font of the chosen type */
const familySel = (role, r) => { const brandFam = ({ font: S.brand.font, display: S.brand.display, serif: S.brand.serif, caps: S.brand.caps })[r.fam] || S.brand.font; return `<select data-typo="${role}.family"><option value="" ${!r.family ? 'selected' : ''}>Police de la marque (${esc(brandFam)})</option>${fontGroups(r.family)}</select>`; };

function renderPanel() {
  const p = $('#panel');
  if (tab === 'templates') {
    const all = [...TEMPLATES, ...myStyles];
    p.innerHTML = `<h3>Styles de montage</h3><p class="sub">Choisis un style : Cadence applique le montage, les sous-titres, la couleur (avec LUT), le motion et le son. Passe la souris sur une vignette pour la voir bouger.</p>
    <div class="note small">Pour <b>mélanger</b> : choisis un style ici, puis change les sous-titres, la couleur ou le montage dans les autres onglets. Enregistre le résultat dans « Mes styles ».</div>
    ${TEMPLATE_CATS.map(cat => { const list = all.filter(x => x.cat === cat); if (cat === 'Mes styles') return `<h4>Mes styles</h4><div class="sgrid3">${list.map(x => `<button class="scard v ${S.settings.template === x.id ? 'on' : ''}" data-tpl="${x.id}"><canvas width="216" height="384" data-tplprev="${x.id}"></canvas><div><b>${esc(x.name)}</b></div></button>`).join('')}<button class="scard v add" id="saveStyle"><div class="plus">+</div><div><b>Enregistrer</b></div></button></div>`;
      return `<h4>${cat}</h4><div class="sgrid3">${list.map(x => `<button class="scard v ${S.settings.template === x.id ? 'on' : ''}" data-tpl="${x.id}" title="${esc(x.desc)}"><video src="/app/refs/${x.ref}.mp4" poster="/app/refs/${x.ref}.jpg" muted loop playsinline preload="none"></video><div><b>${x.name}</b></div></button>`).join('')}</div>`; }).join('')}`;
    p.querySelectorAll('.scard video').forEach(v => { const b = v.closest('.scard'); b.addEventListener('mouseenter', () => v.play().catch(() => { })); b.addEventListener('mouseleave', () => { v.pause(); }); if (b.classList.contains('on')) v.play().catch(() => { }); });
    if (myStyles.length) drawThumbs('tpl');
    return;
  }
  if (tab === 'color') {
    const cats = [...new Set(Object.values(LOOKS).map(l => l.cat))];
    p.innerHTML = `<h3>Étalonnage</h3><p class="sub">Le rendu couleur cinéma de ta vidéo. Les sous-titres et les cartes gardent leurs vraies couleurs.</p>
    <h4>LUTs cinéma</h4><div class="sgrid3"><button class="scard v ${!S.settings.lut ? 'on' : ''}" data-lut=""><canvas width="216" height="384" data-lutprev=""></canvas><div><b>Sans LUT</b></div></button>${luts.map(l => `<button class="scard v ${S.settings.lut === l.url ? 'on' : ''}" data-lut="${esc(l.url)}"><canvas width="216" height="384" data-lutprev="${esc(l.url)}"></canvas><div><b>${esc(l.name)}</b></div></button>`).join('')}</div>
    ${range('lutAmt', 'Intensité du LUT', 0, 1, .05, pct)}
    <label class="drop-mini" style="margin-top:6px">+ Importer mes LUTs (.cube de Premiere, Resolve, After Effects…)<input type="file" id="lutFiles" accept=".cube" multiple hidden></label>
    <h4 style="margin-top:26px">Rendus rapides (s'ajoutent au LUT)</h4>
    ${cats.map(cat => `<h4>${cat}</h4><div class="sgrid3">${Object.entries(LOOKS).filter(([, l]) => l.cat === cat).map(([id, l]) => `<button class="scard v ${(S.settings.look || 'none') === id ? 'on' : ''}" data-look="${id}"><canvas width="216" height="384" data-lookprev="${id}"></canvas><div><b>${l.label}</b></div></button>`).join('')}</div>`).join('')}
    <h4>Réglages fins</h4>${range('lookAmt', 'Intensité', 0, 1.5, .05, pct)}${range('adj.exp', 'Exposition', -.6, .6, .02, v => (+v).toFixed(2))}${range('adj.con', 'Contraste', -.4, .6, .02, v => (+v).toFixed(2))}${range('adj.sat', 'Saturation', -.6, .6, .02, v => (+v).toFixed(2))}${range('adj.temp', 'Température', -.5, .5, .02, v => (+v).toFixed(2))}
    ${sw('grain', 'Grain cinéma')}${sw('grade', 'Teinte de la couleur de marque')}`;
    drawThumbs('look');
    return;
  }
  if (tab === 'layout') p.innerHTML = `<h3>Style de montage</h3><p class="sub">Choisis la structure : Cadence place zooms, cartes et b-rolls tout seul.</p>
    <div class="cards">${LAYOUTS.map(([id, t, d, sc]) => `<button class="lcard ${S.settings.layout === id ? 'on' : ''}" data-layout="${id}"><div class="schema">${sc}</div><div><b>${t}</b><small>${d}</small></div></button>`).join('')}</div>
    <h4>Rythme du montage</h4>${seg('motion', [[0, 'Sobre'], [1, 'Dynamique'], [2, 'Intense']])}
    <p class="muted small" style="margin-top:10px">Sobre : peu d'effets, très propre. Intense : zooms à chaque phrase, cartes fréquentes, icônes et impacts.</p>`;
  else if (tab === 'captions') {
    const st = R.style || resolveStyle(S.settings.capStyle, S.settings.typo), ty = S.settings.typo || {};
    const famOpts = r => FAMS.map(([v, l]) => `<option value="${v}" ${`${r.fam}:${r.it ? 1 : 0}` === v ? 'selected' : ''}>${l}</option>`).join('');
    const tseg = (k, cur, opts) => `<div class="seg">${opts.map(([v, l]) => `<button data-tseg="${k}" data-v="${v}" class="${String(cur) === String(v) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
    const CASES = [['as', 'Aa'], ['upper', 'AA'], ['lower', 'aa']];
    const segState = segReady() ? '✓ Détection de la personne prête : les mots géants passent derrière toi.' : 'Détection de la personne en chargement… (nécessaire pour « Derrière moi »)';
    p.innerHTML = `<h3>Sous-titres</h3><p class="sub">Chaque phrase est placée comme le ferait un motion designer : empilée, en escalier, en coin, derrière toi… synchronisée au mot près.</p>
    ${sw('captions', 'Afficher les sous-titres')}
    ${PRESET_CATS.map(cat => `<h4>${cat}</h4><div class="sgrid3">${Object.entries(PRESETS).filter(([, pr]) => pr.cat === cat).map(([id, pr]) => `<button class="scard v ${S.settings.capStyle === id ? 'on' : ''}" data-cap="${id}" title="${esc(pr.hint)}"><canvas width="216" height="384" data-prev="${id}"></canvas><div><b>${pr.label}</b></div></button>`).join('')}</div>`).join('')}
    <h4>Personnaliser</h4>
    <div class="sub2">Petits mots</div>
    <div class="fontrow">Police ${familySel('small', st.small)}</div>
    <div class="fontrow">Type <select data-typo="small.font">${famOpts(st.small)}</select></div>
    <div class="fontrow">Casse ${tseg('small.case', st.small.case, CASES)}</div>
    <div class="fontrow">Graisse ${tseg('small.w', st.small.w, WEIGHTS)}</div>
    <div class="fontrow">Effet <select data-typo="small.fx">${SMALL_FXS.map(([v, l]) => `<option value="${v}" ${(st.small.fx || 'none') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="fontrow">Couleur <div class="colrow">${tseg('small.color', st.small.color || 'white', COLS)}<input type="color" data-typo="small.color" value="${hexOf(st.small.color || 'white')}" title="Couleur libre"></div></div>
    <div class="row"><label>Taille des petits mots</label><input type="range" data-typo="smallScale" min=".6" max="1.8" step=".05" value="${st.smallScale}"><span class="val">×${(+st.smallScale).toFixed(2)}</span></div>
    <div class="sub2">Mot-clé</div>
    <div class="fontrow">Police ${familySel('key', st.key)}</div>
    <div class="fontrow">Type <select data-typo="key.font">${famOpts(st.key)}</select></div>
    <div class="fontrow">Casse ${tseg('key.case', st.key.case, CASES)}</div>
    <div class="fontrow">Graisse ${tseg('key.w', st.key.w, WEIGHTS)}</div>
    <div class="fontrow">Effet <select data-typo="key.fx">${FXS.map(([v, l]) => `<option value="${v}" ${st.key.fx === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="fontrow">Couleur <div class="colrow">${tseg('key.color', st.key.color, COLS)}<input type="color" data-typo="key.color" value="${hexOf(st.key.color)}" title="Couleur libre"></div></div>
    <div class="row"><label>Taille du mot-clé</label><input type="range" data-typo="keyScale" min=".6" max="1.5" step=".05" value="${st.keyScale}"><span class="val">×${(+st.keyScale).toFixed(2)}</span></div>
    <div class="sub2">Placements autorisés</div>
    <div class="chipset">${COMPS.map(([id, l]) => `<button class="tchip ${st.comps[id] ? 'on' : ''}" data-comp="${id}">${l}</button>`).join('')}</div>
    <div class="fontrow" style="margin-top:10px">Mot géant ${tseg('giant', st.giant || 'solid', [['solid', 'Plein'], ['fade', 'Dégradé'], ['outline', 'Contour'], ['accent', 'Couleur']])}</div>
    <div class="row"><label>Mots à venir en transparence</label><label class="switch"><input type="checkbox" data-typo="ghost" ${st.ghost ? 'checked' : ''}><span></span></label></div>
    <p class="muted small">${segState}</p>
    ${Object.keys(ty).length ? '<button class="btn small ghost" id="resetTypo">↺ Revenir au style d’origine</button>' : ''}
    <h4>Position et taille</h4>${range('capY', 'Hauteur des sous-titres', .45, .85, .01, pct)}${range('capScale', 'Taille', .7, 1.4, .05, v => `×${(+v).toFixed(2)}`)}${range('frame.face', 'Hauteur de ton visage', .15, .55, .01, pct)}
    ${S.settings.layout === 'motion' ? sw('motionCaptions', 'Sous-titres aussi sur les scènes motion') : ''}`;
    drawStyleCards();
  } else if (tab === 'motion') p.innerHTML = `<h3>Motion & effets</h3><p class="sub">Ce que le montage automatique a le droit de faire.</p>
    ${sw('cards', 'Cartes motion plein écran')}${sw('zooms', 'Zooms punch-in (jump cuts)')}${sw('icons', 'Icônes animées sur les mots-clés')}${sw('impacts', 'Impacts : N&B + secousse + flash')}${sw('broll', 'Insérer mes b-rolls')}
    <h4>Fond des cartes motion</h4>${seg('cardBg', [['blur', 'Vidéo floue'], ['light', 'Clair'], ['brand', 'Couleur'], ['dark', 'Sombre'], ['mix', 'Mix']])}
    <h4>Habillage</h4>${sw('grade', 'Étalonnage aux couleurs de la marque')}${sw('grain', 'Grain cinéma')}${sw('rec', 'Cadre caméra « REC »')}${sw('watermark', 'Logo en filigrane')}
    <h4>Fin de vidéo</h4>${sw('endCard', 'Carte de fin avec appel à l’action')}
    <div class="row"><label>Bouton</label><input class="inp" data-set="cta" value="${esc(S.settings.cta)}" style="width:170px"></div>
    <div class="row"><label>@ compte</label><input class="inp" data-set="handle" value="${esc(S.settings.handle)}" placeholder="@tonCompte" style="width:170px"></div>`;
  else if (tab === 'brand') p.innerHTML = `<h3>Marque</h3><p class="sub">Couleurs et typos appliquées partout : sous-titres, cartes, icônes, carte de fin.</p>
    <div class="row"><select id="brandKit" style="flex:1">${brands.map(b => `<option value="${esc(b.id)}" ${b.id === S.brand.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select><button class="btn small" id="saveKit">Enregistrer</button></div>
    <h4>Couleurs</h4><div class="colors">${[['primary', 'Principale'], ['accent', 'Accent'], ['ink', 'Texte'], ['light', 'Fond clair']].map(([k, l]) => `<label class="color"><input type="color" data-brand="${k}" value="${S.brand[k]}">${l}</label>`).join('')}</div>
    <h4>Typographies</h4>
    <div class="fontrow">Titres ${fontSel('display')}</div><div class="fontrow">Texte ${fontSel('font')}</div><div class="fontrow">Serif ${fontSel('serif')}</div><div class="fontrow">Condensée ${fontSel('caps')}</div>
    <label class="drop-mini" style="margin-top:10px">+ Importer ma police (.ttf, .otf, .woff2)<input type="file" id="fontFile" accept=".ttf,.otf,.woff,.woff2" hidden></label>
    <h4>Logo</h4>${S.brand.logo ? `<div class="item"><img src="${esc(S.brand.logo)}" style="object-fit:contain;background:#fff"><span>Logo</span><button id="rmLogo" title="Retirer">×</button></div>` : ''}
    <label class="drop-mini" style="margin-top:8px">+ Importer le logo (PNG transparent)<input type="file" id="logoFile" accept="image/*" hidden></label>`;
  else if (tab === 'media') p.innerHTML = `<h3>Médias</h3><p class="sub">Ta vidéo principale, tes b-rolls (ou ton enregistrement d'écran) et ta musique.</p>
    <h4>Vidéo principale</h4>${S.main ? `<div class="item"><span>${esc(S.main.name)}<br><small class="muted">${S.main.width ? S.main.width + '×' + S.main.height + ' · ' : ''}${fmt(S.main.duration)}</small></span></div>` : '<p class="muted small">Aucune</p>'}
    <div class="row"><label>Transcription</label><select id="model">${[['', 'Précise (medium)'], ['small', 'Rapide (small)']].map(([v, l]) => `<option value="${v}" ${(S.model || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="row"><label>Langue</label><select id="lang">${[['fr', 'Français'], ['en', 'Anglais'], ['auto', 'Détection auto']].map(([v, l]) => `<option value="${v}" ${S.lang === v ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn small" id="reTr" ${S.main?.hasAudio ? '' : 'disabled'}>Re-transcrire</button></div>
    ${S.main?.hasVideo ? `<h4>Cadrage du visage</h4>${range('frame.x', 'Horizontal', 0, 1, .01, pct)}${range('frame.y', 'Vertical', 0, 1, .01, pct)}${range('frame.z', 'Zoom', 1, 1.8, .01, v => `×${(+v).toFixed(2)}`)}` : ''}
    <h4>B-roll / écran</h4><label class="drop-mini">+ Ajouter des vidéos (plusieurs possibles)<input type="file" id="clipFiles" accept="video/*" multiple hidden></label>
    <div class="list">${S.clips.map((c, i) => `<div class="item"><video src="${esc(c.url)}#t=0.5" muted preload="metadata"></video><span>${i + 1}. ${esc(c.name)}<br><small class="muted">${fmt(c.duration)}</small></span><button data-rmclip="${i}" title="Retirer">×</button></div>`).join('')}</div>
    <h4>Musique</h4>${S.music ? `<div class="item"><span>♪ ${esc(S.music.name)}</span><button id="rmMusic" title="Retirer">×</button></div>` : ''}
    <label class="drop-mini" style="margin-top:8px">+ ${S.music ? 'Remplacer' : 'Ajouter'} la musique<input type="file" id="musicFile" accept="audio/*,video/*" hidden></label>`;
  else if (tab === 'sound') {
    const counts = Object.entries(sfxLib).map(([k, v]) => `${k} : ${v.length}`).join(' · ');
    p.innerHTML = `<h3>Son</h3><p class="sub">Whooshes, pops et impacts placés sur chaque transition, mixés sous la voix. La musique baisse automatiquement quand tu parles.</p>
    ${sw('sfx', 'Sound design automatique')}${range('sfxVol', 'Effets sonores', 0, 1.5, .05, pct)}${range('voiceVol', 'Voix', 0, 1.5, .05, pct)}${range('musicVol', 'Musique', 0, .6, .01, pct)}${range('duck', 'Musique sous la voix', .05, 1, .05, pct)}
    <h4>Écouter les sons</h4>
    <div class="chipset">${[['whoosh', 'Whoosh'], ['swish', 'Swish'], ['pop', 'Pop'], ['click', 'Clic'], ['boom', 'Impact'], ['riser', 'Montée'], ['ding', 'Ding'], ['tick', 'Tic']].map(([k, l]) => `<button class="tchip" data-aud="${k}">▶ ${l}${sfxLib[k]?.length ? ' ★' : ''}</button>`).join('')}</div>
    <p class="muted small">★ = son de ton pack. Sans pack, Cadence utilise ses sons intégrés.</p>
    <h4>Mes packs SFX</h4>
    <div class="note">Pour un rendu identique à tes montages After Effects, dépose tes propres sons dans le dossier <code>sfx</code> de Cadence, rangés par type : <code>whoosh</code>, <code>swish</code>, <code>pop</code>, <code>click</code>, <code>boom</code>, <code>riser</code>, <code>ding</code>, <code>tick</code>… Ils remplacent alors les sons intégrés.<br><br><b>Chargés :</b> ${counts.replace(/[a-z]+ : 0( · )?/g, '') || 'aucun, sons intégrés utilisés'}</div>
    <div class="row"><button class="btn small" id="openSfx">Ouvrir le dossier SFX</button><button class="btn small" id="reloadSfx">Recharger</button></div>`;
  }
}

const FAMS = [['font:0', 'Sans (texte)'], ['display:0', 'Titres'], ['caps:0', 'Condensée'], ['caps:1', 'Condensée italique'], ['serif:1', 'Serif italique'], ['serif:0', 'Serif droite'], ['font:1', 'Sans italique']];
const WEIGHTS = [[300, 'Fine'], [500, 'Normale'], [700, 'Grasse'], [900, 'Noire']];
const COLS = [['white', 'Blanc'], ['accent', 'Accent'], ['primary', 'Principale']];
const SMALL_FXS = [['none', 'Aucun (ombre douce)'], ['glow', 'Lueur'], ['neon', 'Néon'], ['gradient', 'Dégradé'], ['outline', 'Contour']];
function hexOf(c) { if (typeof c === 'string' && c[0] === '#') return c; return c === 'accent' ? S.brand.accent : c === 'primary' ? S.brand.primary : '#ffffff'; }
const FXS = [['none', 'Aucun'], ['glow', 'Lueur'], ['neon', 'Néon (lueur + dégradé)'], ['gradient', 'Dégradé'], ['outline', 'Contour'], ['box', 'Bloc couleur'], ['underline', 'Souligné']];
const COMPS = [['line', 'Lignes'], ['stack', 'Empilé'], ['stair', 'Escalier'], ['corner', 'Coin'], ['shoulder', 'Épaule'], ['behind', 'Derrière moi'], ['number', 'Chiffres']];
/* style thumbnails: a whole 9:16 frame with a silhouette, so the placement is visible */
const SAMPLES = {
  neon: [['If', 'the', 'Prospects', 'meet', 'you'], 2, 'stair'], createur: [['J’ai', 'cumulé', '+807K', 'de', 'vues'], 2, 'number'],
  editorial: [['le', 'TOP', 'des', 'facs'], 1, 'behind'], serif: [['tout', 'commence', 'ici'], 1, 'stack'],
};
const PREV = document.createElement('canvas'); PREV.width = W; PREV.height = H; const pv = PREV.getContext('2d');
function silhouette(g) {
  g.save(); const gr = g.createLinearGradient(0, 300, 0, H); gr.addColorStop(0, '#6A5B52'); gr.addColorStop(1, '#2A2420'); g.fillStyle = gr;
  g.beginPath(); g.ellipse(W / 2, H * .3, 170, 210, 0, 0, 7); g.fill(); g.beginPath(); g.moveTo(W / 2 - 420, H); g.bezierCurveTo(W / 2 - 400, H * .5, W / 2 + 400, H * .5, W / 2 + 420, H); g.fill(); g.restore();
}
function drawStyleCards() {
  document.querySelectorAll('canvas[data-prev]').forEach(c => {
    const id = c.dataset.prev, st = resolveStyle(id, id === S.settings.capStyle ? S.settings.typo : {});
    const [words, k, comp0] = SAMPLES[id] || [['Ton', 'contenu', 'mérite', 'mieux'], 1, 'line'];
    const comp = st.comps[comp0] ? comp0 : Object.keys(st.comps)[0];
    const bg = pv.createLinearGradient(0, 0, 0, H); bg.addColorStop(0, '#3A3A44'); bg.addColorStop(1, '#141418'); pv.fillStyle = bg; pv.fillRect(0, 0, W, H);
    const grp = sampleGroup(comp, words, k), o = { scale: 1, capY: .66, faceY: .3, noExit: true };
    if (comp === 'behind') { drawCaption(pv, grp, 3, st, S.brand, { ...o, layer: 'back' }); silhouette(pv); drawCaption(pv, grp, 3, st, S.brand, { ...o, layer: 'front' }); }
    else { silhouette(pv); drawCaption(pv, grp, id === 'karaoke' ? .26 : 3, st, S.brand, o); }
    c.getContext('2d').drawImage(PREV, 0, 0, c.width, c.height);
  });
}
/* real-frame thumbnails of every template / colour look (rendered from the user's own video) */
let thumbJob = 0;
async function drawThumbs(kind) {
  if (!plan) return;
  const job = ++thumbJob;
  pause();
  if (kind === 'tpl') { const g0 = plan.groups.find(g => g.key >= 0 && g.s > 1.2); seek(g0 ? g0.words[g0.key].s + .5 : Math.min(2.5, plan.dur * .3)); }
  const t = tNow, sel = kind === 'tpl' ? 'canvas[data-tplprev]' : 'canvas[data-lookprev], canvas[data-lutprev]';
  for (const c of document.querySelectorAll(sel)) {
    if (job !== thumbJob) return;
    let st, pl;
    if (kind === 'tpl') {
      const tpl = [...TEMPLATES, ...myStyles].find(x => x.id === c.dataset.tplprev); if (!tpl) continue; st = applyTemplate(S.settings, tpl);
      if (st.lut) await loadLut(st.lut).catch(() => null);
      if (st.layout !== 'motion') st.cards = false;
      pl = makePlan({ words: S.words, settings: st, overrides: S.overrides, clips: S.clips, mainDur: S.main?.duration || 0, segReady: segReady(), hasVideo: !!S.main?.hasVideo });
    } else {
      const isLut = 'lutprev' in c.dataset;
      st = isLut ? { ...S.settings, look: 'none', adj: {}, lut: c.dataset.lutprev || null, lutAmt: 1, captions: false } : { ...S.settings, look: c.dataset.lookprev, lookAmt: 1, adj: {}, lut: null, captions: false };
      if (st.lut) await loadLut(st.lut).catch(() => null);
      pl = { ...plan, events: plan.events.filter(e => !['card', 'cardmode', 'broll', 'end', 'icon'].includes(e.type)) };
    }
    const R2 = { ...R, settings: st, style: resolveStyle(st.capStyle, st.typo || {}), plan: pl };
    try { for (const [src, tt] of sourceTimes(R2, t)) await src.seek(tt); drawFrame(pv, t, R2); c.getContext('2d').drawImage(PREV, 0, 0, c.width, c.height); } catch (e) { console.warn(e); }
    await new Promise(r => setTimeout(r, 0));
  }
}
function setTypo(path, v) { const ty = S.settings.typo ||= {}; const [a, b] = path.split('.'); if (b) { ty[a] = { ...(ty[a] || {}), [b]: v }; } else ty[a] = v; }
function typoChanged() { clearCaptionCache(); const sc = panel.scrollTop; rebuild({ panel: true, keepMix: false }); panel.scrollTop = sc; }

function selectTab(name) { tab = name; document.querySelectorAll('#rail button').forEach(x => x.classList.toggle('on', x.dataset.tab === name)); }
$('#rail').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (!b) return; const same = tab === b.dataset.tab; selectTab(b.dataset.tab); renderPanel(); if (matchMedia('(max-width: 900px)').matches) document.body.classList.toggle('show-panel', !(same && document.body.classList.contains('show-panel'))); });
$('#btnScript').addEventListener('click', () => document.body.classList.toggle('show-script'));
$('#viewer').addEventListener('pointerdown', () => document.body.classList.remove('show-panel', 'show-script'), true);
const panel = $('#panel');
panel.addEventListener('click', async e => {
  const t = e.target;
  const L = t.closest('[data-layout]'); if (L) { S.settings.layout = L.dataset.layout; if (L.dataset.layout === 'split' && !['banner', 'impact', 'karaoke'].includes(S.settings.capStyle)) S.settings.capStyle = 'banner'; rebuild({ panel: true }); return; }
  const TP = t.closest('[data-tpl]'); if (TP) { const tpl = [...TEMPLATES, ...myStyles].find(x => x.id === TP.dataset.tpl); S.settings = applyTemplate(S.settings, tpl); if (S.settings.lut) await loadLut(S.settings.lut).catch(() => toast('LUT illisible')); clearCaptionCache(); document.querySelectorAll('[data-tpl]').forEach(x => x.classList.toggle('on', x === TP)); rebuild(); toast('Style « ' + tpl.name + ' » appliqué'); return; }
  if (t.closest('#saveStyle')) { const name = prompt('Nom de ton style :', 'Mon style ' + (myStyles.length + 1)); if (!name) return; const st = snapshotStyle(S.settings, name); myStyles.push(st); S.settings.template = st.id; await fetch('/api/styles', { method: 'POST', body: JSON.stringify(myStyles) }); toast('Style « ' + name + ' » enregistré'); renderPanel(); return; }
  const LU = t.closest('[data-lut]'); if (LU) { const url = LU.dataset.lut || null; if (url) await loadLut(url).catch(() => toast('LUT illisible')); S.settings.lut = url; document.querySelectorAll('[data-lut]').forEach(x => x.classList.toggle('on', x === LU)); scheduleSave(); return; }
  const LK = t.closest('[data-look]'); if (LK) { S.settings.look = LK.dataset.look; document.querySelectorAll('[data-look]').forEach(x => x.classList.toggle('on', x === LK)); scheduleSave(); return; }
  const C = t.closest('[data-cap]'); if (C) { S.settings.capStyle = C.dataset.cap; S.settings.typo = {}; typoChanged(); return; }
  const TS = t.closest('[data-tseg]'); if (TS) { const v = TS.dataset.v; setTypo(TS.dataset.tseg, /\.w$/.test(TS.dataset.tseg) ? +v : v); if (TS.dataset.tseg === 'small.w') setTypo('small.wLine', +v); typoChanged(); return; }
  const CP = t.closest('[data-comp]'); if (CP) { const cur = { ...(R.style?.comps || {}) }, on = {}; for (const [id] of COMPS) on[id] = !!cur[id]; on[CP.dataset.comp] = !on[CP.dataset.comp]; setTypo('comps', on); typoChanged(); return; }
  if (t.id === 'resetTypo') { S.settings.typo = {}; typoChanged(); return; }
  const AU = t.closest('[data-aud]'); if (AU) { const own = await auditionSfx(AU.dataset.aud, sfxLib, (S.settings.sfxVol ?? .7) + .2); AU.title = own ? 'Son de ton pack' : 'Son intégré'; return; }
  const G = t.closest('[data-seg]'); if (G) { const v = G.dataset.v; set(G.dataset.seg, isNaN(+v) ? v : +v); rebuild({ panel: true }); return; }
  if (t.id === 'saveKit') { const name = prompt('Nom du kit de marque :', S.brand.name || 'Ma marque'); if (!name) return; const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-'); const kit = { ...S.brand, id, name }; brands = [...brands.filter(b => b.id !== id), kit]; S.brand = structuredClone(kit); await fetch('/api/brands', { method: 'POST', body: JSON.stringify(brands) }); toast('Kit « ' + name + ' » enregistré'); renderPanel(); return; }
  if (t.id === 'rmLogo') { S.brand.logo = null; R.logo = null; renderPanel(); rebuild({ keepMix: true }); return; }
  if (t.id === 'rmMusic') { S.music = null; renderPanel(); rebuild(); return; }
  if (t.dataset.rmclip) { const i = +t.dataset.rmclip; S.clips.splice(i, 1); R.srcs.clips[i]?.pause(); R.srcs.clips.splice(i, 1); S.overrides.broll = {}; renderPanel(); rebuild(); return; }
  if (t.id === 'reTr') { S.words = []; await transcribe(); rebuild({ panel: true }); return; }
  if (t.id === 'openSfx') { fetch('/api/open?what=sfx', { method: 'POST' }); return; }
  if (t.id === 'reloadSfx') { sfxLib = await loadSfxLibrary(); renderPanel(); scheduleMix(); toast('Packs SFX rechargés'); return; }
});
panel.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.typo === 'smallScale') { setTypo('smallScale', +t.value); t.nextElementSibling.textContent = `×${(+t.value).toFixed(2)}`; clearCaptionCache(); R.style = resolveStyle(S.settings.capStyle, S.settings.typo); scheduleSave(); return; }
  if (t.type === 'color' && (t.dataset.typo === 'small.color' || t.dataset.typo === 'key.color')) { setTypo(t.dataset.typo, t.value); clearCaptionCache(); R.style = resolveStyle(S.settings.capStyle, S.settings.typo); scheduleSave(); return; }
  if (t.dataset.typo === 'keyScale') { setTypo('keyScale', +t.value); t.nextElementSibling.textContent = `×${(+t.value).toFixed(2)}`; clearCaptionCache(); R.style = resolveStyle(S.settings.capStyle, S.settings.typo); scheduleSave(); return; }
  if (t.dataset.typo === 'ghost') { setTypo('ghost', t.checked); typoChanged(); return; }
  if (t.dataset.set) {
    const k = t.dataset.set, v = t.type === 'checkbox' ? t.checked : t.type === 'range' ? +t.value : t.value;
    set(k, v);
    const vv = document.querySelector(`[data-val="${k}"]`); if (vv) vv.textContent = /^adj\./.test(k) ? (+v).toFixed(2) : /Vol|duck|cap|lookAmt|lutAmt|frame\.(x|y|face)/.test(k) && !/capScale/.test(k) ? pct(v) : `×${(+v).toFixed(2)}`;
    if (k === 'capScale') clearCaptionCache();
    const soundOnly = /Vol|duck/.test(k), visualOnly = /^(capY|capScale|frame\.|grade|grain|rec|watermark|cta|handle|captions|motionCaptions|lookAmt|lutAmt|adj\.)/.test(k);
    if (soundOnly) { scheduleMix(); scheduleSave(); } else if (visualOnly) scheduleSave(); else rebuild();
    return;
  }
  if (t.dataset.brand) { S.brand[t.dataset.brand] = t.value; brandChanged(); }
});
panel.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.typo === 'small.font' || t.dataset.typo === 'key.font') { const [fam, it] = t.value.split(':'), role = t.dataset.typo.split('.')[0]; setTypo(role + '.fam', fam); setTypo(role + '.it', it === '1'); if (fam === 'serif' && role === 'key') setTypo('key.w', 400); else if (role === 'key') setTypo('key.w', 900); typoChanged(); return; }
  if (t.dataset.typo === 'small.family' || t.dataset.typo === 'key.family') { const v = t.value || undefined; setTypo(t.dataset.typo, v); if (v) await ensureFonts([v]); typoChanged(); return; }
  if (t.dataset.typo === 'small.fx') { setTypo('small.fx', t.value); typoChanged(); return; }
  if (t.type === 'color' && t.dataset.typo) { typoChanged(); return; }
  if (t.dataset.typo === 'key.fx') { setTypo('key.fx', t.value); typoChanged(); return; }
  if (t.id === 'brandKit') { const b = brands.find(x => x.id === t.value); if (b) { S.brand = structuredClone(b); R.logo = null; if (b.logo) { const im = new Image(); im.src = b.logo; await im.decode().catch(() => { }); R.logo = im; } renderPanel(); brandChanged(); } return; }
  if (t.id === 'lang') { S.lang = t.value; scheduleSave(); return; }
  if (t.id === 'lutFiles' && t.files.length) { let last = null; for (const f of t.files) { try { const r = await (await fetch('/api/lut?name=' + encodeURIComponent(f.name), { method: 'POST', body: f })).json(); await loadLut(r.url); last = r.url; } catch (e) { toast('LUT refusé : ' + f.name + ' (' + e.message + ')', 5000); } } luts = await (await fetch('/api/luts')).json(); if (last) S.settings.lut = last; renderPanel(); scheduleSave(); toast('LUT importé'); return; }
  if (t.id === 'model') { S.model = t.value; scheduleSave(); return; }
  if (t.id === 'fontFile' && t.files[0]) { const f = t.files[0]; const info = await upload(f); const name = f.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '); await registerFont(name, info.url); S.customFonts.push({ name, url: info.url }); S.brand.display = name; renderPanel(); brandChanged(); toast('Police « ' + name + ' » ajoutée aux titres'); return; }
  if (t.id === 'logoFile' && t.files[0]) { const info = await upload(t.files[0]); S.brand.logo = info.url; const im = new Image(); im.src = info.url; await im.decode().catch(() => { }); R.logo = im; renderPanel(); rebuild({ keepMix: true }); return; }
  if (t.id === 'clipFiles' && t.files.length) { for (const [i, f] of [...t.files].entries()) { busy(`Import du b-roll ${i + 1}/${t.files.length}…`, 0); const info = await upload(f, p => busy(`Import du b-roll ${i + 1}/${t.files.length}…`, p)); S.clips.push(info); const s = new VSrc(info.url); await s.ready; R.srcs.clips.push(s); } busyOff(); renderPanel(); rebuild(); return; }
  if (t.id === 'musicFile' && t.files[0]) { busy('Import de la musique…', 0); S.music = await upload(t.files[0], p => busy('Import de la musique…', p)); busyOff(); renderPanel(); rebuild(); return; }
});

/* ---------------------------------------------------------------- start flows */
async function startFromFile(file) {
  if (!file) return;
  $('#home').hidden = true;
  try {
    busy('Import de la vidéo…', 0);
    const info = await upload(file, p => busy('Import de la vidéo…', p));
    await startFromInfo(info, file.name);
  } catch (e) { busyOff(); toast('Erreur : ' + e.message, 6000); }
}
async function startFromInfo(info, fileName) {
  $('#home').hidden = true;
  try {
    S = newState(); S.name = fileName.replace(/\.[^.]+$/, ''); S.main = info;
    if (!info.hasVideo) S.settings.layout = 'motion';
    if (brands[0]) S.brand = structuredClone(brands[0]);
    $('#projName').value = S.name;
    busy('Chargement…');
    await setupSources();
    tNow = 0; selectTab('templates'); rebuild({ panel: true });
    await transcribe();
    rebuild({ panel: true });
    toast('Montage automatique prêt : choisis ton style à gauche.', 4000);
  } catch (e) { busyOff(); toast('Erreur : ' + e.message, 6000); }
}
function synthWords(txt) {
  const out = []; let t = .5;
  // glue French-spaced symbols to the previous word: "90 %" -> "90%", "vrai ?" -> "vrai?"
  const toks = []; for (const w of txt.split(/\s+/).filter(Boolean)) { if (toks.length && /^[%€$:;!?»”…]+$/.test(w)) toks[toks.length - 1] += w; else toks.push(w); }
  for (const w of toks) { const d = clamp(.16 + w.length * .045, .22, .62); out.push({ w, s: +t.toFixed(3), e: +(t + d).toFixed(3) }); t += d + (/[.!?…]$/.test(w) ? .42 : /[,;:]$/.test(w) ? .18 : .03); }
  return out;
}
async function startFromText() {
  const txt = $('#scriptText').value.trim(); if (!txt) { toast('Écris ou colle ton texte d’abord.'); return; }
  $('#home').hidden = true;
  S = newState(); S.name = txt.split(/\s+/).slice(0, 5).join(' '); S.words = synthWords(txt); S.settings.layout = 'motion'; S.settings.cardBg = 'mix';
  if (brands[0]) S.brand = structuredClone(brands[0]);
  $('#projName').value = S.name;
  await setupSources(); tNow = 0; rebuild({ panel: true });
  toast('Ajoute une musique dans Médias pour l’habiller.', 4000);
}
async function loadProject(id) {
  const data = await (await fetch('/api/project?id=' + id)).json(); if (!data) return;
  $('#home').hidden = true; busy('Ouverture du projet…');
  S = { ...newState(), ...data, settings: { ...structuredClone(DEFAULT_SETTINGS), ...data.settings }, brand: { ...structuredClone(DEFAULT_BRAND), ...data.brand } };
  $('#projName').value = S.name;
  if (S.settings.lut) await loadLut(S.settings.lut).catch(() => { });
  await setupSources(); busyOff(); tNow = 0; rebuild({ panel: true });
}
async function showHome() {
  pause(); $('#home').hidden = false;
  try {
    const list = await (await fetch('/api/projects')).json();
    $('#recent').innerHTML = list.length ? `<h4>Projets récents</h4><div class="rgrid">${list.slice(0, 12).map(p => `<div class="rcard" data-pid="${esc(p.id)}"><b>${esc(p.name)}</b><small>${new Date(p.updated * 1000).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })}</small></div>`).join('')}</div>` : '';
  } catch { }
}
$('#recent').addEventListener('click', e => { const c = e.target.closest('[data-pid]'); if (c) loadProject(c.dataset.pid); });
$('#fileMain').addEventListener('change', e => startFromFile(e.target.files[0]));
const dz = $('#dropMain');
['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('over'); }));
dz.addEventListener('drop', e => startFromFile(e.dataTransfer.files[0]));
$('#btnFromText').addEventListener('click', startFromText);
$('#btnHome').addEventListener('click', showHome);
$('#projName').addEventListener('input', e => { S.name = e.target.value; scheduleSave(); });

/* ---------------------------------------------------------------- transport */
$('#btnPlay').addEventListener('click', () => player.playing ? pause() : play());
cv.addEventListener('click', () => player.playing ? pause() : play());
$('#btnRegen').addEventListener('click', () => { S.settings.seed = (S.settings.seed || 0) + 1; rebuild(); toast('Nouvelle variante'); });
$('#timeline').addEventListener('pointerdown', e => {
  if (!plan) return;
  const r = e.currentTarget.getBoundingClientRect(), go = ev => seek((ev.clientX - r.left) / r.width * plan.dur);
  go(e); const mv = ev => go(ev), up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
});
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, select') || !plan || !$('#home').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); player.playing ? pause() : play(); }
  if (e.code === 'ArrowLeft') seek(tNow - (e.shiftKey ? 5 : .5));
  if (e.code === 'ArrowRight') seek(tNow + (e.shiftKey ? 5 : .5));
});

/* ---------------------------------------------------------------- export */
let cancelled = false;
$('#expCancel').addEventListener('click', () => { cancelled = true; });
$('#btnExport').addEventListener('click', async () => {
  if (!plan) return;
  pause(); cancelled = false;
  const modal = $('#exportModal'), bar = $('#expBar'), txt = $('#expText'), th = $('#expThumb').getContext('2d');
  modal.hidden = false; $('#expTitle').textContent = 'Export en cours'; bar.style.width = '0%'; txt.textContent = 'Mixage du son…';
  $('#expActions').innerHTML = '<button class="btn ghost" id="expCancel2">Annuler</button>'; $('#expCancel2').onclick = () => { cancelled = true; };
  try {
    const mix = await renderMix(plan, S, S.settings, sfxLib);
    const buf = await exportMp4(R, mix, {
      isCancelled: () => cancelled,
      onProgress: (p, eta, c) => { bar.style.width = `${(p * 100).toFixed(1)}%`; txt.textContent = `Rendu ${Math.round(p * 100)} % · encore ~${Math.ceil(eta)} s`; th.drawImage(c, 0, 0, 270, 480); },
    });
    if (!buf) { modal.hidden = true; toast('Export annulé'); return; }
    txt.textContent = 'Enregistrement du fichier…';
    const name = (S.name || 'video').replace(/[^\p{L}\p{N}]+/gu, '_').slice(0, 50) + '_cadence.mp4';
    const r = await (await fetch('/api/export?name=' + encodeURIComponent(name), { method: 'POST', body: buf })).json();
    bar.style.width = '100%'; $('#expTitle').textContent = 'Vidéo prête ✓';
    txt.innerHTML = `${esc(r.name)} · ${(buf.byteLength / 1048576).toFixed(1)} Mo<br><span class="small">${esc(r.path)}</span>`;
    $('#expActions').innerHTML = `<a class="btn" href="${esc(r.url)}" download="${esc(r.name)}">Télécharger</a><button class="btn" id="expOpen">Ouvrir le dossier</button><button class="btn primary" id="expClose">Fermer</button>`;
    $('#expOpen').onclick = () => fetch('/api/open?what=exports', { method: 'POST' });
    $('#expClose').onclick = () => { modal.hidden = true; };
  } catch (e) { console.error(e); txt.textContent = 'Erreur pendant l’export : ' + (e.message || e); $('#expActions').innerHTML = '<button class="btn" id="expClose">Fermer</button>'; $('#expClose').onclick = () => { modal.hidden = true; }; }
});

/* ---------------------------------------------------------------- accounts (local, offline) */
let me = null;
function setUser(u) {
  me = u; const n = (u.name || u.email || '?');
  $('#userAvatar').textContent = n.trim()[0].toUpperCase(); $('#userName').textContent = n;
  $('#menuName').textContent = n; $('#menuEmail').textContent = u.email;
}
function ensureAuth() {
  return fetch('/api/auth/me').then(r => r.json()).then(({ user, hasUsers }) => {
    if (user) { setUser(user); return user; }
    const box = $('#auth'), form = $('#authForm'), err = $('#authErr');
    let mode = hasUsers ? 'login' : 'register';
    const setMode = m => {
      mode = m;
      form.querySelectorAll('.auth-tabs button').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
      $('#fldName').hidden = m !== 'register';
      $('#authGo').textContent = m === 'register' ? 'Créer mon compte' : 'Se connecter';
      $('#authSub').textContent = m === 'register' ? (hasUsers ? 'Crée ton compte en 10 secondes.' : 'Bienvenue ! Crée ton compte pour commencer.') : 'Connecte-toi pour retrouver tes projets.';
      form.password.autocomplete = m === 'register' ? 'new-password' : 'current-password';
      err.hidden = true;
    };
    form.querySelectorAll('.auth-tabs button').forEach(b => b.onclick = () => setMode(b.dataset.mode));
    setMode(mode); box.hidden = false; setTimeout(() => (mode === 'register' ? form.name : form.email).focus(), 50);
    return new Promise(resolve => {
      form.onsubmit = async e => {
        e.preventDefault(); err.hidden = true; $('#authGo').disabled = true;
        try {
          const r = await fetch('/api/auth/' + mode, { method: 'POST', body: JSON.stringify({ email: form.email.value, password: form.password.value, name: form.name.value }) });
          const j = await r.json();
          if (!r.ok) throw new Error(j.error || 'Erreur');
          setUser(j.user); box.hidden = true; form.password.value = ''; resolve(j.user);
        } catch (x) { err.textContent = x.message; err.hidden = false; }
        $('#authGo').disabled = false;
      };
    });
  });
}
$('#btnUser').addEventListener('click', e => { e.stopPropagation(); $('#userMenu').hidden = !$('#userMenu').hidden; });
document.addEventListener('click', e => { if (!e.target.closest('#userMenu')) $('#userMenu').hidden = true; });
$('#btnLogout').addEventListener('click', async () => { await fetch('/api/auth/logout', { method: 'POST' }); location.reload(); });

/* ---------------------------------------------------------------- boot */
(async function boot() {
  requestAnimationFrame(loop);
  renderPanel();
  me = await ensureAuth();
  try { brands = await (await fetch('/api/brands')).json(); if (!Array.isArray(brands) || !brands.length) brands = [DEFAULT_BRAND]; } catch { brands = [DEFAULT_BRAND]; }
  try { luts = await (await fetch('/api/luts')).json(); myStyles = await (await fetch('/api/styles')).json(); if (!Array.isArray(myStyles)) myStyles = []; } catch { }
  if (S.settings.lut) loadLut(S.settings.lut).catch(() => { });
  if (brands[0]) S.brand = structuredClone(brands[0]);
  await ensureFonts([S.brand.font, S.brand.display, S.brand.serif, S.brand.caps]);
  loadIcons(); loadSfxLibrary().then(l => { sfxLib = l; });
  initSeg().then(ok => { if (ok && plan) rebuild({ keepMix: true, panel: tab === 'captions' }); else if (tab === 'captions') renderPanel(); });
  showHome();
  if (!('VideoEncoder' in window)) toast('Utilise Chrome ou Edge pour exporter les vidéos.', 8000);
  /* contact sheet of exact frames (used to check an edit at a glance) */
  async function sheet(times, cols = 4, tw = 270) {
    const th = Math.round(tw * 16 / 9), c = document.createElement('canvas'); c.width = cols * tw; c.height = Math.ceil(times.length / cols) * th;
    const x = c.getContext('2d'), f = document.createElement('canvas'); f.width = W; f.height = H; const fg = f.getContext('2d');
    pause();
    for (const [i, t] of times.entries()) { for (const [src, st] of sourceTimes(R, t)) await src.seek(st); drawFrame(fg, t, R); x.drawImage(f, (i % cols) * tw, Math.floor(i / cols) * th, tw, th); x.fillStyle = '#000'; x.fillRect((i % cols) * tw, Math.floor(i / cols) * th, 54, 18); x.fillStyle = '#ff0'; x.font = 'bold 13px sans-serif'; x.fillText(t.toFixed(2) + 's', (i % cols) * tw + 3, Math.floor(i / cols) * th + 13); }
    let img = document.getElementById('dbgSheet'); if (!img) { img = document.createElement('img'); img.id = 'dbgSheet'; img.style.cssText = 'position:fixed;inset:0;margin:auto;max-width:100vw;max-height:100vh;z-index:99;background:#000'; img.onclick = () => img.remove(); document.body.appendChild(img); }
    img.src = c.toDataURL('image/jpeg', .85); return times.length;
  }
  window.__cadence = { get S() { return S; }, get plan() { return plan; }, R, seek, play, pause, startFromText, startFromFile, startFromInfo, loadProject, sheet, rebuild };
})();
