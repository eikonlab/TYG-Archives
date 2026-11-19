/*
 * extraits-auto.mjs — REFAIT LES LISTES DE SONS DU SAMPLER (npm run extraits)
 * ------------------------------------------------------------
 * Chaque année prend ses sons dans SON dossier du disque : all-years/<année>/AUDIO
 * (all-years/0000/AUDIO pour « sans-date »). Pour chaque année, src/audio/extraits/<année>.txt
 * reçoit 76 passages (une touche = un passage de 10 s) :
 *   - les lignes déjà correctes (fichier présent dans <année>/AUDIO, moment dans le fichier)
 *     sont gardées telles quelles : un son choisi à la main n'est pas écrasé ;
 *   - les autres sont remplacées par des passages pris dans les .wav / .flac de l'année,
 *     répartis sur tous les fichiers et à des moments différents.
 * Année sans .wav / .flac dans son dossier AUDIO : fichier vidé, touches muettes.
 * Lancé tout seul par `npm run dev` (au démarrage et à chaque son ajouté ou supprimé,
 * voir vite.config.js) ; `npm run extraits` le lance à la main.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../src/audio/originaux", import.meta.url));
const LISTS = fileURLToPath(new URL("../src/audio/extraits", import.meta.url));
const KEYS = 76;
const CLIP = 10; // secondes jouées par passage (voir synth.js)


// Durée en secondes d'un .wav (en-tête RIFF) ou d'un .flac (bloc STREAMINFO). null si illisible.
function duration(file) {
  try {
    const fd = fs.openSync(file, "r");
    const head = Buffer.alloc(1024 * 1024);
    const length = fs.readSync(fd, head, 0, head.length, 0);
    const size = fs.fstatSync(fd).size;
    fs.closeSync(fd);
    const data = head.subarray(0, length);

    if (data.toString("latin1", 0, 4) === "RIFF") {
      let at = 12;
      let bytesPerSecond = 0;
      while (at + 8 <= data.length) {
        const id = data.toString("latin1", at, at + 4);
        const chunk = data.readUInt32LE(at + 4);
        if (id === "fmt ") bytesPerSecond = data.readUInt32LE(at + 16);
        if (id === "data" && bytesPerSecond) return Math.min(chunk, size - at - 8) / bytesPerSecond;
        at += 8 + chunk + (chunk & 1);
      }
      return null;
    }
    if (data.toString("latin1", 0, 4) === "fLaC") {
      // STREAMINFO : 20 bits de fréquence, puis 36 bits de nombre d'échantillons.
      const info = data.subarray(8);
      const rate = (info[10] << 12) | (info[11] << 4) | (info[12] >> 4);
      const samples = (info[13] & 0x0f) * 2 ** 32 + info.readUInt32BE(14);
      return rate && samples ? samples / rate : null;
    }
  } catch {}
  return null;
}

// "8:16" ou "1:02:03" → secondes, et l'inverse.
const toSeconds = (text) => text.split(":").reduce((total, part) => total * 60 + Number(part), 0);
const toTime = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

// Refait les listes. Ne réécrit un fichier que s'il change (sinon Vite rechargerait la page pour rien).
// Retourne le compte rendu, une ligne par année ; null si le disque n'est pas branché.
export function buildExtraits() {
if (!fs.existsSync(ROOT)) return null;
const report = [];
for (const folder of fs.readdirSync(ROOT).filter((name) => /^\d{4}$/.test(name)).sort()) {
  const listName = folder === "0000" ? "sans-date" : folder;
  const audioDir = path.join(ROOT, folder, "AUDIO");
  const sounds = fs.existsSync(audioDir)
    ? fs.readdirSync(audioDir)
        .filter((name) => !name.startsWith(".") && /\.(wav|flac)$/i.test(name))
        .sort()
        .map((name) => ({ name, length: duration(path.join(audioDir, name)) }))
        .filter((sound) => sound.length > CLIP + 1)
    : [];
  const lengths = new Map(sounds.map((sound) => [sound.name, sound.length]));

  // Lignes existantes encore valables.
  const listFile = path.join(LISTS, `${listName}.txt`);
  const kept = new Map();
  if (fs.existsSync(listFile)) {
    for (const line of fs.readFileSync(listFile, "utf8").split("\n")) {
      const [number, file, time] = line.split("|").map((part) => part.trim());
      if (!number || !file || !time) continue;
      const [year, sub, ...rest] = file.split("/");
      const name = rest.join("/");
      if (year === folder && sub === "AUDIO" && lengths.has(name) && toSeconds(time) + CLIP <= lengths.get(name)) {
        kept.set(Number(number), `${number} | ${file} | ${time}`);
      }
    }
  }

  const lines = [];
  if (sounds.length) {
    let filled = 0;
    for (let key = 1; key <= KEYS; key++) {
      if (kept.has(key)) {
        lines.push(kept.get(key));
        continue;
      }
      // Fichiers pris à tour de rôle ; moment qui avance dans le fichier à chaque passage.
      const sound = sounds[filled % sounds.length];
      const round = Math.floor(filled / sounds.length);
      const usable = sound.length - CLIP;
      const start = (usable * ((0.2 + round * 0.618) % 1)) | 0;
      lines.push(`${String(key).padStart(2, "0")} | ${folder}/AUDIO/${sound.name} | ${toTime(start)}`);
      filled++;
    }
    report.push(`${listName} : ${sounds.length} sons, ${kept.size} passages gardés, ${KEYS - kept.size} refaits`);
  } else {
    report.push(`${listName} : aucun .wav / .flac dans ${folder}/AUDIO → muet`);
  }
  const text = lines.length ? lines.join("\n") + "\n" : "";
  const before = fs.existsSync(listFile) ? fs.readFileSync(listFile, "utf8") : null;
  if (text !== before) fs.writeFileSync(listFile, text);
}
return report;
}

// Lancé à la main : npm run extraits
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const report = buildExtraits();
  if (!report) {
    console.error(`Disque introuvable (${ROOT}) : branche TYG-eikon puis relance.`);
    process.exit(1);
  }
  console.log(report.join("\n"));
}
