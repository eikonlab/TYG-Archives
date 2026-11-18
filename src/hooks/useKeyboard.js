import { useEffect } from "react";
import { KEYBOARD_BASE_NOTE, KEYBOARD_WHEEL_VALUE, KEY_NAMES } from "../constants.js";
import { synthNoteOff, synthNoteOn } from "../audio/synth.js";


function isArrow(event) {
  return event.key === "ArrowUp" || event.key === "ArrowDown";
}

/*
 * useKeyboard.js — CLAVIER DE L'ORDINATEUR
 * ------------------------------------------------------------
 * Écoute les touches de l'ordinateur et les traduit en actions :
 *   ↑ / ↓         → setWheel  (simule la molette pitch bend)
 *   z / x         → shiftKeys (décale le piano de 12 médias)
 *   a w s e d …   → noteOn / noteOff (comme les touches d'un piano)
 * Utilisé par : App.jsx.
 * event.repeat : ignore la répétition automatique quand on garde une touche enfoncée.
 */
export function useKeyboard(dispatch, isVideoKey = () => false) {
  useEffect(() => {
    function handleKeyDown(event) {
      if (event.ctrlKey || event.metaKey || event.altKey) return;

      const key = event.key.toLowerCase();

      if (isArrow(event)) {
        event.preventDefault();
        if (!event.repeat) {
          const value = event.key === "ArrowUp" ? KEYBOARD_WHEEL_VALUE : -KEYBOARD_WHEEL_VALUE;
          dispatch({ type: "setWheel", value });
        }
        return;
      }

      if (key === "z" || key === "x") {
        if (!event.repeat) dispatch({ type: "shiftKeys", direction: key === "x" ? 1 : -1 });
        return;
      }

      const pianoKey = KEY_NAMES.indexOf(key);
      if (pianoKey >= 0) {
        event.preventDefault();
        if (!event.repeat) {
          if (!isVideoKey(pianoKey)) synthNoteOn(KEYBOARD_BASE_NOTE + pianoKey);
          dispatch({ type: "noteOn", key: pianoKey, time: performance.now() });
        }
      }
    }

    function handleKeyUp(event) {
      if (isArrow(event)) {
        dispatch({ type: "setWheel", value: 0 });
        return;
      }

      const pianoKey = KEY_NAMES.indexOf(event.key.toLowerCase());
      if (pianoKey >= 0) {
        synthNoteOff(KEYBOARD_BASE_NOTE + pianoKey);
        dispatch({ type: "noteOff", key: pianoKey, time: performance.now() });
      }
    }

    // On écoute toute la fenêtre ; la fonction de retour retire les écouteurs
    // quand le composant disparaît (nettoyage).
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [dispatch, isVideoKey]);
}
