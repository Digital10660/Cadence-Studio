/* Cadence — the "director": turns a word-timed transcript into an edit plan
   (caption groups, keywords, zooms, motion cards, b-roll, icons, impacts, sound effects).
   Everything is deterministic, so the preview and the export are identical. */
import { rng, hash, cleanWord } from './core.js';
import { iconFor } from './icons.js';
import { resolveStyle, assignComps, isLineOnly } from './captions.js';

const STOP = new Set(`le la les l un une des du de d et ou à a au aux en dans sur sous par pour avec sans ce cet cette ces se sa son ses mon ma mes ton ta tes notre nos votre vos leur leurs je tu il elle on nous vous ils elles me te lui y que qui quoi dont où est es suis sont ai as ont été être avoir fait faire va vais ne n pas très bien mais donc car si comme alors aussi c j qu s m t ça cela ceci là ici quand eh euh ben bah hein voilà the an and or to of in on at for with is are was be it this that i you we they he she my your our so but just like um uh`.split(/\s+/));
const EMPH = new Set(`jamais toujours gratuit gratuite gratuitement secret secrets erreur erreurs problème problèmes simple simplement rapide rapidement vite argent million millions milliard milliards meilleur meilleure meilleurs pire important importante essentiel essentielle attention stop arrête arrêtez vraiment énorme incroyable puissant puissante résultat résultats clients client vente ventes vendre succès réussir réussite échec échouer croissance gagner perdre preuve confiance contenu vidéo vidéos stratégie marque business entreprise objectif solution différence personne rien tout tous maintenant aujourd'hui demain enfin nouveau nouvelle unique exactement facile difficile impossible possible pourquoi comment question réponse vrai faux mieux interdit danger urgent clé gratuit offert offerte double triple moitié chaque premier première dernier dernière never always free secret mistake problem simple fast money best worst important stop really huge results clients sales success growth content video strategy brand business goal nothing everything now today`.split(/\s+/));
const IMPACT = new Set(`jamais stop arrête arrêtez erreur erreurs pire échec interdit danger attention faux rien problème problèmes never stop mistake worst wrong nothing`.split(/\s+/));
const NUMW = new Set(`deux trois quatre cinq six sept huit neuf dix onze douze quinze vingt trente quarante cinquante soixante cent cents mille million millions milliard milliards premier première double triple moitié`.split(/\s+/));

const norm = w => cleanWord(w, '').toLowerCase().replace(/^(l|d|j|qu|n|s|m|t|c)['’]/, '');

function scoreWord(words, i) {
  const w = words[i], n = norm(w.w), raw = cleanWord(w.w, '');
  if (!n) return -9;
  let s = 0;
  if (STOP.has(n)) s -= 6;
  if (/\d/.test(n)) s += 7;
  if (NUMW.has(n)) s += 3;
  if (n.length >= 7) s += 2;
  if (n.length >= 10) s += 1;
  if (n.length <= 3) s -= 1;
  if (EMPH.has(n)) s += 4;
  if (/^\p{Lu}/u.test(raw) && i > 0 && !/[.!?]$/.test(words[i - 1].w)) s += 2;
  if (/[!?]$/.test(w.w)) s += 1;
  const nx = words[i + 1]; if (nx && nx.s - w.e > .28) s += 1;
  if (/%|€|\$|fcfa|k$/i.test(w.w)) s += 3;
  return s;
}

function buildGroups(words, maxChars, maxWords) {
  const groups = []; let cur = [];
  const flush = () => { if (cur.length) groups.push(cur); cur = []; };
  for (let i = 0; i < words.length; i++) {
    cur.push(i);
    const w = words[i], nx = words[i + 1];
    const gap = nx ? nx.s - w.e : 99;
    const strong = /[.!?…]["»”]?$/.test(w.w), weak = /[,;:]$/.test(w.w);
    const len = cur.reduce((a, j) => a + cleanWord(words[j].w).length + 1, 0);
    const nextLen = nx ? cleanWord(nx.w).length + 1 : 0;
    const hard = !nx || strong || gap > .45 || (weak && cur.length >= 2);
    const soft = cur.length >= maxWords || len + nextLen > maxChars;
    if (hard) { flush(); continue; }
    if (soft) {
      // never end a line on "de / la / pour…": carry it to the next group
      if (cur.length > 1 && STOP.has(norm(w.w)) && gap < .3) { cur.pop(); flush(); cur.push(i); continue; }
      flush();
    }
  }
  flush();
  return groups;
}

/**
 * plan(project) -> {groups, events, zooms, sfx, dur}
 * project: {words, settings, overrides, clips, mainDur, hasVideo}
 */
export function makePlan(project) {
  const S = project.settings, ov = project.overrides || {}, words0 = project.words || [];
  const words = words0.map((w, i) => ({ ...w, w: ov.text?.[i] ?? w.w, i }));
  const layout = S.layout, m = S.motion ?? 1;
  const st = resolveStyle(S.capStyle, S.typo || {}), lineOnly = isLineOnly(st) || layout === 'split' || layout === 'motion';
  const [maxChars, maxWords] = lineOnly && !isLineOnly(st) ? [20, 4] : (st.density || [20, 4]);
  const R = rng(hash(words.map(w => w.w).join(' ')) ^ (S.seed || 0));
  const dur = Math.max(project.mainDur || 0, words.length ? words[words.length - 1].e + .6 : 0);

  /* ---- caption groups + keywords ---- */
  const groups = buildGroups(words, maxChars, maxWords).map((idx, gi) => {
    const ws = idx.map(i => words[i]);
    const scores = idx.map(i => scoreWord(words, i));
    // kinetic styles need a hero word in every phrase; line styles only highlight real keywords
    let best = -1, bs = lineOnly ? 2.5 : -4;
    scores.forEach((s, j) => { if (s > bs) { bs = s; best = j; } });
    const keys = ws.map((w, j) => { const o = ov.kw?.[w.i]; return o === undefined ? j === best : !!o; });
    const key = keys.indexOf(true);
    const text = ws.map(w => w.w).join(' ');
    const strength = Math.max(...scores) + (/[!?]/.test(text) ? 1.5 : 0) + (ws.length >= 3 ? .5 : 0);
    return { gi, id: ws[0].i, words: ws.map((w, j) => ({ ...w, key: keys[j] })), s: ws[0].s, e: ws[ws.length - 1].e, key, strength, text };
  });
  groups.forEach((g, i) => { const nx = groups[i + 1]; g.end = nx && nx.s - g.e < .7 ? nx.s : g.e + .3; });
  assignComps(groups, st, { behind: S.behind !== false && !!project.segReady && project.hasVideo !== false, layout, seed: S.seed || 0, faceY: S.frame?.face ?? .33 });

  const events = [], sfx = [], zooms = [];
  const add = (k, t, gain = 1) => { if (S.sfx !== false && t >= 0) sfx.push({ k, t, g: gain }); };
  const busy = []; const isBusy = (a, b) => busy.some(([x, y]) => a < y && b > x);
  const TRANS = ['zoom', 'slide', 'circle', 'whip'];

  /* ---- motion cards (or editorial "card mode") ---- */
  const spacing = [12, 7, 4.5][m] * (layout === 'broll' ? 1.8 : 1);
  const wantCards = layout !== 'motion' && S.cards !== false;
  if (layout === 'motion') {
    // 100 % motion design: every group (short ones merged) becomes a kinetic scene
    let i = 0, n = 0;
    while (i < groups.length) {
      const gs = [groups[i]]; let e = groups[i].e;
      while (i + gs.length < groups.length && e - gs[0].s < 1.1 && gs.length < 2) { gs.push(groups[i + gs.length]); e = gs[gs.length - 1].e; }
      const nx = groups[i + gs.length];
      const s = n === 0 ? 0 : gs[0].s - .12, end = nx ? nx.s - .12 : Math.max(e + .5, dur);
      events.push(cardEvent('card', gs, s, end, n, S, R, TRANS[n % TRANS.length]));
      if (n > 0) add(n % 3 === 1 ? 'swish' : 'whoosh', s - .05, .7);
      i += gs.length; n++;
    }
  } else if (wantCards) {
    const ranked = groups.filter(g => g.s > .8 && g.e - g.s > .35).sort((a, b) => b.strength - a.strength);
    const chosen = [];
    for (const g of groups) { const o = ov.card?.[g.id]; if (o === true) chosen.push(g); }
    for (const g of ranked) {
      if (ov.card?.[g.id] === false || chosen.includes(g)) continue;
      if (g.strength < 4.5) continue;
      if (chosen.some(c => Math.abs(c.s - g.s) < spacing)) continue;
      chosen.push(g);
    }
    chosen.sort((a, b) => a.s - b.s).forEach((g, n) => {
      const gs = [g]; const nx = groups[g.gi + 1];
      if (nx && nx.s - g.e < .4 && g.e - g.s < 1.3 && !chosen.includes(nx)) gs.push(nx);
      const s = gs[0].s - .1, e = Math.min(gs[gs.length - 1].e + .15, s + 3.4);
      const editorial = layout === 'card' && (n % 3 !== 2);
      const ev = cardEvent(editorial ? 'cardmode' : 'card', gs, s, e, n, S, R, TRANS[(n + 1) % TRANS.length]);
      events.push(ev); busy.push([s - .4, e + .4]);
      if (m >= 2 && !editorial) add('riser', s - .9, .45);
      add(editorial ? 'swish' : 'whoosh', s - .06, editorial ? .8 : 1);
      add('swish', e - .05, .45);
      if (ev.tpl === 'number') add('tick', s + .25, .5);
    });
  }

  /* ---- b-roll inserts ---- */
  const clips = project.clips || [];
  if (clips.length && layout !== 'motion' && layout !== 'split' && S.broll !== false) {
    const gap = (layout === 'broll' ? [5, 3.2, 2.4] : [8, 5, 3.5])[m]; let k = 0, last = -99;
    for (const g of groups) {
      const o = ov.broll?.[g.id];
      if (o === -1) continue;
      const forced = o !== undefined && o >= 0;
      if (!forced && (g.s - last < gap || g.s < 1.2 || isBusy(g.s, g.s + 2))) continue;
      if (!forced && g.strength < 3) continue;
      const s = g.s, e = Math.min(Math.max(g.end, s + 1.6), s + 2.8);
      const clip = forced ? o % clips.length : k++ % clips.length;
      events.push({ type: 'broll', s, e, clip, mode: layout === 'card' ? 'float' : 'full', trans: TRANS[(k + 2) % 4], gid: g.id });
      busy.push([s - .2, e + .2]); last = s; add('whoosh', s - .05, .55);
    }
  }

  /* ---- split screen: what fills the top half ---- */
  if (layout === 'split') {
    let s = 0, k = 0;
    const cuts = groups.filter((g, i) => i > 0 && (/[.!?]$/.test(groups[i - 1].text) || g.s - (groups[i - 1].e) > .5)).map(g => g.s);
    const bounds = [0, ...cuts.filter((c, i, a) => i === 0 || c - a[i - 1] > 2.5), dur];
    for (let i = 0; i < bounds.length - 1; i++) {
      s = bounds[i]; const e = bounds[i + 1];
      if (e - s < .2) continue;
      events.push({ type: 'top', s, e, clip: clips.length ? k % clips.length : -1, idx: k });
      if (i > 0) add('swish', s - .04, .5);
      k++;
    }
  }

  /* ---- icons popping next to keywords ---- */
  if (S.icons !== false && m >= 1 && layout !== 'motion') {
    let last = -99;
    for (const g of groups) {
      if (g.key < 0 || isBusy(g.s, g.e) || g.comp !== 'line') continue;
      const kw = g.words[g.key], ic = iconFor(norm(kw.w));
      if (!ic || kw.s - last < (m >= 2 ? 2.6 : 4)) continue;
      events.push({ type: 'icon', s: kw.s, e: g.end + .1, icon: ic, gid: g.id }); last = kw.s; add('pop', kw.s, .45);
    }
  }

  /* ---- impacts: black & white + shake + flash on strong negative words ---- */
  if (S.impacts !== false && m >= 1 && layout !== 'motion') {
    let last = -99;
    for (const g of groups) {
      const hit = g.words.find(w => IMPACT.has(norm(w.w)));
      if (!hit || hit.s - last < (m >= 2 ? 6 : 10) || isBusy(hit.s, hit.s + .5)) continue;
      events.push({ type: 'impact', s: hit.s, e: Math.max(hit.e + .25, hit.s + .5) }); last = hit.s; add('boom', hit.s, .55);
    }
  }

  /* ---- punch-in zooms (jump-cut feel) ---- */
  if (S.zooms !== false && layout !== 'motion') {
    const levels = [[1, 1.06], [1, 1.12, 1.04, 1.16], [1, 1.14, 1.05, 1.22, 1.1]][m];
    let li = 0;
    zooms.push({ t: 0, z: 1, mode: 'cut' });
    groups.forEach((g, i) => {
      const prev = groups[i - 1];
      const sentence = !prev || /[.!?]$/.test(prev.text) || g.s - prev.e > .4;
      if (m === 0 && !sentence) return;
      if (m === 1 && !sentence && i % 2) return;
      li = (li + 1) % levels.length;
      zooms.push({ t: g.s - .02, z: levels[li], mode: 'cut' });
      if (m >= 1 && g.strength >= 7 && g.key >= 0) zooms.push({ t: g.words[g.key].s - .05, z: levels[li] + .08, mode: 'smooth', d: .35 });
    });
  }

  /* ---- sound under the typography: soft air on big reveals, rare ticks on line styles (never on every word) ---- */
  if (m >= 1) {
    let last = -99;
    for (const g of groups) {
      if (g.key < 0 || isBusy(g.s, g.e)) continue;
      const t = g.words[g.key].s - .04;
      const big = g.comp && g.comp !== 'line';
      if (t - last < (big ? 2.2 : (m >= 2 ? 2.4 : 3.4)) || sfx.some(x => Math.abs(x.t - t) < .45)) continue;
      if (big) add(g.comp === 'behind' ? 'whoosh' : 'swish', t, g.comp === 'behind' ? .45 : .28);
      else if (['highlight', 'banner'].includes(S.capStyle)) add('click', t, .25);
      else if (['impact', 'karaoke'].includes(S.capStyle)) add('pop', t, .22);
      else continue;
      last = t;
    }
  }

  /* ---- end card ---- */
  let total = dur;
  if (S.endCard) { events.push({ type: 'end', s: dur, e: dur + 2.6 }); add('whoosh', dur - .05, .8); add('ding', dur + .45, .5); total = dur + 2.6; }

  events.sort((a, b) => a.s - b.s); sfx.sort((a, b) => a.t - b.t); zooms.sort((a, b) => a.t - b.t);
  return { groups, events, zooms, sfx, dur: total, mainDur: dur, words };
}

function pickTemplate(words, key, n, R) {
  const txt = words.map(w => w.w).join(' ');
  if (/\d/.test(txt) && /\d{2,}|%|€|\$|fcfa|\d+\s*(k|m)\b/i.test(txt)) return 'number';
  const kw = key >= 0 ? words[key] : null;
  if (kw && iconFor(norm(kw.w)) && n % 2 === 0) return 'icon';
  if (words.length >= 6) return n % 2 ? 'quote' : 'stack';
  if (words.length <= 3) return 'giant';
  return ['giant', 'stack', 'giant', 'quote'][Math.floor(R() * 4)];
}

function cardEvent(type, gs, s, e, n, S, R, trans) {
  const words = gs.flatMap(g => g.words);
  let key = words.findIndex(w => w.key);
  if (key < 0) { let best = 0, bl = 0; words.forEach((w, i) => { const l = norm(w.w).length; if (!STOP.has(norm(w.w)) && l > bl) { bl = l; best = i; } }); key = best; }
  const tpl = pickTemplate(words, key, n, R);
  // footage-blur only exists over a video; pure motion videos fall back to the dark look
  const noVid = S.layout === 'motion';
  let bgs = S.cardBg === 'mix' ? (noVid ? ['light', 'brand', 'dark', 'light'] : ['blur', 'light', 'blur', 'dark']) : [S.cardBg || 'blur'];
  if (noVid) bgs = bgs.map(x => x === 'blur' ? 'dark' : x);
  return { type, s, e, words, key, tpl, bg: type === 'cardmode' ? 'light' : bgs[n % bgs.length], trans, n, gid: gs[0].id };
}
