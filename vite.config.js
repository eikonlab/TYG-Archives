import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Chemin calculé depuis ce fichier (et non depuis le dossier courant) :
// le serveur commun (../serveur.mjs) lance v1 et v2 depuis le dossier prez/.
const IMG_DIR = fileURLToPath(new URL("src/img", import.meta.url));
// Copies légères (WebP, vidéos 720p, vignettes) faites par scripts/optimiser-medias.mjs.
const WEB_DIR = fileURLToPath(new URL("src/img-web", import.meta.url));
const PROJECT_DIR = fileURLToPath(new URL(".", import.meta.url));

// v4 : src/img, src/img-web et src/audio/tyg ne sont PAS dans le projet, ce sont des
// liens symboliques vers le disque externe (voir README.md, « Médias sur le disque externe »).
// Disque débranché : le site démarre quand même, sans images ni sons du sampler.
const DISK_MEDIA = "/Volumes/TYG-ARCHIVE/site-media";
function diskReady() {
  if (fs.existsSync(IMG_DIR)) return true;
  console.warn(`\n  ⚠ Disque externe introuvable (${DISK_MEDIA}) : branche TYG-ARCHIVE puis relance.\n`);
  return false;
}

// La copie légère existe-t-elle, et est-elle à jour (plus récente que l'original) ?
function hasFreshCopy(sourceMtime, relative) {
  try {
    return fs.statSync(path.join(WEB_DIR, relative)).mtimeMs >= sourceMtime;
  } catch {
    return false;
  }
}
const MEDIA_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "m4v"];

// Lit les 12 premiers octets du fichier pour vérifier que c'est bien
// une image ou une vidéo (et pas un fichier vide, abîmé ou mal nommé).
function hasMediaHeader(file) {
  try {
    const buffer = Buffer.alloc(12);
    const fd = fs.openSync(file, "r");
    const length = fs.readSync(fd, buffer, 0, 12, 0);
    fs.closeSync(fd);
    if (length < 12) return false;

    const text = buffer.toString("latin1");
    if (buffer[0] === 0xff && buffer[1] === 0xd8) return true;                 // JPEG
    if (text.startsWith("\x89PNG")) return true;                                // PNG
    if (text.startsWith("GIF8")) return true;                                   // GIF
    if (text.startsWith("RIFF") && text.slice(8, 12) === "WEBP") return true;   // WEBP
    return ["ftyp", "moov", "mdat", "wide", "free", "skip", "pnot"].includes(text.slice(4, 8)); // MP4 / MOV
  } catch {
    return false;
  }
}

// Liste (récursivement) les photos et vidéos de src/img.
// Retourne { path, mtime, web, thumb } : chemin relatif (ex. "1985/PHOTO/ludande1.jpg")
// et date de dernière modification du fichier.
function listMediaFiles(dir, prefix = "") {
  const files = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const relative = prefix + entry.name;
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...listMediaFiles(full, relative + "/"));
    } else if (
      MEDIA_EXTENSIONS.includes(entry.name.split(".").pop().toLowerCase()) &&
      hasMediaHeader(full)
    ) {
      const mtime = fs.statSync(full).mtimeMs;
      const isVideo = ["mp4", "mov", "m4v"].includes(entry.name.split(".").pop().toLowerCase());
      files.push({
        path: relative,
        mtime: Math.round(mtime),
        // Copies légères disponibles (voir scripts/optimiser-medias.mjs) :
        web: hasFreshCopy(mtime, relative + (isVideo ? ".mp4" : ".webp")),
        thumb: hasFreshCopy(mtime, relative + ".thumb.webp"),
      });
    }
  }

  return files;
}

// Petit plugin : `import FILES from "virtual:archive-files"` donne la liste
// des fichiers de src/img. Contrairement à import.meta.glob, aucun fichier
// n'est importé, donc les noms bizarres ("?", "#", guillemets…) ne posent pas problème.
// La liste est relue à chaque rechargement de la page.
function archiveFiles() {
  const id = "virtual:archive-files";
  const resolvedId = "\0" + id;

  return {
    name: "archive-files",
    resolveId: (source) => (source === id ? resolvedId : null),
    load(loadedId) {
      if (loadedId !== resolvedId) return null;
      return `export default ${JSON.stringify(diskReady() ? listMediaFiles(IMG_DIR) : [])};`;
    },
    configureServer(server) {
      // Un fichier ajouté ou supprimé dans src/img : on refait la liste.
      const refresh = (file) => {
        if (!file.startsWith(IMG_DIR) && !file.startsWith(WEB_DIR)) return;
        const module = server.moduleGraph.getModuleById(resolvedId);
        if (module) server.moduleGraph.invalidateModule(module);
      };
      server.watcher.on("add", refresh);
      server.watcher.on("unlink", refresh);
    },
  };
}

// `npm run build` lancé ici (dans v2/) : copie les photos et vidéos dans dist/media/
// pour que v2/dist/ soit complet tout seul. Copies « clonées » (APFS) : instantanées
// et sans place en plus. Le build commun (../build.mjs, PREZ_BUILD=1) s'en occupe
// lui-même dans prez/dist/media/, donc on ne copie rien dans ce cas.
function copyMedia() {
  let outDir;
  return {
    name: "copy-media",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (!diskReady()) return;
      const media = path.join(outDir, "media");
      // Seuls les originaux SANS copie légère sont copiés : le site n'utilise
      // jamais l'original quand la copie WebP / MP4 existe (voir data/years.js).
      const files = listMediaFiles(IMG_DIR).filter((file) => !file.web);
      // Ancien dist/media (copies parfois verrouillées) : on déverrouille puis on vide.
      if (fs.existsSync(media) && process.platform === "darwin") execFileSync("chflags", ["-R", "nouchg", media]);
      fs.rmSync(media, { recursive: true, force: true });
      fs.mkdirSync(media, { recursive: true, mode: 0o755 });
      for (const { path: relative } of files) {
        const target = path.join(media, relative);
        fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o755 });
        const source = path.join(IMG_DIR, relative);
        // Les originaux sont sur le disque externe (exFAT) : pas de clone possible, copie normale.
        fs.copyFileSync(source, target);
      }
      // Les originaux sont parfois verrouillés (Finder / Dropbox) : on enlève le verrou des copies.
      if (process.platform === "darwin") execFileSync("chflags", ["-R", "nouchg", media]);
      for (const { path: relative } of files) fs.chmodSync(path.join(media, relative), 0o644);
      // Copies légères → dist/media-web/ : un lien vers le disque externe (16 Go qu'on
      // ne recopie pas sur le Mac). Pour mettre le site en ligne, envoyer dist/ en
      // suivant les liens (ex. rsync -L) pour que les vrais fichiers partent.
      if (fs.existsSync(WEB_DIR)) {
        const web = path.join(outDir, "media-web");
        fs.rmSync(web, { recursive: true, force: true });
        fs.symlinkSync(fs.realpathSync(WEB_DIR), web);
      }
      console.log(`  ${files.length} originaux sans copie légère copiés dans ${path.relative(process.cwd(), media)}/`);
    },
  };
}

const STANDALONE = !process.env.PREZ_BUILD && !process.env.VITE_MEDIA_URL;

export default defineConfig(({ command }) => {
  const standaloneBuild = command === "build" && STANDALONE;
  return {
    plugins: [react(), archiveFiles(), ...(standaloneBuild ? [copyMedia()] : [])],
    // Les sons du sampler (src/audio/tyg) sont servis depuis leur vrai emplacement,
    // sur le disque externe : Vite doit avoir le droit d'y lire.
    server: { fs: { allow: [PROJECT_DIR, DISK_MEDIA] } },
    ...(standaloneBuild && {
      base: "./", // chemins relatifs : dist/ marche à la racine d'un site ou dans un sous-dossier
      define: {
        "import.meta.env.VITE_MEDIA_URL": JSON.stringify("./media/"),
        "import.meta.env.VITE_MEDIA_WEB_URL": JSON.stringify("./media-web/"),
      },
    }),
  };
});
