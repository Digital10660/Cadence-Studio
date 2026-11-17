# Cadence Studio

Cadence est un outil de montage automatique pour les vidéos verticales (Reels, TikTok, Shorts).
Il s'occupe de quatre choses :
- des sous-titres premium, synchronisés au mot près ;
- du motion design : cartes animées, zooms, icônes, transitions ;
- du sound design : whooshes, pops, impacts ;
- de la musique, qui baisse toute seule quand tu parles.

Tout tourne sur ton ordinateur : tes vidéos ne sont envoyées nulle part.

## Lancer le studio

1. Double-clique sur **`Lancer Cadence.bat`**.
2. Le navigateur s'ouvre sur `http://localhost:8790`. Utilise **Chrome** ou **Edge** : l'export en a besoin.
3. Garde la fenêtre noire ouverte pendant que tu travailles. Ferme-la pour arrêter le studio.

## Ton compte

Au premier lancement, Cadence te demande de **créer ton compte** (nom, e-mail, mot de passe de 8 caractères minimum). Ensuite, tu te connectes simplement avec ton e-mail et ton mot de passe.

- Tout est enregistré **sur cet ordinateur** (`data/cadence.db`) : le studio fonctionne **sans internet**.
- Plusieurs personnes peuvent avoir chacune leur compte sur le même PC : chacun ne voit que ses projets, ses styles et ses kits de marque.
- Le premier compte créé récupère automatiquement les projets déjà existants.
- Pour changer de compte : clic sur ton nom en haut à droite > **Se déconnecter**.
- Sauvegarde : copie le dossier `data/` (il n'est jamais envoyé sur GitHub).

La synchronisation en ligne (Supabase) est prévue pour la version SaaS : le schéma est prêt dans `supabase_schema.sql`.

## Monter une vidéo

1. **Projets → Monter une vidéo** : glisse ta vidéo face caméra, ou un audio de voix off.
2. Cadence transcrit la voix.
   - En mode « Précise », compte environ 3 minutes pour 1 minute de vidéo.
   - Le mode « Rapide » est 3 à 4 fois plus rapide.
3. Le montage automatique est prêt. Règle-le avec les onglets de gauche :
   - **Montage** : la structure de la vidéo (voir ci-dessous) et le rythme (Sobre, Dynamique ou Intense).
   - **Sous-titres** : 9 styles de départ (Néon empilé, Créateur, Éditorial, Serif luxe, Impact, Surligneur, Minimal, Karaoké, Bandeau). Tout se personnalise :
     - la police des petits mots et du mot-clé (sans, titres, condensée, serif italique…) et la casse (Aa, AA, aa) ;
     - l'effet du mot-clé (lueur, néon, dégradé, contour, bloc couleur, souligné), sa couleur et sa taille ;
     - les placements autorisés : lignes, empilé, escalier, coin, épaule, **derrière moi** (le mot géant passe derrière toi grâce à la détection de la personne), chiffres qui défilent.
   - **Motion** : ce que l'outil a le droit d'ajouter (cartes, zooms, icônes, impacts, b-roll), le fond des cartes, la carte de fin et son appel à l'action.
   - **Marque** : tes couleurs, tes typos (tu peux importer ta propre police) et ton logo. Enregistre le tout en « kit de marque » pour le réutiliser.
   - **Médias** : le cadrage du visage, tes b-rolls ou ton enregistrement d'écran, ta musique.
   - **Son** : le volume de la voix, des effets et de la musique.
4. **Texte & moments** (colonne de droite) :
   - **clic** sur un mot : le mettre en mot-clé, ou l'enlever ;
   - **double-clic** sur un mot : corriger une faute de transcription (les mots soulignés en rouge sont douteux) ;
   - **✦** : forcer ou interdire une carte motion sur cette phrase ;
   - **B** : choisir le b-roll de cette phrase.
5. **↻ Variante** relance le montage automatique avec d'autres choix.
6. **Exporter la vidéo** produit un MP4 1080×1920 (30 i/s), enregistré dans le dossier `exports`.

## Styles prêts à l'emploi et couleur

- **Modèles** (premier onglet) : 20 styles tirés des vidéos de référence, classés en Podcast, Face caméra, Éditorial et Motion design.
  - Chaque vignette est la vraie vidéo : passe la souris dessus pour la voir bouger.
  - Un clic applique en même temps le montage, les sous-titres, la couleur (avec LUT), le motion et le son.
  - Pour mélanger, change ensuite les autres onglets, puis clique sur « + Enregistrer » dans « Mes styles ».
- **Couleur** : 12 LUTs cinéma intégrés, au format `.cube` (Kodak 2383, Fuji Eterna, Teal & Orange Pro, Bleach bypass, Cinestill 800T, Portra, Golden hour…).
  - Tu peux importer tes propres LUTs `.cube` (Premiere, Resolve, After Effects) et régler leur intensité.
  - Des rendus rapides et des réglages fins (exposition, contraste, saturation, température) s'ajoutent par-dessus.
  - Tes LUTs sont rangés dans le dossier `luts/`.

## Les 5 styles de montage

| Style | Ce que fait Cadence |
|---|---|
| Face caméra dynamique | Plein écran, zooms punch-in (jump cuts), sous-titres, cartes motion aux moments forts, icônes et impacts. |
| Écran partagé | En haut, ton écran ou tes b-rolls (sinon les mots-clés animés). En bas, ton visage. Sous-titres au centre. |
| Carte éditoriale | La vidéo devient une carte arrondie sur fond clair et la typographie prend le relais, comme dans un podcast premium. |
| B-roll cinéma | Davantage d'images d'illustration plein écran, des coupes rythmées et moins de texte. |
| Motion design pur | Typographie animée sur une voix off, ou à partir d'un simple texte collé. |

## Effets sonores

Cadence est livré avec 40 sons réels de la bibliothèque gratuite Mixkit (whoosh, swish, pop, clic, impacts, montées, cloches, tic-tac, déclencheur photo, glitch). Leur licence autorise l'usage commercial ; voir `sfx/LICENCE_MIXKIT.txt`. Cadence harmonise leur volume automatiquement.

### Ajouter tes propres sons

Les sons intégrés sont générés par Cadence. Pour retrouver le son exact de tes montages After Effects :
1. ouvre le dossier `sfx` (onglet **Son → Ouvrir le dossier SFX**) ;
2. range tes fichiers `.wav` ou `.mp3` par type : `whoosh`, `swish`, `pop`, `click`, `boom`, `riser`, `ding`, `tick`, `shutter`, `glitch` ;
3. clique sur **Recharger**.

Cadence les place alors à la place des sons intégrés, et cale le pic de chaque whoosh sur la transition.

## Dossiers

- `library/` : les vidéos, musiques, logos et polices importés (avec le cache des transcriptions) ;
- `exports/` : les vidéos finies ;
- `data/` : les projets et les kits de marque ;
- `sfx/` : tes packs d'effets sonores.
