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

// Lien src/audio/originaux → « 02 AUDIO » : les enregistrements où le sampler prend ses sons.
const AUDIO_DIR = fileURLToPath(new URL("src/audio/originaux", import.meta.url));

// v4 : src/img et src/audio/originaux ne sont PAS dans le projet, ce sont des liens
// symboliques vers le disque externe (voir README.md, « Médias sur le disque externe ») :
//   src/img             → TYG-ARCHIVE/00 TYG ARCHIVES by year
//   src/audio/originaux → TYG-ARCHIVE/02 AUDIO
// Disque débranché : le site démarre quand même, sans images ni sons du sampler.
const DISK_MEDIA = "/Volumes/TYG-ARCHIVE";
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
    // Fichiers cachés, et dossiers techniques du NAS Synology (@eaDir : ses vignettes, #recycle).
    if (entry.name.startsWith(".") || entry.name.startsWith("@") || entry.name.startsWith("#")) continue;
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

// Sert les fichiers du disque externe (src/img, src/img-web, src/audio/originaux).
// Vite le fait mal pour les noms avec « ? », « & » ou « + » (il renvoie la page du site
// à la place) : on les sert donc nous-mêmes, morceau par morceau si le navigateur le demande
// (en-tête Range : vidéos, et passages de 10 s du sampler dans les longs enregistrements).
const CONTENT_TYPES = {
  jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", gif: "image/gif", webp: "image/webp",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime",
  wav: "audio/wav", flac: "audio/flac", mp3: "audio/mpeg", m4a: "audio/mp4", aif: "audio/aiff", aiff: "audio/aiff",
};
function diskFiles(base) {
  const roots = { "src/img/": IMG_DIR, "src/img-web/": WEB_DIR, "src/audio/originaux/": AUDIO_DIR };
  return (req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();
    let pathname = req.url.split("?")[0]; // les « ? » des noms arrivent encodés (%3F)
    if (pathname.startsWith(base)) pathname = pathname.slice(base.length);
    else if (pathname.startsWith("/")) pathname = pathname.slice(1);
    const prefix = Object.keys(roots).find((p) => pathname.startsWith(p));
    if (!prefix) return next();

    let file;
    try {
      const parts = pathname.slice(prefix.length).split("/").map(decodeURIComponent);
      if (parts.some((part) => part === ".." || part === "")) throw new Error("chemin invalide");
      file = path.join(roots[prefix], ...parts);
    } catch {
      res.statusCode = 400;
      return res.end();
    }
    let stat;
    try {
      stat = fs.statSync(file);
      if (!stat.isFile()) throw new Error("pas un fichier");
    } catch {
      res.statusCode = 404;
      return res.end("Introuvable");
    }

    const type = CONTENT_TYPES[file.split(".").pop().toLowerCase()] || "application/octet-stream";
    res.setHeader("Content-Type", type);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Last-Modified", stat.mtime.toUTCString());

    let start = 0;
    let end = stat.size - 1;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || "");
    if (range && (range[1] || range[2])) {
      if (range[1]) {
        start = Number(range[1]);
        if (range[2]) end = Math.min(end, Number(range[2]));
      } else {
        start = Math.max(0, stat.size - Number(range[2])); // « bytes=-500 » : les 500 derniers octets
      }
      if (start > end) {
        res.statusCode = 416;
        res.setHeader("Content-Range", `bytes */${stat.size}`);
        return res.end();
      }
      res.statusCode = 206;
      res.setHeader("Content-Range", `bytes ${start}-${end}/${stat.size}`);
    } else {
      res.statusCode = 200;
    }
    res.setHeader("Content-Length", end - start + 1);
    if (req.method === "HEAD") return res.end();
    const stream = fs.createReadStream(file, { start, end });
    stream.on("error", () => res.destroy());
    req.on("close", () => stream.destroy());
    stream.pipe(res);
  };
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
      server.middlewares.use(diskFiles(server.config.base));
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
      // L'archive pèse ~1,7 To : rien n'est copié sur le Mac. dist/media et dist/audio sont
      // des liens vers le disque externe. Pour mettre le site en ligne, envoyer dist/ en
      // suivant les liens (ex. rsync -L) pour que les vrais fichiers partent.
      const links = { media: IMG_DIR, audio: AUDIO_DIR };
      if (fs.existsSync(WEB_DIR)) links["media-web"] = WEB_DIR;
      for (const [name, source] of Object.entries(links)) {
        const target = path.join(outDir, name);
        if (fs.existsSync(target) && process.platform === "darwin") execFileSync("chflags", ["-R", "nouchg", target]);
        fs.rmSync(target, { recursive: true, force: true });
        if (fs.existsSync(source)) fs.symlinkSync(fs.realpathSync(source), target);
      }
      console.log(`  dist/media et dist/audio : liens vers le disque externe (${DISK_MEDIA})`);
    },
  };
}

const STANDALONE = !process.env.PREZ_BUILD && !process.env.VITE_MEDIA_URL;

export default defineConfig(({ command }) => {
  const standaloneBuild = command === "build" && STANDALONE;
  return {
    plugins: [react(), archiveFiles(), ...(standaloneBuild ? [copyMedia()] : [])],
    // Photos, vidéos et sons sont servis depuis leur vrai emplacement,
    // sur le disque externe : Vite doit avoir le droit d'y lire.
    server: { fs: { allow: [PROJECT_DIR, DISK_MEDIA] } },
    ...(standaloneBuild && {
      base: "./", // chemins relatifs : dist/ marche à la racine d'un site ou dans un sous-dossier
      define: {
        "import.meta.env.VITE_MEDIA_URL": JSON.stringify("./media/"),
        "import.meta.env.VITE_MEDIA_WEB_URL": JSON.stringify("./media-web/"),
        "import.meta.env.VITE_AUDIO_URL": JSON.stringify("./audio/"),
      },
    }),
  };
});
