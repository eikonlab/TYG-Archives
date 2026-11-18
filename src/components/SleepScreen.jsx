import { SLEEP_PROMPT } from "../constants.js";

/*
 * SleepScreen.jsx — INVITE DE DÉMARRAGE ET DE VEILLE (en bas du terminal)
 * ------------------------------------------------------------
 * Deux lignes ajoutées en bas du flux du terminal (Stage.jsx), à la place du
 * curseur seul, comme le terminal du Mac au repos :
 *   Last login: Mon Nov 16 14:02:11 on console
 *   young gods ~ % █
 * L'interface reste la même (années, piano, images déjà jouées…).
 * Affiché à l'ouverture de la page et après SLEEP_AFTER_MS sans activité
 * (réglages dans constants.js). App.jsx le retire seulement à la première
 * touche jouée (clavier d'ordinateur ou note MIDI) — pas au clic.
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Date au format du terminal Mac : "Mon Nov 16 14:02:11"
function loginDate(date) {
  const two = (n) => String(n).padStart(2, "0");
  return `${DAYS[date.getDay()]} ${MONTHS[date.getMonth()]} ${two(date.getDate())} ${two(date.getHours())}:${two(date.getMinutes())}:${two(date.getSeconds())}`;
}

export default function SleepScreen({ since }) {
  return (
    <>
      <div className="term-line dim">Last login: {loginDate(since)} on console</div>
      <div className="term-line">
        {SLEEP_PROMPT} <span className="term-cursor" aria-hidden="true" />
      </div>
    </>
  );
}
