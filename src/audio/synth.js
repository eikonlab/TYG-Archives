/*
 * synth.js — SAMPLER YOUNG GODS (Web Audio)
 * ------------------------------------------------------------
 * Rôle : quand on appuie sur une touche, joue un extrait des Young Gods
 *        (un extrait différent par touche ET par année).
 *   synthNoteOn(note, force) → démarre l'extrait de cette touche (note MIDI ; force 0 → 1)
 *   synthNoteOff(note)       → relâche : l'extrait s'éteint en fondu
 *   setSynthVolume(v)        → volume (panneau Ctrl : volume général × son du sampler)
 *   setSamplerYear(nom)      → choisit la série d'extraits de l'année affichée
 *   getSamplerStatus()       → ce qui sonne en ce moment (pour l'affichage, voir SamplerHud.jsx)
 * Utilisé par : hooks/useKeyboard.js, hooks/useMidi.js, App.jsx (volume, année).
 *
 * Les extraits sont lus DIRECTEMENT dans les enregistrements d'origine de
 * dossiers <année>/AUDIO du disque externe (lien src/audio/originaux) : aucun son n'est
 * copié. La liste des passages est dans audio/extraits/<année>.txt
 * (n° | <année>/AUDIO/fichier | moment dans le fichier) : 10 secondes par passage.
 * Seul ce morceau du fichier est téléchargé (voir decoupe.js), pas le fichier entier.
 * Chaque année (1985 → 2026 + sans-date) a jusqu'à 76 passages, un par touche du
 * clavier MIDI. Seuls les passages enregistrés l'année du dossier sont joués : une
 * année sans enregistrement reste muette, et une année qui a moins de 76 passages
 * à elle les répète sur le clavier.
 *
 * Touches : la note la plus grave du clavier MIDI (FIRST_MIDI_NOTE) = extrait 01,
 * la suivante = 02, … jusqu'à 76. Le clavier de l'ordinateur joue les mêmes
 * notes que le MIDI ("a" = do4 = note 60 → extrait 25, … ";" → extrait 41).
 * L'extrait tourne en boucle tant que la touche est tenue.
 * Polyphonique : chaque touche a sa propre voix (on peut superposer les extraits).
 */

import { FIRST_MIDI_NOTE } from "../constants.js";
import { cutClip } from "./decoupe.js";

// Réglages du son
const VOLUME = 0.8;
const ATTACK = 0.015;  // fondu d'entrée (secondes)
const RELEASE = 0.4;   // fondu de sortie quand on relâche (secondes)
const LOOP = true;     // l'extrait tourne en boucle tant que la touche est tenue
const KEYBOARD_NOTE = 60;  // note de la touche "a" du clavier d'ordinateur
const KEYBOARD_KEYS = 17;  // touches a … ; (préchargées en premier à chaque changement d'année)
const CACHE_MAX = 100;     // nombre d'extraits décodés gardés en mémoire (~3,5 Mo chacun) :
                           // les 76 de l'année affichée + quelques-uns de l'année d'avant

const CLIP_LENGTH = 10; // secondes jouées à partir du moment indiqué dans extraits/<année>.txt

// Adresse des enregistrements (dossiers <année>/AUDIO) (lien src/audio/originaux vers le disque externe).
const AUDIO_BASE =
  import.meta.env.VITE_AUDIO_URL ??
  (import.meta.env.DEV ? import.meta.env.BASE_URL + "src/audio/originaux/" : "../audio/");

// Passages rangés par année : { "1987": [{ id, number, url, start }, …], … }
// On ne garde que les passages enregistrés CETTE année-là : un enregistrement de
// 1990 listé dans 1991.txt est ignoré. Une année sans enregistrement n'a donc pas
// de son, et ses touches restent muettes.
const CLIPS = {};
const lists = import.meta.glob("./extraits/*.txt", { eager: true, query: "?raw", import: "default" });

// "8:16" ou "1:02:03" → secondes
function seconds(text) {
  return text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
}

for (const path of Object.keys(lists).sort()) {
  const folder = path.split("/").pop().replace(".txt", "");
  for (const line of lists[path].split("\n")) {
    const [number, file, time] = line.split("|").map((part) => part.trim());
    if (!number || !file || !time) continue;
    const recorded = file.split("/")[0];
    const sameYear = folder === "sans-date" ? recorded === "0000" || recorded === "no date" : recorded === folder;
    if (!sameYear) continue;
    (CLIPS[folder] ||= []).push({
      id: `${folder}/${number}`,
      number: Number(number),
      url: AUDIO_BASE + file.split("/").map(encodeURIComponent).join("/"),
      start: seconds(time),
    });
  }
}
const CLIP_YEARS = Object.keys(CLIPS);

// Cache : passage → promesse du son décodé (chargé seulement quand on en a besoin).
// Les plus anciens sont oubliés au-delà de CACHE_MAX pour ne pas saturer la mémoire.
const buffers = new Map();
let currentYear = CLIP_YEARS[CLIP_YEARS.length - 1];

// Nom affiché → dossier d'extraits. Pas d'emprunt aux années voisines :
// une année sans enregistrement → null (pas de son).
function clipYearFor(name) {
  if (CLIPS[name]) return name;
  if (Number.isNaN(Number(name)) && CLIPS["sans-date"]) return "sans-date";
  return null;
}

function loadClip(item) {
  let clip = buffers.get(item.id);
  if (clip) {
    buffers.delete(item.id); // remis en dernier = utilisé récemment
  } else {
    clip = cutClip(getContext(), item.url, item.start, CLIP_LENGTH).catch((error) => {
      console.warn(`Son introuvable : ${decodeURIComponent(item.url)} à ${item.start} s`, error);
      buffers.delete(item.id); // réessayé la prochaine fois
      return null;
    });
  }
  buffers.set(item.id, clip);
  while (buffers.size > CACHE_MAX) buffers.delete(buffers.keys().next().value);
  return clip;
}

// Passage d'une note dans la série de l'année.
function clipFor(clips, note) {
  const n = clips.length;
  return clips[(((note - FIRST_MIDI_NOTE) % n) + n) % n];
}

// Appelé par App.jsx quand l'année change (et à l'ouverture de la page) :
// on précharge TOUS les extraits de l'année (76, un par touche MIDI), pour qu'une
// touche sonne tout de suite, même la première fois. Les touches de l'ordinateur
// passent en premier. Un par un, pour ne pas faire ramer l'affichage ; si l'année
// change entre-temps, l'ancien préchargement s'arrête.
let preloadRun = 0;
export function setSamplerYear(name) {
  currentYear = clipYearFor(String(name));
  const clips = CLIPS[currentYear];
  if (!clips) return;
  getContext(); // le décodage marche même si le son est encore bloqué par le navigateur

  const first = [];
  for (let i = 0; i < KEYBOARD_KEYS; i++) first.push(clipFor(clips, KEYBOARD_NOTE + i));
  const order = [...new Set([...first, ...clips])];

  const run = ++preloadRun;
  (async () => {
    for (const clip of order) {
      if (run !== preloadRun) return;
      await loadClip(clip);
    }
  })();
}

let ctx = null;
let master = null;
let analyser = null;      // mesure le niveau sonore du sampler (pour l'affichage)
let levelData = null;
const voices = new Map(); // note → voix en cours
// Ce qui est affiché : note → { note, clip, year, status, startedAt, duration, releasedAt }
//   status = "loading" (extrait pas encore prêt) | "playing" | "release" (fondu de sortie) | "error"
const display = new Map();
let volume = 1;           // réglage du panneau Ctrl (0 → 1)

function getContext() {
  if (!ctx) {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = VOLUME * volume;
    master.connect(ctx.destination);
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    levelData = new Float32Array(analyser.fftSize);
    master.connect(analyser);
  }
  // Le navigateur suspend l'audio tant qu'on n'a pas interagi : une touche suffit à le réveiller.
  if (ctx.state === "suspended") ctx.resume();
  return ctx;
}


export function setSynthVolume(value) {
  volume = Math.max(0, value);
  if (master) master.gain.value = VOLUME * volume;
}

export function synthNoteOn(note, force = 0.8) {
  const clips = CLIPS[currentYear];
  if (!clips || clips.length === 0) return;
  const ac = getContext();
  synthNoteOff(note); // si l'extrait sonnait encore, on le relâche d'abord

  const amp = ac.createGain();
  amp.connect(master);
  const voice = { amp, source: null };
  voices.set(note, voice);

  const clip = clipFor(clips, note);
  const info = {
    note,
    clip: clip.number,
    year: currentYear,
    status: "loading",
    startedAt: 0,
    duration: 0,
    releasedAt: 0,
  };
  voice.info = info;
  display.set(note, info);

  const start = (buffer) => {
    if (!buffer) {
      info.status = "error";
      info.releasedAt = ac.currentTime;
      return;
    }
    if (voices.get(note) !== voice) return; // touche déjà relâchée
    const now = ac.currentTime;
    info.status = "playing";
    info.startedAt = now;
    info.duration = buffer.duration;
    const source = ac.createBufferSource();
    source.buffer = buffer;
    source.loop = LOOP;
    source.connect(amp);
    amp.gain.setValueAtTime(0, now);
    amp.gain.linearRampToValueAtTime(0.4 + 0.6 * force, now + ATTACK);
    source.onended = () => amp.disconnect();
    source.start(now);
    voice.source = source;
  };

  // L'extrait n'est peut-être pas encore décodé : on attend qu'il le soit.
  loadClip(clip).then(start);
}

export function synthNoteOff(note) {
  const voice = voices.get(note);
  if (!voice || !ctx) return;
  voices.delete(note);

  const now = ctx.currentTime;
  if (!voice.source) {
    voice.amp.disconnect();
    if (display.get(note) === voice.info && voice.info.status === "loading") display.delete(note);
    return;
  }
  voice.info.status = "release";
  voice.info.releasedAt = now;
  voice.amp.gain.cancelScheduledValues(now);
  voice.amp.gain.setValueAtTime(voice.amp.gain.value, now);
  voice.amp.gain.setTargetAtTime(0, now, RELEASE / 4);
  voice.source.stop(now + RELEASE + 0.05);
}

// Pour l'affichage (SamplerHud.jsx), appelé à chaque image :
//   level  = niveau sonore du sampler (0 → 1 environ)
//   voices = extraits en cours : { note, clip, year, status, progress (0 → 1), elapsed, duration, fade (1 → 0) }
const HOLD_ERROR = 1.2; // secondes pendant lesquelles un extrait introuvable reste affiché
export function getSamplerStatus() {
  if (!ctx) return { level: 0, voices: [], blocked: false };
  const now = ctx.currentTime;

  analyser.getFloatTimeDomainData(levelData);
  let sum = 0;
  for (let i = 0; i < levelData.length; i++) sum += levelData[i] * levelData[i];
  const level = Math.min(1, Math.sqrt(sum / levelData.length) * 3);

  const list = [];
  for (const [note, info] of display) {
    let fade = 1;
    if (info.status === "release") {
      fade = 1 - (now - info.releasedAt) / RELEASE;
      if (fade <= 0) {
        display.delete(note);
        continue;
      }
    } else if (info.status === "error" && now - info.releasedAt > HOLD_ERROR) {
      display.delete(note);
      continue;
    }
    const elapsed = info.startedAt ? now - info.startedAt : 0;
    const progress = info.duration ? (elapsed % info.duration) / info.duration : 0;
    list.push({ ...info, elapsed, progress, fade, loops: info.duration ? Math.floor(elapsed / info.duration) : 0 });
  }
  list.sort((a, b) => a.note - b.note);
  // Son bloqué par le navigateur (Chrome ouvert à la main, sans l'option du serveur).
  return { level, voices: list, blocked: ctx.state !== "running" };
}
