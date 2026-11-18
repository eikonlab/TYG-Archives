import { YEARS } from "../data/years.js";
import { toAscii } from "./format.js";

/*
 * Timeline.jsx — LA FRISE DES ANNÉES (colonne de droite)
 * Un trait par année : long si l'année contient des médias, court sinon.
 * L'année choisie est écrite en jaune. Cliquer sur un trait y va directement.
 * L'année choisie reste toujours au milieu de la colonne : c'est la frise
 * qui glisse vers le haut ou le bas (le repère, lui, ne bouge pas).
 */
export default function Timeline({ selectedYear, wheelValue, onSelect, onStep }) {
  return (
    <nav className="timeline" aria-label="Années">
      <button
        type="button"
        className={`timeline-arrow${wheelValue > 0.15 ? " accent" : ""}`}
        onClick={() => onStep(-1)}
        aria-label="Année précédente"
      >
      
      </button>

      <div className="timeline-window" style={{ "--count": YEARS.length }}>
      <ol className="timeline-years" style={{ "--selected": selectedYear }}>
        {YEARS.map((year, index) => {
          const isSelected = index === selectedYear;
          const hasMedia = year.items.length > 0;

          return (
            <li key={year.name}>
              <button
                type="button"
                className={`timeline-year${hasMedia ? " has-media" : ""}${isSelected ? " is-selected" : ""}`}
                onClick={() => onSelect(index)}
                title={toAscii(`${year.name} - ${year.items.length}`)}
              >
                <span className="timeline-label">{year.name === "sans-date" ? "s.d." : toAscii(year.name)}</span>
                <span className="timeline-tick" />
              </button>
            </li>
          );
        })}
      </ol>
      </div>

      <button
        type="button"
        className={`timeline-arrow${wheelValue < -0.15 ? " accent" : ""}`}
        onClick={() => onStep(1)}
        aria-label="Année suivante"
      >

      </button>
    </nav>
  );
}
