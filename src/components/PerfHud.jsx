import { useEffect, useState } from "react";

/*
 * PerfHud.jsx — INFOS PERFORMANCES (case « infos perf » du panneau Ctrl)
 * ------------------------------------------------------------
 * Petit cadre en haut à gauche, mis à jour 2 fois par seconde :
 *   fps        images affichées par seconde (60 = fluide)
 *   image      temps moyen d'une image / la plus lente (ms) — 16,7 ms = 60 fps
 *   saccades   images de plus de 50 ms depuis l'ouverture du cadre
 *   memoire    mémoire JavaScript utilisée (Chrome / Edge seulement)
 *   medias     images et vidéos présentes dans la page (vidéos en lecture)
 *   ecran      taille de la fenêtre × densité de pixels
 * Posé hors de <main> : il ne tremble pas avec l'effet cathodique.
 */

const UPDATE_MS = 500;
const SLOW_FRAME_MS = 50;
const HISTORY = 40; // nombre de mesures dans la petite courbe
const BARS = " .:-=+*#"; // du plus bas au plus haut

function fpsClass(fps) {
  if (fps >= 50) return "is-good";
  if (fps >= 30) return "is-mid";
  return "is-bad";
}

export default function PerfHud() {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    let frame = 0;
    let frames = 0;
    let worst = 0;
    let slow = 0;
    let last = performance.now();
    let windowStart = last;
    const history = [];

    function loop(now) {
      const dt = now - last;
      last = now;
      frames++;
      if (dt > worst) worst = dt;
      if (dt > SLOW_FRAME_MS) slow++;

      const elapsed = now - windowStart;
      if (elapsed >= UPDATE_MS) {
        const fps = (frames * 1000) / elapsed;
        history.push(fps);
        if (history.length > HISTORY) history.shift();

        const videos = [...document.querySelectorAll("video")];
        const memory = performance.memory;
        setInfo({
          fps,
          avg: elapsed / frames,
          worst,
          slow,
          graph: history.map((v) => BARS[Math.max(0, Math.min(BARS.length - 1, Math.round((v / 60) * (BARS.length - 1))))]).join(""),
          memory: memory ? memory.usedJSHeapSize / 1048576 : null,
          memoryMax: memory ? memory.jsHeapSizeLimit / 1048576 : null,
          images: document.querySelectorAll("img").length,
          videos: videos.length,
          playing: videos.filter((v) => !v.paused && !v.ended).length,
          screen: `${window.innerWidth}x${window.innerHeight} @${window.devicePixelRatio}x`,
        });
        frames = 0;
        worst = 0;
        windowStart = now;
      }
      frame = requestAnimationFrame(loop);
    }

    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  if (!info) return null;

  return (
    <aside className="perf-hud" aria-label="Performances">
      <div>
        fps <span className={fpsClass(info.fps)}>{info.fps.toFixed(0).padStart(3)}</span>
        <span className="perf-graph">{info.graph}</span>
      </div>
      <div>
        image {info.avg.toFixed(1)} ms / max {info.worst.toFixed(0)} ms
      </div>
      <div>saccades {info.slow}</div>
      <div>
        memoire{" "}
        {info.memory === null ? <span className="dim">n/d</span> : `${info.memory.toFixed(0)} / ${info.memoryMax.toFixed(0)} Mo`}
      </div>
      <div>
        medias {info.images} img - {info.videos} video ({info.playing} en lecture)
      </div>
      <div className="dim">ecran {info.screen}</div>
    </aside>
  );
}
