/*
 * constants.js — LES RÉGLAGES
 * ------------------------------------------------------------
 * Rôle : regroupe tous les nombres "magiques" au même endroit.
 *        Pour changer un comportement (vitesse, nombre de touches…), c'est ici.
 */

// Molette
export const WHEEL_DEAD_ZONE = 0.15;      // en dessous de cette valeur, la molette est considérée au repos
export const WHEEL_RELEASE_ZONE = 0.08;   // une fois lancée, la molette ne s'arrête que sous cette valeur (anti-rebond)
export const WHEEL_REBOUND_MS = 300;      // après l'arrêt, le sens opposé est ignoré pendant ce temps (rebond du ressort pitch bend)
export const YEAR_MIN_INTERVAL_MS = 150;  // écart minimum entre deux changements d'année quand la molette repart
export const KEYBOARD_WHEEL_VALUE = 0.6;  // valeur simulée quand on appuie sur ↑ ou ↓

// Touches
export const KEY_COUNT = 17;          // nombre de touches au clavier d'ordinateur (a w s e d …)
export const MIDI_KEY_COUNT = 76;     // nombre de touches du clavier MIDI (à régler selon ton clavier : 25, 49, 61, 76, 88…)
export const KEY_OFFSET_STEP = 12;    // z/x décale les touches de 12 médias
export const KEYBOARD_BASE_NOTE = 60; // note MIDI de la touche "a" du clavier d'ordinateur (60 = do4)
export const FIRST_MIDI_NOTE = 36;    // note MIDI de la touche la plus grave (36 = do2 ; 28 = mi1 pour beaucoup de claviers 76 touches)

// Écran de démarrage / veille (SleepScreen.jsx) : un terminal au repos avec ce texte.
export const SLEEP_PROMPT = "young gods ~ %";
export const SLEEP_AFTER_MS = 2 * 10 * 1000; // retour à l'écran de veille après 20 secondes sans activité

// Scène (flux façon terminal)
export const LOG_MAX = 80;            // nombre d'entrées gardées dans le flux (les plus anciennes sortent par le haut)

// Accords : touches jouées ensemble -> images côte à côte sur la même ligne
export const CHORD_MS = 150;          // deux touches à moins de 150 ms d'écart = jouées ensemble
export const CHORD_MAX = 6;           // nombre maximum d'images sur une même ligne

// Une touche par note, de gauche à droite.
// Ex. : "a" = touche 0 = 1er média, "w" = touche 1 = 2e média, etc.
export const KEY_NAMES = ["a", "w", "s", "e", "d", "f", "t", "g", "y", "h", "u", "j", "k", "o", "l", "p", ";"];

// Nom des notes (pour la bande du bas quand un clavier MIDI est branché).
export const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
