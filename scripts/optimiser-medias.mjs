// optimiser-medias.mjs — COPIES LÉGÈRES DES PHOTOS ET VIDÉOS (pour un chargement rapide)
// ------------------------------------------------------------
// Lancer (dans v3/) :
//   npm run medias            → photos seulement (quelques minutes)
//   npm run medias:videos     → photos + vidéos (long : une à plusieurs heures la 1re fois)
//
// Les originaux de src/img/ ne sont JAMAIS modifiés. Les copies vont dans src/img-web/,
// au même chemin, avec une extension en plus :
//   src/img/1985/PHOTO/a.jpg  →  src/img-web/1985/PHOTO/a.jpg.webp        (1600 px max, WebP)
//                             →  src/img-web/1985/PHOTO/a.jpg.thumb.webp  (vignette 240 px)
//   src/img/1998/clip.mov     →  src/img-web/1998/clip.mov.mp4            (H.264 720p, démarrage rapide)
//                             →  src/img-web/1998/clip.mov.thumb.webp     (vignette 240 px)
// Le site prend la copie légère quand elle existe, sinon l'original (voir vite.config.js).
// Relancer le script ne refait que les fichiers nouveaux ou modifiés depuis.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const run = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const IMG_DIR = path.join(ROOT, "src/img");
const WEB_DIR = path.join(ROOT, "src/img-web");

// Réglages
const IMAGE_MAX = 1600;   // côté le plus long des images (px)
const IMAGE_QUALITY = 80; // qualité WebP (0-100)
const THUMB_MAX = 240;    // côté le plus long des vignettes (px)
const THUMB_QUALITY = 70;
const VIDEO_PRESET = "Preset1280x720"; // secours sans ffmpeg : avconvert (macOS), ~10 Mb/s, lourd

// Avec ffmpeg (brew install ffmpeg) : H.264 720p max (jamais agrandi), qualité constante
// CRF 26 (~1,5-3 Mb/s, 4 à 5 fois plus léger qu'avconvert), désentrelacement des vieilles
// vidéos, son AAC 128k, « faststart » pour que la lecture démarre avant la fin du téléchargement.
const VIDEO_CRF = "26";
const FFMPEG_ARGS = [
  "-vf", "yadif=deint=interlaced,scale='if(gt(iw/ih,16/9),min(1280,iw),-2)':'if(gt(iw/ih,16/9),-2,min(720,ih))'",
  "-c:v", "libx264", "-preset", "slow", "-crf", VIDEO_CRF, "-pix_fmt", "yuv420p",
  "-c:a", "aac", "-b:a", "128k", "-ac", "2",
  "-movflags", "+faststart", "-f", "mp4",
];
let HAS_FFMPEG = false;
try {
  await run("ffmpeg", ["-version"]);
  HAS_FFMPEG = true;
} catch {}

const IMAGE_EXT = ["jpg", "jpeg", "png", "gif", "webp"];
const VIDEO_EXT = ["mp4", "mov", "m4v"];
const withVideos = process.argv.includes("--videos");

function listFiles(dir, prefix = "") {
  const files = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const relative = prefix + entry.name;
    if (entry.isDirectory()) files.push(...listFiles(path.join(dir, entry.name), relative + "/"));
    else files.push(relative);
  }
  return files;
}

const extOf = (file) => file.split(".").pop().toLowerCase();

// La copie est à jour si elle existe et est plus récente que l'original.
function upToDate(source, target) {
  try {
    return fs.statSync(target).mtimeMs >= fs.statSync(source).mtimeMs;
  } catch {
    return false;
  }
}

// Écrit dans un fichier temporaire puis renomme : jamais de copie à moitié écrite.
async function writeAtomic(target, write) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = target + ".part" + path.extname(target);
  try {
    await write(temp);
    fs.renameSync(temp, target);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

const resize = (max) => ({ width: max, height: max, fit: "inside", withoutEnlargement: true });

async function convertImage(relative) {
  const source = path.join(IMG_DIR, relative);
  const full = path.join(WEB_DIR, relative + ".webp");
  const thumb = path.join(WEB_DIR, relative + ".thumb.webp");
  if (upToDate(source, full) && upToDate(source, thumb)) return "skip";

  // rotate() : applique l'orientation EXIF (photos de téléphone tournées).
  const image = sharp(source, { failOn: "none" }).rotate();
  await writeAtomic(full, (temp) =>
    image.clone().resize(resize(IMAGE_MAX)).webp({ quality: IMAGE_QUALITY }).toFile(temp)
  );
  await writeAtomic(thumb, (temp) =>
    image.clone().resize(resize(THUMB_MAX)).webp({ quality: THUMB_QUALITY }).toFile(temp)
  );
  return "ok";
}

async function convertVideo(relative) {
  const source = path.join(IMG_DIR, relative);
  const video = path.join(WEB_DIR, relative + ".mp4");
  const thumb = path.join(WEB_DIR, relative + ".thumb.webp");
  let done = "skip";

  if (!upToDate(source, thumb)) {
    // Vignette : image d'aperçu fabriquée par Quick Look (qlmanage), puis convertie en WebP.
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "thumb-"));
    try {
      await run("qlmanage", ["-t", "-s", "480", "-o", tmpDir, source], { timeout: 60_000 });
      const png = fs.readdirSync(tmpDir).find((name) => name.endsWith(".png"));
      if (png) {
        await writeAtomic(thumb, (temp) =>
          sharp(path.join(tmpDir, png)).resize(resize(THUMB_MAX)).webp({ quality: THUMB_QUALITY }).toFile(temp)
        );
        done = "ok";
      }
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }

  if (withVideos && !upToDate(source, video)) {
    await writeAtomic(video, (temp) =>
      HAS_FFMPEG
        ? run("ffmpeg", ["-y", "-v", "error", "-i", source, ...FFMPEG_ARGS, temp], { maxBuffer: 16 * 1024 * 1024 })
        : run("avconvert", ["--source", source, "--preset", VIDEO_PRESET, "--output", temp, "--replace"], {
            maxBuffer: 16 * 1024 * 1024,
          })
    );
    done = "ok";
  }
  return done;
}

async function main() {
  const files = listFiles(IMG_DIR);
  const images = files.filter((f) => IMAGE_EXT.includes(extOf(f)));
  const videos = files.filter((f) => VIDEO_EXT.includes(extOf(f)));
  const stats = { ok: 0, skip: 0, error: 0 };

  async function pool(list, workers, convert, label) {
    let next = 0;
    let finished = 0;
    async function worker() {
      while (next < list.length) {
        const file = list[next++];
        try {
          stats[await convert(file)]++;
        } catch (error) {
          stats.error++;
          console.log(`\n  ! ${file} : ${String(error.message || error).split("\n")[0]}`);
        }
        finished++;
        process.stdout.write(`\r  ${label} : ${finished}/${list.length}   `);
      }
    }
    await Promise.all(Array.from({ length: workers }, worker));
    process.stdout.write("\n");
  }

  console.log(`\n  ${images.length} photos, ${videos.length} vidéos → ${path.relative(ROOT, WEB_DIR)}/`);
  await pool(images, Math.max(2, os.cpus().length - 2), convertImage, "photos");
  if (withVideos) console.log(`  vidéos encodées avec ${HAS_FFMPEG ? "ffmpeg (léger)" : "avconvert (lourd : installer ffmpeg)"}`);
  // Vidéos une par une : l'encodeur utilise déjà tout le processeur.
  await pool(videos, 1, convertVideo, withVideos ? "vidéos" : "vignettes des vidéos");
  if (!withVideos) console.log("  (vidéos non converties : lancer « npm run medias:videos »)");
  console.log(`  ${stats.ok} faits, ${stats.skip} déjà à jour, ${stats.error} en erreur\n`);
}

main();
