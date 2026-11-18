/*
 * preload.js — PRÉCHARGEMENT DES MÉDIAS DES TOUCHES
 * ------------------------------------------------------------
 * Appelé par App.jsx quand l'année, le décalage des touches (z/x) ou le clavier
 * (ordinateur / MIDI) change : télécharge ET décode à l'avance les images des touches
 * disponibles, pour qu'elles s'affichent tout de suite quand on joue la note.
 * Les vidéos ne sont pas téléchargées (trop lourdes) : seule leur vignette l'est,
 * elle sert d'image d'attente (poster) le temps que la vidéo démarre.
 *
 * Un par un (les touches du clavier d'ordinateur d'abord), pour ne pas ralentir
 * l'affichage ; si la liste change entre-temps, l'ancien préchargement s'arrête.
 * Les images décodées sont gardées en mémoire (CACHE_MAX) : rejouer une touche est instantané.
 */

const CACHE_MAX = 200; // images gardées décodées (~1600 px chacune)
const cache = new Map(); // url → Image (gardée pour que le navigateur ne jette pas le décodage)

function loadImage(url) {
  let image = cache.get(url);
  if (image) {
    cache.delete(url); // remis en dernier = utilisé récemment
    cache.set(url, image);
    return image.ready;
  }
  image = new Image();
  image.decoding = "async";
  image.src = url;
  image.ready = image.decode().catch(() => {}); // fichier abîmé : Stage.jsx s'en occupera
  cache.set(url, image);
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
  return image.ready;
}

let preloadRun = 0;
export function preloadItems(items) {
  const urls = [];
  for (const item of items) {
    if (!item) continue;
    if (item.kind === "image") urls.push(item.src);
    if (item.thumb) urls.push(item.thumb);
  }
  const order = [...new Set(urls)];

  const run = ++preloadRun;
  (async () => {
    for (const url of order) {
      if (run !== preloadRun) return;
      await loadImage(url);
    }
  })();
}
