/**
 * Remove non-essential metadata from source image bytes before they are stored.
 *
 * `original` is the one object we store verbatim: `processCardImageJob`
 * puts the downloaded bytes straight into R2, and
 * `@riftseer/types/card-image` serves that key publicly and lists it in every
 * size's fallback ladder. The derived variants never carry metadata because
 * `IMAGES.transform()` re-encodes them, so `original` is the only way a
 * source's metadata reaches a reader.
 *
 * That was harmless while RiftCodex and Riot's gallery were the only sources —
 * their PNGs carry nothing. A third-party mirror does not: some ship an ICC
 * profile, and nothing stops one shipping EXIF with camera, location or
 * authoring fields.
 *
 * Only container-level metadata chunks are dropped; pixel data, dimensions and
 * alpha are untouched. That is lossless for what our sources actually ship —
 * every ICC profile seen so far is libwebp's own 456-byte sRGB, so removing it
 * changes nothing on screen — but it is not lossless in general. A source
 * shipping Display P3 would render oversaturated afterwards, because the
 * profile goes and the pixels do not get converted; a source carrying an EXIF
 * `Orientation` would render rotated. Both are accepted: the metadata we are
 * removing is the point, and a card scan carries neither. Convert rather than
 * strip if a source ever ships a wide-gamut profile.
 *
 * A format we do not understand passes through unchanged rather than being
 * corrupted by a guess, and a malformed one is returned as-is rather than
 * half-walked — every exit in here fails open.
 */

/** Chunks dropped per format, for the log line and the tests. */
export interface StripResult {
  bytes: Uint8Array;
  /** Chunk names removed, e.g. `["iCCP", "tEXt"]`. Empty when nothing matched. */
  removed: string[];
}

/**
 * PNG ancillary chunks that carry metadata rather than pixels.
 *
 * `iCCP` is included deliberately: `IMAGES.transform()` drops colour profiles
 * when it builds the variants, so keeping one on `original` alone would make
 * the full-size image render differently from every size below it.
 */
const PNG_METADATA_CHUNKS = new Set(["tEXt", "zTXt", "iTXt", "eXIf", "iCCP", "tIME"]);

/** RIFF chunks WebP uses for metadata. Same reasoning as the PNG set. */
const WEBP_METADATA_CHUNKS = new Set(["EXIF", "XMP ", "ICCP"]);

/**
 * VP8X feature bits that must be cleared alongside the chunk they describe, or
 * a decoder is told to expect a profile the file no longer contains.
 * Bit layout, MSB first: `Rsv Rsv ICC Alpha EXIF XMP Anim Rsv`.
 */
const VP8X_ICC = 0x20;
const VP8X_EXIF = 0x08;
const VP8X_XMP = 0x04;

/**
 * JPEG application segments that hold Exif, XMP, ICC and IPTC payloads.
 *
 * APP14 is deliberately absent. It looks like vendor metadata but its payload
 * ends in Adobe's colour `transform` byte, which tells the decoder how to read
 * the components; drop it from a 4-component YCCK/CMYK file and every decoder
 * reads raw CMYK. Measured on a CMYK test image: RMSE 0.39 against the source,
 * mean brightness 0.47 to 0.51. `jpegtran -copy none` keeps it for the same
 * reason, and there is nothing in it worth removing.
 */
const JPEG_METADATA_MARKERS = new Map([
  [0xe1, "APP1"], // Exif, XMP
  [0xe2, "APP2"], // ICC_PROFILE
  [0xed, "APP13"], // Photoshop / IPTC
  [0xfe, "COM"], // free-text comment
]);

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(bytes: Uint8Array, prefix: readonly number[]): boolean {
  if (bytes.byteLength < prefix.length) return false;
  return prefix.every((byte, i) => bytes[i] === byte);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += String.fromCharCode(bytes[offset + i]!);
  return out;
}

function concat(parts: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

function stripPng(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 8)];
  const removed: string[] = [];
  let total = 8;
  let at = 8;

  while (at + 8 <= bytes.byteLength) {
    const length = view.getUint32(at);
    const name = ascii(bytes, at + 4, 4);
    // length + name + data + crc
    const end = at + 12 + length;
    if (end > bytes.byteLength) break; // truncated: keep the rest verbatim
    if (PNG_METADATA_CHUNKS.has(name)) {
      removed.push(name);
    } else {
      kept.push(bytes.subarray(at, end));
      total += end - at;
    }
    at = end;
    if (name === "IEND") break;
  }
  if (at < bytes.byteLength) {
    kept.push(bytes.subarray(at));
    total += bytes.byteLength - at;
  }
  return removed.length ? { bytes: concat(kept, total), removed } : { bytes, removed };
}

function stripWebp(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [];
  const removed: string[] = [];
  let total = 0;
  let at = 12; // RIFF????WEBP

  while (at + 8 <= bytes.byteLength) {
    const name = ascii(bytes, at, 4);
    const length = view.getUint32(at + 4, true);
    // chunks are padded to an even length
    const end = at + 8 + length + (length % 2);
    if (end > bytes.byteLength) break; // truncated: keep the rest verbatim
    if (WEBP_METADATA_CHUNKS.has(name)) {
      removed.push(name.trim());
    } else {
      kept.push(bytes.subarray(at, end));
      total += end - at;
    }
    at = end;
  }
  if (!removed.length) return { bytes, removed };
  if (at < bytes.byteLength) {
    kept.push(bytes.subarray(at));
    total += bytes.byteLength - at;
  }

  const body = concat(kept, total);
  // VP8X advertises which optional chunks follow; clear the bits we removed.
  if (body.byteLength >= 9 && ascii(body, 0, 4) === "VP8X") {
    const flags = body[8]!;
    body[8] = flags & ~(VP8X_ICC | VP8X_EXIF | VP8X_XMP);
  }

  const out = new Uint8Array(12 + body.byteLength);
  out.set(bytes.subarray(0, 12));
  out.set(body, 12);
  new DataView(out.buffer).setUint32(4, out.byteLength - 8, true); // RIFF size
  return { bytes: out, removed };
}

function stripJpeg(bytes: Uint8Array): StripResult {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const kept: Uint8Array[] = [bytes.subarray(0, 2)]; // SOI
  const removed: string[] = [];
  let total = 2;
  let at = 2;

  while (at + 4 <= bytes.byteLength) {
    if (bytes[at] !== 0xff) break; // not a marker: keep the rest verbatim
    const marker = bytes[at + 1]!;
    if (marker === 0xda) break; // start of scan — entropy data follows
    const length = view.getUint16(at + 2);
    const end = at + 2 + length;
    if (end > bytes.byteLength) break;
    const name = JPEG_METADATA_MARKERS.get(marker);
    if (name) {
      removed.push(name);
    } else {
      kept.push(bytes.subarray(at, end));
      total += end - at;
    }
    at = end;
  }
  if (at < bytes.byteLength) {
    kept.push(bytes.subarray(at));
    total += bytes.byteLength - at;
  }
  return removed.length ? { bytes: concat(kept, total), removed } : { bytes, removed };
}

/**
 * Strip metadata from PNG, WebP and JPEG bytes. AVIF and anything else the
 * loader accepts passes through untouched — an ISOBMFF box rewrite is a
 * different job, and corrupting a card image is worse than publishing a
 * colour profile.
 */
export function stripImageMetadata(bytes: Uint8Array): StripResult {
  if (startsWith(bytes, PNG_SIGNATURE)) return stripPng(bytes);
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return stripWebp(bytes);
  }
  if (bytes.byteLength >= 2 && bytes[0] === 0xff && bytes[1] === 0xd8) return stripJpeg(bytes);
  return { bytes, removed: [] };
}
