/**
 * Magic-byte sniff matching the API's `detectAdminImageType`, so a File we
 * build from a remote fetch carries a `type` the upload endpoint will accept.
 */
export function detectImageContentType(
  bytes: ArrayBuffer | Uint8Array,
): string | null {
  const value = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  if (
    value.length >= 8 &&
    value[0] === 0x89 &&
    value[1] === 0x50 &&
    value[2] === 0x4e &&
    value[3] === 0x47 &&
    value[4] === 0x0d &&
    value[5] === 0x0a &&
    value[6] === 0x1a &&
    value[7] === 0x0a
  ) {
    return "image/png";
  }
  if (
    value.length >= 3 &&
    value[0] === 0xff &&
    value[1] === 0xd8 &&
    value[2] === 0xff
  ) {
    return "image/jpeg";
  }

  const ascii = (start: number, end: number) =>
    String.fromCharCode(...value.slice(start, end));
  if (
    value.length >= 6 &&
    (ascii(0, 6) === "GIF87a" || ascii(0, 6) === "GIF89a")
  ) {
    return "image/gif";
  }
  if (
    value.length >= 12 &&
    ascii(0, 4) === "RIFF" &&
    ascii(8, 12) === "WEBP"
  ) {
    return "image/webp";
  }
  if (
    value.length >= 12 &&
    ascii(4, 8) === "ftyp" &&
    (ascii(8, 12) === "avif" || ascii(8, 12) === "avis")
  ) {
    return "image/avif";
  }
  return null;
}

const EXT_BY_TYPE: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function extensionForImageType(contentType: string): string {
  return EXT_BY_TYPE[contentType] ?? "bin";
}
