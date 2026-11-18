import { useEffect, useRef, useState } from "react";
import { WHEEL_DEAD_ZONE, WHEEL_RELEASE_ZONE, WHEEL_REBOUND_MS, YEAR_MIN_INTERVAL_MS } from "../constants.js";

/*
 * useWheelRepeat.js — DÉFILEMENT DES ANNÉES
 * ------------------------------------------------------------
 * Tant que la molette est poussée, change d'année à intervalle régulier.
 * Plus elle est poussée, plus les années défilent vite.
 * Utilisé par : App.jsx. Envoie l'action : changeYear.
 * La valeur de la molette vient de useKeyboard (↑↓) ou useMidi (pitch bend).
 *
 * Anti-rebond :
 *   1. Hystérésis : la molette démarre au-delà de WHEEL_DEAD_ZONE mais ne
 *      s'arrête qu'en dessous de WHEEL_RELEASE_ZONE (pas de clignotement
 *      quand elle tremble autour du seuil).
 *   2. Rebond du ressort : quand on lâche la molette pitch bend, elle repasse
 *      un instant de l'autre côté du centre. Pendant WHEEL_REBOUND_MS après
 *      l'arrêt, le sens opposé est ignoré.
 *   3. Dates : jamais deux changements d'année à moins de
 *      YEAR_MIN_INTERVAL_MS d'écart quand la molette repart.
 */
export function useWheelRepeat(wheelValue, dispatch) {
  // latestValue garde la valeur la plus récente sans relancer la minuterie
  // à chaque petit mouvement de la molette.
  const latestValue = useRef(wheelValue);
  const [direction, setDirection] = useState(0); // -1, 0 ou +1 (sens de la molette)
  const directionRef = useRef(0);
  const release = useRef({ time: -Infinity, direction: 0 }); // dernier arrêt de la molette
  const lastStep = useRef(-Infinity); // heure du dernier changement d'année

  useEffect(() => {
    latestValue.current = wheelValue;
    let recheck = null;

    function update() {
      const value = latestValue.current;
      const sign = Math.sign(value);
      const abs = Math.abs(value);
      const now = performance.now();
      let next = directionRef.current;

      if (next !== 0) {
        // En marche : on s'arrête sous le seuil de relâche ou si le sens s'inverse.
        if (abs < WHEEL_RELEASE_ZONE || sign !== next) {
          release.current = { time: now, direction: next };
          next = 0;
        }
      }

      if (next === 0 && abs > WHEEL_DEAD_ZONE) {
        const sinceRelease = now - release.current.time;
        if (sign === -release.current.direction && sinceRelease < WHEEL_REBOUND_MS) {
          // Rebond probable : on revérifie à la fin de la fenêtre au cas où
          // la molette est vraiment tenue dans l'autre sens.
          recheck = setTimeout(update, WHEEL_REBOUND_MS - sinceRelease);
        } else {
          next = sign;
        }
      }

      if (next !== directionRef.current) {
        directionRef.current = next;
        setDirection(next);
      }
    }

    update();
    return () => clearTimeout(recheck);
  }, [wheelValue]);

  useEffect(() => {
    if (direction === 0) return;

    let timer = null;

    function tick() {
      lastStep.current = performance.now();
      dispatch({ type: "changeYear", direction: direction > 0 ? -1 : 1 });
      // Délai : 480 ms molette à peine poussée → 60 ms molette à fond.
      timer = setTimeout(tick, Math.max(60, 480 - 420 * Math.abs(latestValue.current)));
    }

    const wait = lastStep.current + YEAR_MIN_INTERVAL_MS - performance.now();
    if (wait > 0) timer = setTimeout(tick, wait);
    else tick();
    return () => clearTimeout(timer);
  }, [direction, dispatch]);
}
