/*
 * fxSettings.js — RÉGLAGES DES EFFETS ET DES SONS (panneau Ctrl)
 * ------------------------------------------------------------
 * Chaque réglage est un nombre : 1 = 100 % (réglage d'origine), 0 = coupé.
 *   EFFECTS : intensité de chaque effet visuel (0 → 200 %)
 *   SOUNDS  : volume de chaque son (0 → 100 %)
 * Les valeurs sont gardées dans le navigateur (localStorage) d'une visite à l'autre.
 */

export const EFFECTS = [
  { id: "scanlines", label: "lignes de balayage" },
  { id: "mask", label: "masque RGB" },
  { id: "roll", label: "bande lumineuse" },
  { id: "rollSpeed", label: "vitesse bande lumineuse" },
  { id: "rollRate", label: "frequence bande lumineuse" },
  { id: "vignette", label: "vignettage" },
  { id: "glow", label: "lueur du texte" },
  { id: "aberration", label: "decalage rouge/bleu" },
  { id: "image", label: "contraste des images" },
  { id: "flicker", label: "scintillement" },
  { id: "jitter", label: "tremblement" },
  { id: "distort", label: "lignes de distorsion" },
  { id: "glitch", label: "bug changement d'annee" },
];
export const EFFECT_MAX = 2; // 200 %

export const SOUNDS = [
  { id: "master", label: "volume general" },
  { id: "videos", label: "son des videos" },
  { id: "yearGlitch", label: "bruit changement d'annee" },
  { id: "synth", label: "son du sampler" },
];
export const SOUND_MAX = 1; // 100 %

const STORAGE_KEY = "archives-fx-settings";

export function defaultSettings() {
  const settings = {};
  for (const { id } of [...EFFECTS, ...SOUNDS]) settings[id] = 1;
  return settings;
}

export function loadSettings() {
  const settings = defaultSettings();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    for (const id of Object.keys(settings)) {
      if (typeof saved[id] === "number" && Number.isFinite(saved[id])) settings[id] = saved[id];
    }
  } catch {
    // stockage indisponible : on garde les valeurs par défaut
  }
  return settings;
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // stockage indisponible : tant pis, les réglages restent pour cette session
  }
}

// Variables CSS posées sur <main> : --fx-scanlines, --fx-mask, …
export function effectCssVars(settings) {
  const vars = {};
  for (const { id } of EFFECTS) vars[`--fx-${id}`] = settings[id];
  return vars;
}
