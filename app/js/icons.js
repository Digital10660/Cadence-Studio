/* Cadence — keyword → icon dictionary (Lucide line icons, drawn as vectors so they stay crisp). */
import { eOut } from './core.js';

const DICT = [
  [/^(argent|money|cash|fcfa|euros?|dollars?|salaires?|budget|paie|payer|payé|prix|rentab)/, 'banknote'],
  [/^(temps|heures?|minutes?|secondes?|time|horaire|délai)/, 'clock'],
  [/^(téléphones?|mobiles?|smartphones?|phone|appel)/, 'smartphone'],
  [/^(idées?|idea|créati)/, 'lightbulb'],
  [/^(clients?|audience|abonnés?|followers?|communauté|gens|public)/, 'users'],
  [/^(ventes?|vendre|vend|acheter|achat|commande|panier|boutique|shop)/, 'shopping-cart'],
  [/^(croissance|grandir|augment|progress|growth|scal|booster|exploser)/, 'trending-up'],
  [/^(baisse|chute|perte|perdre|perdu|diminu)/, 'trending-down'],
  [/^(vidéos?|video|filmer|tournage|reels?|tiktok|youtube)/, 'video'],
  [/^(contenus?|content|post|publication)/, 'clapperboard'],
  [/^(messages?|dm|discussion|commentaires?|whatsapp)/, 'message-circle'],
  [/^(e-?mails?|mails?|newsletter)/, 'mail'],
  [/^(sécurité|protéger|protection|sûr|confiance|garantie)/, 'shield-check'],
  [/^(erreurs?|problèmes?|danger|attention|risques?|mistake)/, 'triangle-alert'],
  [/^(questions?|pourquoi|comment)$/, 'circle-help'],
  [/^(objectifs?|cibles?|but|target|focus|précis)/, 'target'],
  [/^(succès|réussi|réussite|gagn|victoire|win|champion|meilleur)/, 'trophy'],
  [/^(amour|aimer|passion|cœur|coeur|love)/, 'heart'],
  [/^(maisons?|immobilier|logement|appartement)/, 'house'],
  [/^(voitures?|auto|automobile|véhicule|route|conduire)/, 'car'],
  [/^(santé|médecin|soin|hôpital|bien-être)/, 'heart-pulse'],
  [/^(travail|job|emploi|bureau|carrière|métier|business|entreprise)/, 'briefcase'],
  [/^(école|formation|apprendre|cours|étudi|université|diplôme)/, 'graduation-cap'],
  [/^(livres?|lire|lecture|guide|ebook)/, 'book-open'],
  [/^(calendrier|jours?|semaines?|mois|dates?|planning|aujourd'hui|demain)/, 'calendar'],
  [/^(monde|international|pays|afrique|global|world)/, 'globe'],
  [/^(rapide|rapidement|vite|instantan|énergie|puissan)/, 'zap'],
  [/^(gratuit|cadeau|offert|bonus)/, 'gift'],
  [/^(liens?|link|bio)/, 'link'],
  [/^(instagram|réseaux|facebook|linkedin|partag)/, 'share-2'],
  [/^(marques?|branding|identité|logo)/, 'sparkles'],
  [/^(design|graphi|dessin|créer)/, 'pen-tool'],
  [/^(caméra|photo|appareil)/, 'camera'],
  [/^(micro|podcast|voix|parler)/, 'mic'],
  [/^(musique|son|audio)/, 'music'],
  [/^(données|data|chiffres|statisti|analys|résultats?)/, 'chart-column'],
  [/^(stratégie|plan|méthode|étapes?|process)/, 'map'],
  [/^(équipe|team|ensemble|collabor)/, 'users-round'],
  [/^(secret|secrets|privé|confidentiel)/, 'lock'],
  [/^(clé|clés|key|solution)/, 'key'],
  [/^(jamais|stop|interdit|arrête)/, 'ban'],
  [/^(regard|voir|vue|visib|attention)/, 'eye'],
  [/^(ia|intelligence|robot|automatis|outil)/, 'bot'],
  [/^(fusée|lancer|lancement|démarr|start)/, 'rocket'],
];

export function iconFor(word) {
  const w = String(word || '').toLowerCase();
  if (w.length < 2) return null;
  for (const [re, name] of DICT) if (re.test(w)) return name;
  return null;
}
export const ICON_NAMES = [...new Set(DICT.map(d => d[1]))];

const ICONS = {};
export async function loadIcons(names = ICON_NAMES) {
  await Promise.all(names.filter(n => !ICONS[n]).map(async n => {
    try {
      const r = await fetch(`https://cdn.jsdelivr.net/npm/lucide-static@0.460.0/icons/${n}.svg`);
      if (!r.ok) return;
      const doc = new DOMParser().parseFromString(await r.text(), 'image/svg+xml'), ps = [];
      for (const el of doc.documentElement.children) {
        const a = k => parseFloat(el.getAttribute(k) || 0), p = new Path2D();
        if (el.tagName === 'path') { ps.push(new Path2D(el.getAttribute('d'))); continue; }
        if (el.tagName === 'circle') p.arc(a('cx'), a('cy'), a('r'), 0, 7);
        else if (el.tagName === 'ellipse') p.ellipse(a('cx'), a('cy'), a('rx'), a('ry'), 0, 0, 7);
        else if (el.tagName === 'line') { p.moveTo(a('x1'), a('y1')); p.lineTo(a('x2'), a('y2')); }
        else if (el.tagName === 'rect') p.roundRect(a('x'), a('y'), a('width'), a('height'), a('rx'));
        else if (el.tagName === 'polyline' || el.tagName === 'polygon') { const pts = el.getAttribute('points').trim().split(/[\s,]+/).map(Number); p.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) p.lineTo(pts[i], pts[i + 1]); if (el.tagName === 'polygon') p.closePath(); }
        else continue;
        ps.push(p);
      }
      ICONS[n] = ps;
    } catch { /* offline: icons are simply skipped */ }
  }));
}
export const hasIcon = n => !!ICONS[n];

/** Line icon, with an optional "draw-on" progress (0..1). */
export function drawIcon(g, n, cx, cy, size, color, prog = 1, lw = 2) {
  const ps = ICONS[n]; if (!ps || prog <= 0) return;
  g.save(); g.translate(cx - size / 2, cy - size / 2); g.scale(size / 24, size / 24);
  g.lineWidth = lw; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = color;
  if (prog < 1) { g.setLineDash([80, 80]); g.lineDashOffset = 80 * (1 - eOut(prog)); }
  for (const p of ps) g.stroke(p);
  g.restore();
}
