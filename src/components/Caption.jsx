import { mediaCount, mediaTitle, toAscii } from "./format.js";
import { useT } from "../i18n.js";

/*
 * Caption.jsx — LA LÉGENDE (sous la scène)
 * À gauche : nom du fichier joué (rien avant la première touche).
 * À droite, toujours en gris : sa position ("3/27") ou le nombre de médias ("27 médias").
 */
export default function Caption({ year, log }) {
  const t = useT();
  const last = log[log.length - 1];
  const media = last && last.type === "media" ? last.items : [];
  const total = year.items.length;

  const positions = media
    .map((item) => year.items.indexOf(item))
    .filter((index) => index >= 0)
    .map((index) => index + 1);

  return (
    <div className="caption">
      <span>{media.length > 0 && <span className="term-highlight">{media.map(mediaTitle).join(" + ")}</span>}</span>
      <span className="dim">{positions.length ? `${positions.join(" + ")}/${total}` : toAscii(mediaCount(total, t))}</span>
    </div>
  );
}
