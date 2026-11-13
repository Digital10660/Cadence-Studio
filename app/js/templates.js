/* Cadence — ready-made edit styles. Each one is built from one of the user's reference reels
   (its preview IS that video), grouped by category. One click = layout + captions + colour (look + LUT) + motion + sound. */
const base = { typo: {}, grade: false, grain: true, rec: false, cards: true, zooms: true, icons: true, impacts: true, broll: true, behind: true, sfx: true };
const lut = n => `/luts/${n}.cube`;

export const TEMPLATE_CATS = ['Podcast', 'Face caméra', 'Éditorial', 'Motion design', 'Mes styles'];

export const TEMPLATES = [
  /* ---- Podcast ---- */
  { id: 'ref02', ref: 'ref02', cat: 'Podcast', name: 'Podcast orange', desc: 'Petite ligne italique + titre condensé orange, cartes claires', set: { layout: 'full', capStyle: 'podcast', look: 'clean', lut: lut('kodak_2383_film'), motion: 1, cardBg: 'light', impacts: false } },
  { id: 'ref15', ref: 'ref15', cat: 'Podcast', name: 'Podcast dégradé', desc: 'Mots-clés orange, cartes dégradées, rythme posé', set: { layout: 'full', capStyle: 'podcast', look: 'film', lut: lut('portra_peau_douce'), motion: 1, cardBg: 'mix', impacts: false } },
  { id: 'ref19', ref: 'ref19', cat: 'Podcast', name: 'Podcast éditorial', desc: 'La vidéo devient une carte sur papier clair, typo serif', set: { layout: 'card', capStyle: 'serif', look: 'clean', lut: lut('fuji_eterna_doux'), motion: 1, cardBg: 'light', impacts: false } },
  /* ---- Face caméra ---- */
  { id: 'ref17', ref: 'ref17', cat: 'Face caméra', name: 'Lime REC', desc: 'Vert lime lumineux en escalier, cadre caméra', set: { layout: 'full', capStyle: 'lime', look: 'moody', lut: lut('blockbuster_froid'), motion: 1, rec: true, cardBg: 'blur' } },
  { id: 'ref14', ref: 'ref14', cat: 'Face caméra', name: 'Jaune italique', desc: 'Gros sous-titres jaunes italiques, icônes, N&B sur les punchlines', set: { layout: 'full', capStyle: 'impact', look: 'creator', lut: lut('kodak_2383_film'), motion: 2, cardBg: 'light' } },
  { id: 'ref06', ref: 'ref06', cat: 'Face caméra', name: 'Bloc bleu', desc: 'Mots sur blocs bleus, écrans et pages blanches', set: { layout: 'full', capStyle: 'bluebox', look: 'creator', lut: lut('teal_orange_pro'), motion: 2, cardBg: 'light' } },
  { id: 'ref07', ref: 'ref07', cat: 'Face caméra', name: 'Bloc rouge serif', desc: 'Mot-clé serif sur bloc rouge, pages blanches', set: { layout: 'full', capStyle: 'redbox', look: 'film', lut: lut('matte_film_chaud'), motion: 1, cardBg: 'light' } },
  { id: 'ref11', ref: 'ref11', cat: 'Face caméra', name: 'Lavande', desc: 'Texte propre, mots soulignés lavande, cartes claires', set: { layout: 'full', capStyle: 'softline', look: 'night', lut: lut('neon_nuit'), motion: 1, cardBg: 'light' } },
  { id: 'ref12', ref: 'ref12', cat: 'Face caméra', name: 'Minimal rouge', desc: 'Petit texte centré, pages grises, avant / après', set: { layout: 'full', capStyle: 'smallcenter', look: 'film', lut: lut('kodak_2383_film'), motion: 1, cardBg: 'light', impacts: false } },
  { id: 'ref16', ref: 'ref16', cat: 'Face caméra', name: 'Tech sombre', desc: 'Texte minuscule propre, cartes sombres high-tech', set: { layout: 'full', capStyle: 'minimal', look: 'cold', lut: lut('blockbuster_froid'), motion: 1, cardBg: 'dark' } },
  { id: 'ref03', ref: 'ref03', cat: 'Face caméra', name: 'Cinéma sombre', desc: 'Texte discret, effets REC, très ciné', set: { layout: 'full', capStyle: 'smallcenter', look: 'moody', lut: lut('bleach_bypass'), motion: 1, rec: true, cardBg: 'dark' } },
  /* ---- Éditorial ---- */
  { id: 'ref04', ref: 'ref04', cat: 'Éditorial', name: 'Mots géants', desc: 'Mots géants derrière toi, placements variés', set: { layout: 'full', capStyle: 'editorial', look: 'clean', lut: lut('fuji_eterna_doux'), motion: 1, cardBg: 'blur' } },
  { id: 'ref05', ref: 'ref05', cat: 'Éditorial', name: 'Serif & cartes', desc: 'Grand serif + sans, vidéo en carte sur fond clair', set: { layout: 'card', capStyle: 'mixserif', look: 'clean', lut: lut('portra_peau_douce'), motion: 1, cardBg: 'light' } },
  { id: 'ref09', ref: 'ref09', cat: 'Éditorial', name: 'Éditorial couleur', desc: 'Mots en couleur, éléments graphiques, chaud', set: { layout: 'full', capStyle: 'neon', look: 'teal', lut: lut('teal_orange_pro'), motion: 2, cardBg: 'blur' } },
  /* ---- Motion design ---- */
  { id: 'ref01', ref: 'ref01', cat: 'Motion design', name: 'Branding néon', desc: 'Fond noir, lumières vertes et rouges, gros titres', set: { layout: 'motion', capStyle: 'neon', look: 'none', lut: null, motion: 2, cardBg: 'dark' } },
  { id: 'ref08', ref: 'ref08', cat: 'Motion design', name: 'Cartes UI', desc: 'Pages claires, cartes et interfaces animées', set: { layout: 'motion', capStyle: 'neon', look: 'none', lut: null, motion: 2, cardBg: 'light' } },
  { id: 'ref10', ref: 'ref10', cat: 'Motion design', name: 'Créativité sombre', desc: 'Ambiance sombre, objets, mots qui apparaissent', set: { layout: 'motion', capStyle: 'serif', look: 'none', lut: null, motion: 1, cardBg: 'dark' } },
  { id: 'ref13', ref: 'ref13', cat: 'Motion design', name: 'Éditorial N&B', desc: 'Gris clair, typo serif + sans, très luxe', set: { layout: 'motion', capStyle: 'serif', look: 'none', lut: null, motion: 1, cardBg: 'light' } },
  { id: 'ref18', ref: 'ref18', cat: 'Motion design', name: 'Violet néon', desc: 'Violet profond, mots lumineux, chiffres', set: { layout: 'motion', capStyle: 'violet', look: 'none', lut: null, motion: 2, cardBg: 'dark' } },
  { id: 'ref20', ref: 'ref20', cat: 'Motion design', name: 'Rouge & noir', desc: 'Alterne noir, rouge et blanc, punchy', set: { layout: 'motion', capStyle: 'highlight', look: 'none', lut: null, motion: 2, cardBg: 'mix' } },
];

export function applyTemplate(settings, tpl) {
  const keep = { frame: settings.frame, capY: settings.capY, capScale: settings.capScale, sfxVol: settings.sfxVol, voiceVol: settings.voiceVol, musicVol: settings.musicVol, duck: settings.duck, cta: settings.cta, handle: settings.handle, endCard: settings.endCard, watermark: settings.watermark, seed: settings.seed };
  return { ...settings, ...base, lut: null, lutAmt: .85, lookAmt: 1, adj: {}, ...structuredClone(tpl.set), ...keep, template: tpl.id };
}

/* the user's own saved mixes ("Mes styles") */
export const STYLE_KEYS = ['layout', 'capStyle', 'typo', 'look', 'lookAmt', 'adj', 'lut', 'lutAmt', 'motion', 'cardBg', 'cards', 'zooms', 'icons', 'impacts', 'broll', 'behind', 'grain', 'rec', 'grade'];
export function snapshotStyle(settings, name) {
  const set = {};
  for (const k of STYLE_KEYS) if (settings[k] !== undefined) set[k] = structuredClone(settings[k]);
  return { id: 'my_' + Date.now().toString(36), cat: 'Mes styles', name, desc: 'Mon style', set, mine: true };
}
