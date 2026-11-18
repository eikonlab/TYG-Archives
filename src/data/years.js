/*
 * years.js — LES DONNÉES (les fichiers du dossier src/img)
 * ------------------------------------------------------------
 * Rôle : liste les photos et vidéos de src/img (sous-dossiers compris)
 *        et les range par année.
 *          - L'année est le nom du premier dossier : img/1985/PHOTO/x.jpg → 1985.
 *          - Un fichier posé hors d'un dossier d'année prend l'année de la date
 *            écrite dans son nom, sinon il va dans le groupe "sans-date".
 *        Les autres fichiers (pdf, audio, tif, documents…) sont ignorés.
 *        Un fichier que le navigateur n'arrive pas à afficher est retiré
 *        (forgetItem) et n'est plus compté.
 * Utilisé par : archivesReducer.js et les composants (YEARS).
 *
 * Aucun fichier n'est chargé ici : on ne fait que lister les chemins.
 * Une image n'est téléchargée que quand elle s'affiche (voir Stage.jsx).
 *
 * Forme des données :
 *   YEARS = [ { name: "1985", items: [ { kind, name, path, src, thumb, date, width, height, duration, loaded }, ... ] }, ... ]
 */

// Liste des fichiers de src/img : [{ path: "1985/PHOTO/ludande1.jpg", mtime }, ...].
// Elle est fabriquée par le plugin "archive-files" dans vite.config.js,
// qui écarte déjà les fichiers vides ou abîmés.
import FILES from "virtual:archive-files";

const VIDEO_EXTENSIONS = ["mp4", "mov", "m4v"];
const UNDATED = "sans-date";
const LAST_YEAR = 2026; // la frise va toujours au moins jusqu'à cette année (vide s'il n'y a rien)

// Cherche une date dans un texte, ou retourne null.
function dateFromText(text) {
  let match = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/); // 2026-10-26
  if (match) return new Date(match[1], match[2] - 1, match[3]);

  match = text.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/); // 30.08.1985
  if (match) return new Date(match[3], match[2] - 1, match[1]);

  match = text.match(/(?<!\d)((?:19|20)\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])(?!\d)/); // 19850519
  if (match) return new Date(match[1], match[2] - 1, match[3]);

  return null;
}

// Adresse du fichier pour <img> / <video>. Chaque morceau du chemin est encodé
// car certains noms contiennent des espaces, des "?" ou des accents.
// En ligne (npm run build dans prez/) : les médias sont dans dist/media/, partagés
// par v1 et v2. VITE_MEDIA_URL permet de les mettre ailleurs (ex. un autre serveur).
const MEDIA_BASE =
  import.meta.env.VITE_MEDIA_URL ?? (import.meta.env.DEV ? import.meta.env.BASE_URL + "src/img/" : "../media/");

// Copies légères (scripts/optimiser-medias.mjs) : même chemin + ".webp" / ".mp4" / ".thumb.webp".
const WEB_BASE =
  import.meta.env.VITE_MEDIA_WEB_URL ??
  (import.meta.env.DEV ? import.meta.env.BASE_URL + "src/img-web/" : "../media-web/");

function fileUrl(path, base = MEDIA_BASE) {
  return base + path.split("/").map(encodeURIComponent).join("/");
}

/* Fichiers que le navigateur n'a pas réussi à afficher */

// Ils sont retenus dans le navigateur (localStorage) pour être exclus dès le
// démarrage les fois suivantes. La clé contient la date de modification :
// si le fichier est remplacé ou réparé, il est de nouveau essayé.
const FAILED_KEY = "archives-failed-files";

function fileKey(path, mtime) {
  return `${path}|${mtime}`;
}

function loadFailedKeys() {
  try {
    return new Set(JSON.parse(localStorage.getItem(FAILED_KEY)) ?? []);
  } catch {
    return new Set();
  }
}

const failedKeys = loadFailedKeys();

// Appelée par Stage quand un fichier ne s'affiche pas :
// on le retire de son année (il n'est plus compté).
// On ne s'en souvient (localStorage) que si le fichier existe encore mais est abîmé :
// un fichier simplement supprimé du dossier img/ n'est pas noté, pour qu'il revienne
// normalement s'il est remis plus tard (ex. sorti de la Corbeille, même date).
export function forgetItem(item) {
  fetch(item.src, { method: "HEAD" })
    .then((response) => {
      // Fichier retiré : erreur, ou le serveur renvoie la page du site (text/html) à la place.
      const type = response.headers.get("content-type") || "";
      if (!response.ok || type.includes("text/html")) return; // rien à retenir
      failedKeys.add(fileKey(item.path, item.mtime));
      localStorage.setItem(FAILED_KEY, JSON.stringify([...failedKeys]));
    })
    .catch(() => {
      // serveur ou stockage indisponible : le fichier sera réessayé au prochain chargement
    });

  const year = YEARS.find((other) => other.name === item.yearName);
  if (year) year.items = year.items.filter((other) => other !== item);
}

/* Construction des années */

function createItem({ path, mtime, web, thumb }) {
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  const kind = VIDEO_EXTENSIONS.includes(name.split(".").pop().toLowerCase()) ? "video" : "image";
  // Date lue dans le nom du fichier, sinon dans ses dossiers ("26.04.2018 LUZERN/…").
  const date = dateFromText(name) ?? dateFromText(path);

  let yearName = UNDATED;
  if (parts.length > 1 && /^\d{4}$/.test(parts[0])) yearName = parts[0];
  else if (date) yearName = String(date.getFullYear());

  return {
    kind,
    name,
    path,
    mtime,
    yearName,
    // Copie légère si elle existe (WebP 1600 px / vidéo 720p), sinon l'original.
    src: web ? fileUrl(path + (kind === "video" ? ".mp4" : ".webp"), WEB_BASE) : fileUrl(path),
    // Vignette 240 px (bande des touches, image d'attente des vidéos), ou null.
    thumb: thumb ? fileUrl(path + ".thumb.webp", WEB_BASE) : null,
    date,
    // Taille et durée provisoires, remplacées quand le fichier est chargé (rememberMediaInfo).
    width: kind === "video" ? 640 : 600,
    height: kind === "video" ? 360 : 400,
    duration: 0,
    loaded: false,
  };
}

function createYears() {
  const groups = new Map();

  for (const file of FILES) {
    if (failedKeys.has(fileKey(file.path, file.mtime))) continue;
    const item = createItem(file);
    if (!groups.has(item.yearName)) groups.set(item.yearName, []);
    groups.get(item.yearName).push(item);
  }

  // "sans-date" en premier, puis les années dans l'ordre.
  const yearNames = [...groups.keys()].sort((a, b) =>
    a === UNDATED ? -1 : b === UNDATED ? 1 : a.localeCompare(b)
  );

  // Les années sans aucun fichier entre la première et la dernière sont ajoutées
  // (vides) pour que la frise du temps soit continue : 1985, 1986, 1987… jusqu'à LAST_YEAR.
  const numeric = yearNames.filter((name) => name !== UNDATED).map(Number);
  if (numeric.length > 0) {
    for (let year = Math.min(...numeric); year <= Math.max(LAST_YEAR, ...numeric); year++) {
      if (!groups.has(String(year))) {
        groups.set(String(year), []);
        yearNames.push(String(year));
      }
    }
    yearNames.sort((a, b) => (a === UNDATED ? -1 : b === UNDATED ? 1 : a.localeCompare(b)));
  }

  // Dans une année, l'ordre est celui des dossiers ("01 janvier", "02 fevrier"…).
  return yearNames.map((yearName) => ({
    name: yearName,
    items: groups
      .get(yearName)
      .sort((a, b) => a.path.localeCompare(b.path, "fr", { numeric: true })),
  }));
}

export const YEARS = createYears();
