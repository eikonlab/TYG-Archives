/*
 * decoupe.js — DÉCOUPE UN PASSAGE DANS UN ENREGISTREMENT (.wav ou .flac)
 * ------------------------------------------------------------
 * Rôle : cutClip(ac, url, début, durée) → AudioBuffer de `durée` secondes pris à
 *        `début` secondes dans le fichier, SANS télécharger le fichier entier
 *        (les enregistrements du disque font parfois plusieurs centaines de Mo).
 * Utilisé par : synth.js.
 *
 * On demande au serveur seulement les octets utiles (en-tête HTTP « Range ») :
 *   - WAV (PCM) : la position se calcule exactement (octets par seconde fixes).
 *     On recolle un petit en-tête WAV devant le morceau.
 *   - FLAC : le son est compressé en « trames ». On vise à peu près la bonne position
 *     (table de positions du fichier si elle existe, sinon proportionnellement),
 *     puis on lit le numéro de la première trame reçue pour savoir exactement où l'on
 *     est, et on corrige si besoin. On recolle l'en-tête FLAC devant les trames.
 * Le navigateur décode ensuite ce petit fichier reconstitué (decodeAudioData).
 */

const HEAD_BYTES = 64 * 1024; // premier morceau lu pour connaître le format du fichier
const headers = new Map(); // url → promesse des infos du fichier (lues une seule fois)

// Télécharge les octets [start, end[ du fichier. Retourne { bytes, size } (size = taille du fichier).
async function fetchRange(url, start, end) {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end - 1}` } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = new Uint8Array(await response.arrayBuffer());
  if (response.status === 200) return { bytes: data.subarray(start, end), size: data.length }; // serveur sans Range
  const size = Number((response.headers.get("content-range") || "").split("/")[1]) || Infinity;
  return { bytes: data, size };
}

const text = (bytes, at, length) => String.fromCharCode(...bytes.subarray(at, at + length));

/* ---------- WAV ---------- */

async function wavInfo(url) {
  let length = HEAD_BYTES;
  for (;;) {
    const { bytes, size } = await fetchRange(url, 0, length);
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let fmt = null;
    let at = 12;
    while (at + 8 <= bytes.length) {
      const id = text(bytes, at, 4);
      const chunk = view.getUint32(at + 4, true);
      if (id === "fmt ") fmt = bytes.slice(at + 8, at + 8 + 16);
      if (id === "data") {
        if (!fmt) throw new Error("WAV sans format");
        const format = new DataView(fmt.buffer);
        return {
          kind: "wav",
          fmt,
          rate: format.getUint32(4, true),
          blockAlign: format.getUint16(12, true),
          dataStart: at + 8,
          dataEnd: Math.min(at + 8 + chunk, size),
        };
      }
      at += 8 + chunk + (chunk & 1);
    }
    if (length >= size || length > 8 * 1024 * 1024) throw new Error("WAV : données introuvables");
    length *= 4; // en-tête plus long que prévu (métadonnées) : on relit plus loin
  }
}

async function cutWav(ac, url, info, start, duration) {
  const first = info.dataStart + Math.floor(start * info.rate) * info.blockAlign;
  const last = Math.min(info.dataEnd, first + Math.round(duration * info.rate) * info.blockAlign);
  if (first >= last) throw new Error("passage après la fin du fichier");
  const { bytes } = await fetchRange(url, first, last);

  // Fichier WAV minimal : en-tête de 44 octets + le morceau.
  const file = new Uint8Array(44 + bytes.length);
  const view = new DataView(file.buffer);
  file.set([82, 73, 70, 70], 0); // "RIFF"
  view.setUint32(4, 36 + bytes.length, true);
  file.set([87, 65, 86, 69, 102, 109, 116, 32], 8); // "WAVEfmt "
  view.setUint32(16, 16, true);
  file.set(info.fmt.subarray(0, 16), 20);
  view.setUint16(20, 1, true); // PCM simple
  file.set([100, 97, 116, 97], 36); // "data"
  view.setUint32(40, bytes.length, true);
  file.set(bytes, 44);
  return ac.decodeAudioData(file.buffer);
}

/* ---------- FLAC ---------- */

async function flacInfo(url) {
  let length = HEAD_BYTES;
  for (;;) {
    const { bytes, size } = await fetchRange(url, 0, length);
    if (text(bytes, 0, 4) !== "fLaC") throw new Error("pas un fichier FLAC");
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let at = 4;
    let streamInfo = null;
    const seekPoints = [];
    let complete = false;
    while (at + 4 <= bytes.length) {
      const last = bytes[at] & 0x80;
      const type = bytes[at] & 0x7f;
      const blockLength = (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3];
      if (at + 4 + blockLength > bytes.length) break; // bloc coupé : relire plus loin
      if (type === 0) streamInfo = bytes.slice(at + 4, at + 4 + 34);
      if (type === 3) {
        for (let p = at + 4; p + 18 <= at + 4 + blockLength; p += 18) {
          const sample = Number(view.getBigUint64(p));
          if (sample === Number(0xffffffffffffffffn)) continue; // point vide
          seekPoints.push({ sample, offset: Number(view.getBigUint64(p + 8)) });
        }
      }
      at += 4 + blockLength;
      if (last) {
        complete = true;
        break;
      }
    }
    if (complete && streamInfo) {
      const s = streamInfo;
      const rate = (s[10] << 12) | (s[11] << 4) | (s[12] >> 4);
      const total = (s[13] & 0x0f) * 2 ** 32 + ((s[14] << 24) >>> 0) + (s[15] << 16) + (s[16] << 8) + s[17];
      return {
        kind: "flac",
        streamInfo,
        rate,
        blockSize: (s[2] << 8) | s[3], // taille des trames (fixe en général)
        maxFrame: ((s[7] << 16) | (s[8] << 8) | s[9]) || 64 * 1024,
        total,
        firstFrame: at,
        size,
        seekPoints,
      };
    }
    if (length >= size || length > 32 * 1024 * 1024) throw new Error("FLAC : en-tête illisible");
    length *= 4; // grosse pochette d'album dans l'en-tête : on relit plus loin
  }
}

function crc8(bytes, from, to) {
  let crc = 0;
  for (let i = from; i < to; i++) {
    crc ^= bytes[i];
    for (let bit = 0; bit < 8; bit++) crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
  }
  return crc;
}

// En-tête de trame FLAC à la position `at` ? → { variable, number } ou null.
function frameHeader(bytes, at) {
  if (bytes[at] !== 0xff || (bytes[at + 1] & 0xfe) !== 0xf8) return null;
  const variable = bytes[at + 1] & 1;
  const blockCode = bytes[at + 2] >> 4;
  const rateCode = bytes[at + 2] & 0x0f;
  const channels = bytes[at + 3] >> 4;
  const sizeCode = (bytes[at + 3] >> 1) & 7;
  if (blockCode === 0 || rateCode === 15 || channels > 10 || sizeCode === 3 || bytes[at + 3] & 1) return null;

  // Numéro de trame (ou d'échantillon), codé comme un caractère UTF-8 étendu.
  let p = at + 4;
  const lead = bytes[p++];
  let extra = 0;
  let number = lead;
  if (lead >= 0xfe) [extra, number] = [6, 0];
  else if (lead >= 0xfc) [extra, number] = [5, lead & 0x01];
  else if (lead >= 0xf8) [extra, number] = [4, lead & 0x03];
  else if (lead >= 0xf0) [extra, number] = [3, lead & 0x07];
  else if (lead >= 0xe0) [extra, number] = [2, lead & 0x0f];
  else if (lead >= 0xc0) [extra, number] = [1, lead & 0x1f];
  else if (lead >= 0x80) return null;
  for (let i = 0; i < extra; i++) {
    const next = bytes[p++];
    if ((next & 0xc0) !== 0x80) return null;
    number = number * 64 + (next & 0x3f);
  }
  if (blockCode === 6) p += 1;
  if (blockCode === 7) p += 2;
  if (rateCode === 12) p += 1;
  if (rateCode === 13 || rateCode === 14) p += 2;
  if (p >= bytes.length || crc8(bytes, at, p) !== bytes[p]) return null;
  return { variable, number };
}

// Toutes les trames sûres du morceau : [{ at, sample }, …]. Une trame n'est gardée
// que si sa voisine la confirme (numéros qui se suivent), pour écarter les faux en-têtes.
function findFrames(bytes, info) {
  const found = [];
  for (let at = 0; at + 16 < bytes.length; at++) {
    if (bytes[at] !== 0xff) continue;
    const header = frameHeader(bytes, at);
    if (!header) continue;
    found.push({ at, sample: header.variable ? header.number : header.number * info.blockSize });
  }
  const follows = (a, b) => b.sample > a.sample && b.sample - a.sample <= Math.max(info.blockSize, 65536);
  return found.filter(
    (frame, i) => (i > 0 && follows(found[i - 1], frame)) || (i + 1 < found.length && follows(frame, found[i + 1]))
  );
}

async function cutFlac(ac, url, info, start, duration) {
  const target = Math.floor(start * info.rate);
  const end = target + Math.round(duration * info.rate);
  if (info.total && target >= info.total) throw new Error("passage après la fin du fichier");
  const audioBytes = info.size - info.firstFrame;
  const perSample = info.total ? audioBytes / info.total : 4; // octets par échantillon (moyenne)

  // Première visée : point de la table juste avant le passage, sinon proportion.
  let from = info.firstFrame + Math.max(0, Math.floor((target - info.rate) * perSample));
  const before = info.seekPoints.filter((point) => point.sample <= target).pop();
  if (before) from = info.firstFrame + before.offset;
  let to = from + Math.ceil((end - target + info.rate) * perSample * 1.5) + 2 * info.maxFrame;

  for (let attempt = 0; attempt < 6; attempt++) {
    from = Math.max(info.firstFrame, from);
    to = Math.min(info.size, to);
    const { bytes } = await fetchRange(url, from, to);
    const frames = findFrames(bytes, info);
    if (frames.length < 2) throw new Error("FLAC : aucune trame lisible");
    const first = frames[0];
    const last = frames[frames.length - 1];
    if (first.sample > target && from > info.firstFrame) {
      from -= Math.ceil((first.sample - target + info.rate) * perSample * 1.5); // trop loin : on recule
      continue;
    }
    if (last.sample < end && to < info.size) {
      to += Math.ceil((end - last.sample + info.rate) * perSample * 1.5); // trop court : on prolonge
      continue;
    }

    // Petit fichier FLAC : "fLaC" + STREAMINFO (durée totale inconnue) + trames complètes.
    const cutEnd = to >= info.size ? bytes.length : last.at;
    const frameBytes = bytes.subarray(first.at, cutEnd);
    const file = new Uint8Array(4 + 4 + 34 + frameBytes.length);
    file.set([0x66, 0x4c, 0x61, 0x43, 0x80, 0, 0, 34], 0); // "fLaC" + dernier bloc, STREAMINFO, 34 octets
    const streamInfo = info.streamInfo.slice();
    streamInfo[13] &= 0xf0; // nombre total d'échantillons = inconnu
    streamInfo.fill(0, 14); // (et pas d'empreinte MD5)
    file.set(streamInfo, 8);
    file.set(frameBytes, 42);
    const decoded = await ac.decodeAudioData(file.buffer);

    // Le morceau décodé commence à `first.sample` : on garde seulement le passage voulu.
    // (decodeAudioData a pu changer la fréquence : on compte en secondes.)
    const offset = Math.round(((Math.max(target, first.sample) - first.sample) / info.rate) * decoded.sampleRate);
    const length = Math.min(decoded.length - offset, Math.round(duration * decoded.sampleRate));
    if (length <= 0) throw new Error("FLAC : passage vide");
    const clip = ac.createBuffer(decoded.numberOfChannels, length, decoded.sampleRate);
    for (let c = 0; c < decoded.numberOfChannels; c++) {
      clip.copyToChannel(decoded.getChannelData(c).subarray(offset, offset + length), c);
    }
    return clip;
  }
  throw new Error("FLAC : position introuvable");
}

/* ---------- Entrée ---------- */

export async function cutClip(ac, url, start, duration) {
  let info = headers.get(url);
  if (!info) {
    info = (/\.flac$/i.test(url) ? flacInfo(url) : wavInfo(url)).catch((error) => {
      headers.delete(url);
      throw error;
    });
    headers.set(url, info);
  }
  const header = await info;
  return header.kind === "flac"
    ? cutFlac(ac, url, header, start, duration)
    : cutWav(ac, url, header, start, duration);
}
