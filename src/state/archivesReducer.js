import { CHORD_MAX, CHORD_MS, KEY_COUNT, KEY_OFFSET_STEP, LOG_MAX } from "../constants.js";
import { YEARS } from "../data/years.js";
import { DEFAULT_LANG, LANG_MODES, nextLang } from "../i18n.js";

/*
 * archivesReducer.js — LE CERVEAU (l'état de l'application)
 * ------------------------------------------------------------
 * Rôle : contient TOUTES les règles de l'appli. Il reçoit une action
 *        (ex. { type: "noteOn", key: 3 }) et renvoie le nouvel état.
 *        Il ne dessine rien et ne touche ni au clavier ni à l'écran.
 *
 * Principe : la scène est un terminal.
 *   - jouer une touche ajoute « $ show 1998/photo.jpg » puis l'image ;
 *   - plusieurs touches jouées ensemble (accord) : les images apparaissent
 *     en même temps, côte à côte sur la même ligne ;
 *   - changer d'année ajoute « $ cd 1998/ » ;
 *   - rien ne se superpose : chaque entrée apparaît tout de suite sous la
 *     précédente et le flux remonte (voir Stage.jsx).
 *
 * Le journal (log) est la liste des entrées du terminal :
 *   { id, type: "cd",    year, count, videos } changement d'année
 *   { id, type: "text",  text, command, error } ligne de commande ($) ou remarque
 *     (textKey / errorKey + params : texte traduit, voir i18n.js)
 *   Chaque entrée garde la langue du moment où elle a été écrite (lang) :
 *   une ligne déjà écrite ne change plus de langue ensuite.
 *   { id, type: "media", year, items }   médias affichés (plusieurs = accord)
 */

// Le média joué par une touche : on refait le tour si la touche dépasse
// le nombre de médias (marche aussi pour les touches graves d'un clavier MIDI).
export function itemForKey(year, key, keyOffset) {
  const count = year.items.length;
  if (count === 0) return undefined;
  return year.items[(((key + keyOffset) % count) + count) % count];
}

// Au démarrage : la dernière année qui contient des médias.
// Année affichée à l'ouverture de la page : START_YEAR (même vide),
// sinon la dernière année qui a des médias.
const START_YEAR = "2026";
function startYear() {
  const index = YEARS.findIndex((year) => year.name === START_YEAR);
  return index >= 0 ? index : lastYearWithMedia();
}

function lastYearWithMedia() {
  for (let i = YEARS.length - 1; i >= 0; i--) {
    if (YEARS[i].items.length > 0) return i;
  }
  return YEARS.length - 1;
}

// Ajoute une entrée au journal ; les plus anciennes sortent par le haut.
function addToLog(state, entry) {
  return {
    ...state,
    log: [...state.log, { id: state.nextId, lang: state.lang, ...entry }].slice(-LOG_MAX),
    nextId: state.nextId + 1,
  };
}

function cdEntry(index) {
  const { name, items } = YEARS[index];
  return { type: "cd", year: name, count: items.length, videos: items.filter((item) => item.kind === "video").length };
}

export function createInitialState(langMode = "random") {
  const selectedYear = startYear();
  return {
    selectedYear,                      // index de l'année choisie dans YEARS
    wheelValue: 0,                     // position de la molette, de -1 (bas) à +1 (haut)
    keyOffset: 0,                      // décalage z/x : la touche 0 montre le média n° keyOffset
    pressedKeys: new Set(),            // touches actuellement enfoncées
    playedKeys: new Set(),             // touches déjà jouées dans cette année (vignettes en bas)
    log: [],                           // entrées du terminal (vide au lancement : seule l'invite « young gods ~ % » s'affiche)
    lastNoteTime: -Infinity,           // heure de la dernière touche jouée (pour les accords)
    nextId: 2,                         // identifiant unique de chaque entrée
    started: true,                     // son des vidéos actif dès le départ
    lang: DEFAULT_LANG,                // langue de l'interface (change à chaque touche, voir i18n.js)
    langMode: LANG_MODES.includes(langMode) ? langMode : "random", // réglé dans le panneau Ctrl
  };
}

function selectYear(state, index) {
  if (index === state.selectedYear) return state;

  return addToLog({ ...state, selectedYear: index, keyOffset: 0, playedKeys: new Set() }, cdEntry(index));
}

function noteOn(state, key, time = performance.now()) {
  const pressedKeys = new Set(state.pressedKeys).add(key);
  state = { ...state, lang: nextLang(state.lang, state.langMode) }; // chaque touche change la langue
  const year = YEARS[state.selectedYear];
  const item = itemForKey(year, key, state.keyOffset);
  const last = state.log[state.log.length - 1];
  // Accord : touche jouée moins de CHORD_MS après la précédente -> même ligne.
  const together = time - state.lastNoteTime < CHORD_MS;

  if (!item) {
    const next = { ...state, pressedKeys, lastNoteTime: time };
    if (together && last?.type === "media") return next;
    return addToLog(next, { type: "text", command: true, text: `show ${year.name}/`, errorKey: "noMediaOnKey" });
  }

  const next = { ...state, pressedKeys, playedKeys: new Set(state.playedKeys).add(key), lastNoteTime: time };

  if (
    together &&
    last?.type === "media" &&
    last.year === year.name &&
    last.items.length < CHORD_MAX &&
    !last.items.includes(item)
  ) {
    const group = { ...last, items: [...last.items, item] };
    return { ...next, log: [...state.log.slice(0, -1), group] };
  }

  return addToLog(next, { type: "media", year: year.name, items: [item] });
}

function noteOff(state, key) {
  const pressedKeys = new Set(state.pressedKeys);
  pressedKeys.delete(key);
  return { ...state, pressedKeys };
}

// z / x : décale les touches de 12 médias pour atteindre ceux au-delà de la 17e.
function shiftKeys(state, direction) {
  const count = YEARS[state.selectedYear].items.length;
  const max = Math.max(0, Math.floor((count - 1) / KEY_OFFSET_STEP) * KEY_OFFSET_STEP);
  const keyOffset = Math.max(0, Math.min(max, state.keyOffset + direction * KEY_OFFSET_STEP));
  if (keyOffset === state.keyOffset) return state;

  return addToLog(
    { ...state, keyOffset, playedKeys: new Set() },
    { type: "text", command: true, textKey: "keysRange", params: { from: keyOffset + 1, to: keyOffset + KEY_COUNT } }
  );
}

// Un fichier n'a pas pu s'afficher : on le retire du terminal.
function removeFailedMedia(state, item) {
  const log = state.log
    .map((entry) => (entry.items?.includes(item) ? { ...entry, items: entry.items.filter((i) => i !== item) } : entry))
    .filter((entry) => !entry.items || entry.items.length > 0);
  return { ...state, log };
}

// Liste des actions et de qui les envoie :
//   noteOn / noteOff → useKeyboard, useMidi, clic sur la bande des touches
//   shiftKeys        → useKeyboard (z/x)
//   selectYear       → clic sur la frise des années
//   changeYear       → useWheelRepeat (année suivante/précédente)
//   setWheel         → useKeyboard (↑↓), useMidi (pitch bend)
//   start            → premier clic (active le son des vidéos)
//   mediaFailed      → Stage (un fichier ne peut pas s'afficher)
//   setLangMode      → panneau Ctrl (langue : aléatoire / boucle / fixe)
//   clearLog         → App.jsx, mise en veille : vide le terminal et les vignettes du piano
export function archivesReducer(state, action) {
  switch (action.type) {
    case "noteOn":
      return noteOn(state, action.key, action.time);
    case "noteOff":
      return noteOff(state, action.key);
    case "shiftKeys":
      return shiftKeys(state, action.direction);
    case "selectYear":
      return selectYear(state, action.index);
    case "changeYear": {
      const lastYear = YEARS.length - 1;
      const index = Math.max(0, Math.min(lastYear, state.selectedYear + action.direction));
      return selectYear(state, index);
    }
    case "setWheel":
      return { ...state, wheelValue: action.value };
    case "start":
      return state.started ? state : { ...state, started: true };
    case "mediaFailed":
      return removeFailedMedia(state, action.item);
    case "clearLog":
      return { ...state, log: [], playedKeys: new Set() };
    case "setLangMode":
      return { ...state, langMode: action.mode, lang: action.mode === "fixed" ? DEFAULT_LANG : state.lang };
    default:
      throw new Error(`Action inconnue : ${action.type}`);
  }
}
