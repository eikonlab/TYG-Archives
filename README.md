# Archives ASCII

## Lancer le projet

Il faut Node.js.

```
npm install
npm run dev
```

Ouvre ensuite l'adresse affichée dans le terminal.

## Organisation

```
src/
  main.jsx                     point d'entrée
  App.jsx                      assemble l'application
  App.css                      styles
  constants.js                 réglages
  components/
    TopBar.jsx                 ligne du haut (année, mode d'emploi)
    Stage.jsx                  la scène : médias révélés, superposés
    Timeline.jsx               frise des années (à droite)
    Caption.jsx                légende sous la scène
    KeyStrip.jsx               bande des 17 touches (en bas)
    format.js                  petits outils de texte
  img/                         lien vers « 00 TYG ARCHIVES by year » (disque externe)
  data/
    years.js                   liste les fichiers de img/ et les range par année
  hooks/
    useKeyboard.js             clavier d'ordinateur
    useMidi.js                 clavier MIDI
    useWheelRepeat.js          défilement des années
  state/
    archivesReducer.js         état de l'application et ses actions
```

## Jouer

- Tenir une touche (a w s e d f t g y h u j k o l p ;) : révèle un média.
- Plusieurs touches : les médias se superposent (double exposition).
- ↑ ↓ ou pitch bend : traverser les années. z / x : médias suivants.
- Cliquer une fois active le son des vidéos.

## Fonctionnement

1. Une entrée (clavier, souris, MIDI) envoie une action au reducer.
2. Le reducer calcule le nouvel état.
3. Les composants affichent cet état.

Pour ajouter des médias, dépose les fichiers dans `src/img/<année>/` (les
sous-dossiers sont parcourus). Seuls les jpg, png, gif, webp, mp4, mov et m4v
sont affichés. Un fichier posé directement dans `src/img/` prend l'année écrite
dans son nom (`30.08.1985`, `2026-10-26`, `19850519`), sinon il va dans `sans-date`.

La liste des fichiers est fabriquée par un petit plugin dans `vite.config.js`.
Les fichiers sont servis directement depuis `src/img/` : utilise `npm run dev`
(`npm run build` ne copie pas l'archive).

## Médias sur le disque externe (v4)

Aucun média n'est dans le projet : ce sont des **liens symboliques** vers le disque
externe **TYG-eikon**, dossier `all-years`, rangé par année :

```
/Volumes/TYG-eikon/all-years/<année>/IMG     photos
/Volumes/TYG-eikon/all-years/<année>/VIDEO   vidéos
/Volumes/TYG-eikon/all-years/<année>/AUDIO   enregistrements du sampler
/Volumes/TYG-eikon/all-years/0000/…          sans date

src/img              →  /Volumes/TYG-eikon/all-years
src/audio/originaux  →  /Volumes/TYG-eikon/all-years
```

- Les photos et vidéos sont lues **en original** directement sur le disque
  (pas de copies légères). Les fichiers audio de `AUDIO/` sont ignorés par la galerie.
  Les dossiers techniques (`@eaDir`, `#recycle`, fichiers `._…`) sont ignorés.
- Le sampler lit ses sons **directement dans les .wav / .flac de `<année>/AUDIO`** :
  seules les 10 secondes utiles sont téléchargées (voir `src/audio/decoupe.js`).
  La liste des passages (n° | `<année>/AUDIO/fichier` | moment) est dans
  `src/audio/extraits/<année>.txt` : c'est là qu'on change un son.
- Chaque année prend ses sons **dans son propre dossier** `<année>/AUDIO`
  (`0000/AUDIO` pour sans-date). `npm run dev` refait les listes tout seul, au
  démarrage et à chaque .wav / .flac ajouté ou supprimé : il suffit de recharger la page.
  Les passages choisis à la main et toujours valables sont gardés.
  (`npm run extraits` fait la même chose à la main, sans lancer le site.)
- Brancher le disque **avant** de lancer le site. Disque absent : le site démarre
  quand même, mais sans images ni sons (message dans le terminal).
- Ne pas renommer le disque ni le dossier `all-years` : les liens s'arrêteraient.
- Ajouter des photos : les mettre sur le disque, dans `all-years/<année>/IMG/`.
- Refaire un lien (si besoin) :
  `ln -s "/Volumes/TYG-eikon/all-years" src/img`
  `ln -s "/Volumes/TYG-eikon/all-years" src/audio/originaux`
- `npm run build` ne copie rien : `dist/media` et `dist/audio` sont des liens vers le
  disque. Pour mettre en ligne, envoyer `dist/` en suivant les liens (ex. `rsync -L`).
