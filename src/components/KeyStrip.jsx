import { FIRST_MIDI_NOTE, KEYBOARD_BASE_NOTE, KEY_COUNT, KEY_NAMES, MIDI_KEY_COUNT, NOTE_NAMES } from "../constants.js";
import { itemForKey } from "../state/archivesReducer.js";

/*
 * KeyStrip.jsx — LA BANDE DES TOUCHES (en bas)
 * Une case par touche disponible : 17 au clavier d'ordinateur,
 * MIDI_KEY_COUNT quand un clavier MIDI est branché. Une touche déjà jouée garde sa vignette ;
 * une touche tenue est entourée en jaune. On peut aussi jouer à la souris.
 * Une touche dont l'extrait sonne s'allume (classe is-sounding) avec sa barre
 * de lecture en bas : c'est SamplerHud.jsx qui les met à jour à chaque image
 * (repérées par data-note).
 */

function Thumbnail({ item }) {
  // Vignette légère (240 px, WebP) quand elle existe : pour les images comme pour les vidéos.
  if (item.thumb) {
    return (
      <img
        className="key-thumb"
        src={item.thumb}
        alt=""
        decoding="async"
        onError={(event) => (event.currentTarget.style.visibility = "hidden")}
      />
    );
  }
  if (item.kind === "video") {
    return <video className="key-thumb" src={`${item.src}#t=0.1`} preload="metadata" muted playsInline />;
  }
  // Fichier retiré ou abîmé : la vignette est masquée (pas d'icône d'image cassée).
  return (
    <img
      className="key-thumb"
      src={item.src}
      alt=""
      loading="lazy"
      onError={(event) => (event.currentTarget.style.visibility = "hidden")}
    />
  );
}

// Note de la touche : 0 = do, 1 = do#, … 11 = si.
function noteOf(key) {
  return (FIRST_MIDI_NOTE + key) % 12;
}

// Nom affiché sous la case : la lettre du clavier d'ordinateur,
// ou en MIDI le nom des do seulement ("C2", "C3"…) car les cases sont étroites.
function keyLabel(key, isMidi) {
  if (!isMidi) return KEY_NAMES[key];
  const midiNote = FIRST_MIDI_NOTE + key;
  return noteOf(key) === 0 ? `${NOTE_NAMES[0]}${Math.floor(midiNote / 12) - 1}` : "";
}

// Note MIDI jouée par la touche (même calcul que useKeyboard / useMidi).
export function noteForKey(key, isMidi) {
  return (isMidi ? FIRST_MIDI_NOTE : KEYBOARD_BASE_NOTE) + key;
}

export default function KeyStrip({ year, keyOffset, pressedKeys, playedKeys, isMidi, onKeyDown }) {
  const keyCount = isMidi ? MIDI_KEY_COUNT : KEY_COUNT;
  const keys = Array.from({ length: keyCount }, (_, key) => key);

  return (
    <div
      className={`keystrip${isMidi ? " is-midi" : ""}`}
      style={{ gridTemplateColumns: `repeat(${keyCount}, minmax(0, 1fr))` }}
    >
      {keys.map((key) => {
        const name = keyLabel(key, isMidi);
        const item = itemForKey(year, key, keyOffset);
        const classes = ["key"];
        if (NOTE_NAMES[noteOf(key)].includes("#")) classes.push("is-black");
        if (pressedKeys.has(key)) classes.push("is-pressed");
        if (!item) classes.push("is-empty");

        return (
          <button
            type="button"
            key={key}
            className={classes.join(" ")}
            data-note={noteForKey(key, isMidi)}
            onPointerDown={(event) => {
              event.preventDefault();
              onKeyDown(key);
            }}
            tabIndex={-1}
          >
            {item && playedKeys.has(key) && <Thumbnail item={item} />}
            {name && <span className="key-name">{name}</span>}
            <span className="key-clip" />
            <span className="key-progress" />
          </button>
        );
      })}
    </div>
  );
}
