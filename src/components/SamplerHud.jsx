import { useEffect, useRef } from "react";
import { KEYBOARD_BASE_NOTE, KEY_NAMES, NOTE_NAMES } from "../constants.js";
import { getSamplerStatus } from "../audio/synth.js";

/*
 * SamplerHud.jsx — CE QUE JOUE LE SAMPLER (toujours visible, en bas à droite)
 * ------------------------------------------------------------
 * À chaque image (sans passer par React, pour rester fluide) :
 *   1. le cadre en bas à droite liste les extraits qui sonnent :
 *        a  C4  #25 1987  [#######.......]  3.2/10.0s  x2
 *        touche, note, n° d'extrait, année, barre de lecture, temps, nombre de boucles
 *      « chargement » = l'extrait n'est pas encore prêt ; « introuvable » = fichier absent.
 *      En haut, le vu-mètre du sampler.
 *   2. les touches de la bande du bas qui sonnent s'allument, avec leur barre de lecture ;
 *   3. la variable CSS --sound-level (0 → 1) est posée sur <main> (niveau du son).
 * Quand une note s'arrête, sa ligne disparaît du cadre (le cadre, lui, reste visible).
 */

const BAR = 18;  // largeur de la barre de lecture (caractères)
const METER = 29; // largeur du vu-mètre
const SMOOTH_UP = 0.5;    // le halo monte vite…
const SMOOTH_DOWN = 0.08; // … et redescend doucement

function noteName(note) {
  return `${NOTE_NAMES[note % 12]}${Math.floor(note / 12) - 1}`;
}

function keyLetter(note, isMidi) {
  if (isMidi) return "";
  return KEY_NAMES[note - KEYBOARD_BASE_NOTE] ?? "";
}

function bar(fraction, width) {
  const full = Math.round(Math.max(0, Math.min(1, fraction)) * width);
  return "#".repeat(full) + ".".repeat(width - full);
}

function line(voice, isMidi) {
  const head = `${keyLetter(voice.note, isMidi).padEnd(2)}${noteName(voice.note).padEnd(4)} #${String(voice.clip).padStart(2, "0")} ${voice.year}`;
  if (voice.status === "loading") return `${head}  chargement...`;
  if (voice.status === "error") return `${head}  introuvable`;
  const time = `${(voice.elapsed % voice.duration).toFixed(1)}/${voice.duration.toFixed(1)}s`;
  const loops = voice.loops > 0 ? `  x${voice.loops + 1}` : "";
  const tail = voice.status === "release" ? "  ~" : "";
  return `${head}  [${bar(voice.progress, BAR)}]  ${time.padStart(9)}${loops}${tail}`;
}

export default function SamplerHud({ targetRef, isMidi, low }) {
  const textRef = useRef(null);
  const isMidiRef = useRef(isMidi);
  isMidiRef.current = isMidi;

  useEffect(() => {
    let frame = 0;
    let level = 0;
    let lastText = "";
    let lastBox = null;
    let lit = new Map(); // note → élément de touche allumé à l'image précédente

    function loop() {
      const status = getSamplerStatus();

      // 1. Halo : niveau lissé posé sur <main>.
      level += (status.level - level) * (status.level > level ? SMOOTH_UP : SMOOTH_DOWN);
      if (level < 0.001) level = 0;
      targetRef.current?.style.setProperty("--sound-level", level.toFixed(3));

      // 2. Touches de la bande du bas.
      const nowLit = new Map();
      for (const voice of status.voices) {
        const key = document.querySelector(`.key[data-note="${voice.note}"]`);
        if (!key) continue;
        nowLit.set(voice.note, key);
        key.classList.add("is-sounding");
        key.classList.toggle("is-loading", voice.status === "loading");
        key.classList.toggle("is-error", voice.status === "error");
        key.style.setProperty("--progress", voice.progress.toFixed(3));
        key.style.setProperty("--fade", voice.fade.toFixed(3));
        const clip = key.querySelector(".key-clip");
        const label = voice.status === "loading" ? "..." : voice.status === "error" ? "x" : String(voice.clip).padStart(2, "0");
        if (clip && clip.textContent !== label) clip.textContent = label;
      }
      for (const [note, key] of lit) {
        if (nowLit.get(note) === key) continue;
        key.classList.remove("is-sounding", "is-loading", "is-error");
        key.style.removeProperty("--progress");
        key.style.removeProperty("--fade");
        const clip = key.querySelector(".key-clip");
        if (clip) clip.textContent = "";
      }
      lit = nowLit;

      // 3. Cadre texte.
      if (textRef.current !== lastBox) {
        lastBox = textRef.current; // cadre ré-affiché : on réécrit tout
        lastText = "";
      }
      if (textRef.current) {
        const head = status.blocked
          ? "sampler  SON BLOQUE : clique une fois (ou lance avec npm run dev)"
          : `sampler [${bar(level, METER)}]`;
        const body = status.voices.length
          ? status.voices.map((voice) => line(voice, isMidiRef.current)).join("\n")
          : "silence";
        textRef.current.classList.toggle("is-idle", status.voices.length === 0);
        const text = `${head}\n${body}`;
        if (text !== lastText) {
          textRef.current.textContent = text;
          lastText = text;
        }
      }

      frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      targetRef.current?.style.removeProperty("--sound-level");
      for (const key of lit.values()) key.classList.remove("is-sounding", "is-loading", "is-error");
    };
  }, [targetRef]);

  return <aside className={`sampler-hud${low ? " is-low" : ""}`} aria-label="Sampler" ref={textRef} />;
}
