/*
 * format.js — PETITS OUTILS DE TEXTE
 * Utilisé par : Caption.jsx, Stage.jsx.
 */

// Texte -> ASCII pur (seuls caracteres affiches par un vrai terminal).
// Accents retires ("é" -> "e"), ponctuation typographique remplacee, le reste supprime.
const ASCII_REPLACEMENTS = {
  "\u2018": "'", "\u2019": "'", "\u201A": "'", "\u2032": "'",
  "\u201C": '"', "\u201D": '"', "\u201E": '"', "\u00AB": '"', "\u00BB": '"',
  "\u2013": "-", "\u2014": "-", "\u2212": "-", "\u00B7": "-", "\u2022": "-",
  "\u2026": "...", "\u00D7": "x", "\u00A0": " ", "\u202F": " ",
  "\u00C6": "AE", "\u00E6": "ae", "\u0152": "OE", "\u0153": "oe", "\u00DF": "ss",
  "\u00D8": "O", "\u00F8": "o", "\u00B0": "o",
};

export function toAscii(text) {
  return String(text)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E]/g, (char) => ASCII_REPLACEMENTS[char] ?? "");
}

// "Rock aux arènes-11.jpg" -> "rock aux arenes-11"
export function mediaTitle(item) {
  return toAscii(item.name.replace(/\.[^.]+$/, "").toLowerCase());
}

// Date du fichier -> toujours "04/08/1998" (jour/mois/année), quelle que soit la langue.
// Rien si le nom ne contient pas de date.
export function mediaDate(item) {
  if (!item.date) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(item.date.getDate())}/${pad(item.date.getMonth() + 1)}/${item.date.getFullYear()}`;
}

// 1 -> "1 media", 27 -> "27 medias" (dans la langue en cours)
export function mediaCount(count, t) {
  return `${count} ${t(count > 1 ? "medias" : "media")}`;
}
