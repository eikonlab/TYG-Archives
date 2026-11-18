/*
 * TopBar.jsx — LA LIGNE DU HAUT
 * À droite : statut MIDI (toujours affiché ; Échap le masque).
 */
import { toAscii } from "./format.js";
import { useT } from "../i18n.js";

export default function TopBar({ midi }) {
  const t = useT();
  return (
    <header className="topbar">
      <div className="topbar-right">
        <span className={midi.connected ? "accent" : "dim"}>{toAscii(t(midi.status, midi.params))}</span>
      </div>
    </header>
  );
}
