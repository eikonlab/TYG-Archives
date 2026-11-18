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
  img/                         l'archive : un dossier par année (1985/, 1986/…)
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

Les gros dossiers ne sont pas dans le projet : ce sont des **liens symboliques**
vers le disque externe **TYG-ARCHIVE** (dossier `site-media/`).

```
src/img        →  /Volumes/TYG-ARCHIVE/site-media/img        photos et vidéos d'origine
src/img-web    →  /Volumes/TYG-ARCHIVE/site-media/img-web    copies légères
src/audio/tyg  →  /Volumes/TYG-ARCHIVE/site-media/tyg        extraits du sampler
```

Aucun média n'est stocké sur le Mac. `site-media/audio/` garde aussi
`skinflowers-debut.mp3` (ancien son, plus utilisé par le site).

- Brancher le disque **avant** de lancer le site. Disque absent : le site démarre
  quand même, mais sans images ni sons du sampler (message dans le terminal).
- Ne pas renommer le disque ni le dossier `site-media` (les liens s'arrêteraient).
- Ajouter des photos : les mettre directement sur le disque, dans `site-media/img/<année>/`.
- Refaire un lien (si besoin) :
  `ln -s /Volumes/TYG-ARCHIVE/site-media/img src/img`
- `npm run build` : `dist/media-web` est un lien vers le disque. Pour mettre en
  ligne, envoyer `dist/` en suivant les liens (ex. `rsync -L`).
