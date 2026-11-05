import { describe, expect, test } from "bun:test";
import { stripImageMetadata } from "../images/strip-metadata.ts";

/** PNG: signature, then length/name/data/crc per chunk. */
function pngChunk(name: string, data: number[] = []): number[] {
  const length = [
    (data.length >>> 24) & 0xff,
    (data.length >>> 16) & 0xff,
    (data.length >>> 8) & 0xff,
    data.length & 0xff,
  ];
  const nameBytes = [...name].map((c) => c.charCodeAt(0));
  return [...length, ...nameBytes, ...data, 0, 0, 0, 0];
}

function png(chunks: number[][]): Uint8Array {
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...chunks.flat()]);
}

/** WebP: RIFF????WEBP, then little-endian name/length/data chunks, even-padded. */
function webpChunk(name: string, data: number[]): number[] {
  const n = data.length;
  const header = [
    ...[...name].map((c) => c.charCodeAt(0)),
    n & 0xff,
    (n >>> 8) & 0xff,
    (n >>> 16) & 0xff,
    (n >>> 24) & 0xff,
  ];
  return n % 2 === 0 ? [...header, ...data] : [...header, ...data, 0];
}

function webp(chunks: number[][]): Uint8Array {
  const body = chunks.flat();
  const size = 4 + body.length;
  return new Uint8Array([
    ...[..."RIFF"].map((c) => c.charCodeAt(0)),
    size & 0xff,
    (size >>> 8) & 0xff,
    (size >>> 16) & 0xff,
    (size >>> 24) & 0xff,
    ...[..."WEBP"].map((c) => c.charCodeAt(0)),
    ...body,
  ]);
}

function jpeg(segments: number[][]): Uint8Array {
  return new Uint8Array([0xff, 0xd8, ...segments.flat(), 0xff, 0xda, 1, 2, 3]);
}

function jpegSegment(marker: number, data: number[]): number[] {
  const length = data.length + 2;
  return [0xff, marker, (length >>> 8) & 0xff, length & 0xff, ...data];
}

describe("stripImageMetadata", () => {
  test("drops PNG metadata chunks and keeps pixel chunks", () => {
    const input = png([
      pngChunk("IHDR", [1, 2, 3]),
      pngChunk("iCCP", [9, 9, 9, 9]),
      pngChunk("tEXt", [7, 7]),
      pngChunk("IDAT", [4, 5, 6]),
      pngChunk("IEND"),
    ]);
    const { bytes, removed } = stripImageMetadata(input);

    expect(removed).toEqual(["iCCP", "tEXt"]);
    expect(bytes.byteLength).toBeLessThan(input.byteLength);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).toContain("IHDR");
    expect(text).toContain("IDAT");
    expect(text).toContain("IEND");
    expect(text).not.toContain("iCCP");
    expect(text).not.toContain("tEXt");
  });

  test("leaves a PNG that carries no metadata byte-for-byte alone", () => {
    // Riot's gallery PNGs are this case, which is why nothing leaked before.
    const input = png([pngChunk("IHDR", [1]), pngChunk("IDAT", [2]), pngChunk("IEND")]);
    const { bytes, removed } = stripImageMetadata(input);

    expect(removed).toEqual([]);
    expect(bytes).toBe(input); // same reference: no copy when there is nothing to do
  });

  test("drops WebP metadata chunks and clears the matching VP8X bits", () => {
    // VP8X payload: flags, 3 reserved, 3 canvas width-1, 3 canvas height-1.
    // 0x30 = ICC + Alpha, which is what a Piltover Archive WebP arrives with.
    const input = webp([
      webpChunk("VP8X", [0x30, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      webpChunk("ICCP", [1, 2, 3, 4]),
      webpChunk("VP8 ", [5, 6, 7, 8]),
    ]);
    const { bytes, removed } = stripImageMetadata(input);

    expect(removed).toEqual(["ICCP"]);
    const text = new TextDecoder("latin1").decode(bytes);
    expect(text).not.toContain("ICCP");
    expect(text).toContain("VP8 ");
    // alpha bit survives, ICC bit is gone
    expect(bytes[20]).toBe(0x10);
    // the RIFF size header is rewritten to match the shorter body
    expect(new DataView(bytes.buffer).getUint32(4, true)).toBe(bytes.byteLength - 8);
  });

  test("drops WebP EXIF and XMP as well as ICC", () => {
    const input = webp([
      webpChunk("VP8X", [0x2c, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
      webpChunk("VP8 ", [1, 2]),
      webpChunk("EXIF", [3, 4]),
      webpChunk("XMP ", [5, 6]),
    ]);
    const { bytes, removed } = stripImageMetadata(input);

    expect(removed).toEqual(["EXIF", "XMP"]);
    expect(bytes[20]).toBe(0x00);
  });

  test("drops JPEG Exif, ICC and comment segments but keeps the scan", () => {
    const input = jpeg([
      jpegSegment(0xe0, [1, 2]), // APP0 JFIF stays
      jpegSegment(0xe1, [3, 4]), // Exif
      jpegSegment(0xe2, [5, 6]), // ICC
      jpegSegment(0xfe, [7, 8]), // comment
    ]);
    const { bytes, removed } = stripImageMetadata(input);

    expect(removed).toEqual(["APP1", "APP2", "COM"]);
    expect(bytes[bytes.byteLength - 4]).toBe(0xda); // SOS marker preserved
    expect(bytes.byteLength).toBeLessThan(input.byteLength);
  });

  test("keeps APP14, which decides how a 4-component JPEG is read", async () => {
    // Not metadata: its payload ends in Adobe's colour `transform` byte. A
    // review caught this stripping CMYK files to RMSE 0.39 against the source,
    // which is exactly the silently-broken-image outcome this module exists to
    // avoid. `jpegtran -copy none` keeps it too.
    const bytes = new Uint8Array(
      await Bun.file(`${import.meta.dir}/fixtures/adobe-cmyk.jpg`).arrayBuffer(),
    );
    const { bytes: out, removed } = stripImageMetadata(bytes);

    expect(removed).not.toContain("APP14");
    // the Adobe segment is still there, byte for byte
    expect(new TextDecoder("latin1").decode(out)).toContain("Adobe");
  });

  test("strips the ICC profile a real mirror ships, and nothing else", async () => {
    // The hand-built fixtures above cannot catch a mis-walked real container.
    const bytes = new Uint8Array(
      await Bun.file(`${import.meta.dir}/fixtures/icc.webp`).arrayBuffer(),
    );
    const { bytes: out, removed } = stripImageMetadata(bytes);

    expect(removed).toEqual(["ICCP"]);
    expect(out.byteLength).toBeLessThan(bytes.byteLength);
    // RIFF header stays coherent, and the alpha flag outlives the ICC one
    expect(new TextDecoder("latin1").decode(out.subarray(0, 4))).toBe("RIFF");
    expect(new DataView(out.buffer, out.byteOffset).getUint32(4, true)).toBe(out.byteLength - 8);
    expect(out[20]! & 0x20).toBe(0); // ICC bit cleared
    expect(out[20]! & 0x10).toBe(0x10); // alpha bit kept
  });

  test("skips JPEG fill bytes before a marker", async () => {
    // A marker code may be preceded by extra `FF`. Reading the byte after the
    // first one takes a fill byte for the marker and walks out of step, which
    // left the segment — and so the metadata — in the published `original`.
    const bytes = new Uint8Array(
      await Bun.file(`${import.meta.dir}/fixtures/jpeg-fill-bytes.jpg`).arrayBuffer(),
    );
    const { bytes: out, removed } = stripImageMetadata(bytes);

    expect(removed).toEqual(["COM"]);
    expect(new TextDecoder("latin1").decode(out)).not.toContain("SECRET-FILL");
  });

  test("keeps scanning for metadata between the scans of a progressive JPEG", async () => {
    // A progressive file has many scans and may carry APP or COM between them.
    // Stopping at the first scan copied all of that into `original` verbatim.
    const bytes = new Uint8Array(
      await Bun.file(`${import.meta.dir}/fixtures/jpeg-multi-scan.jpg`).arrayBuffer(),
    );
    const { bytes: out, removed } = stripImageMetadata(bytes);

    expect(removed).toEqual(["COM"]);
    expect(new TextDecoder("latin1").decode(out)).not.toContain("SECRET-MIDSCAN");
    // the scan data itself survives untouched, byte stuffing and all
    expect(out.byteLength).toBe(bytes.byteLength - 18);
  });

  test("never mutates the input", () => {
    const input = png([pngChunk("IHDR", [1]), pngChunk("tEXt", [2]), pngChunk("IEND")]);
    const before = Uint8Array.from(input);
    stripImageMetadata(input);

    expect(input).toEqual(before);
  });

  test("handles a view with a non-zero byteOffset", () => {
    // `new DataView(out.buffer)` is only safe because `out` is freshly
    // allocated; a refactor that drops the copy would break exactly here.
    const whole = png([pngChunk("IHDR", [1]), pngChunk("iCCP", [9]), pngChunk("IEND")]);
    const padded = new Uint8Array(whole.byteLength + 8);
    padded.set(whole, 8);
    const view = padded.subarray(8);

    expect(stripImageMetadata(view).removed).toEqual(["iCCP"]);
  });

  test("degenerate inputs come back untouched rather than throwing", () => {
    for (const input of [
      new Uint8Array(0),
      new Uint8Array([0xff]),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      new Uint8Array([0xff, 0xd8]),
      new Uint8Array([...[..."RIFF"].map((c) => c.charCodeAt(0)), 0, 0, 0, 0]),
    ]) {
      const { bytes, removed } = stripImageMetadata(input);
      expect(removed).toEqual([]);
      expect(bytes).toBe(input);
    }
  });

  test("passes an unrecognised format through untouched", () => {
    // AVIF and friends: a wrong guess corrupts the card, so do nothing.
    const input = new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const { bytes, removed } = stripImageMetadata(input);

    expect(removed).toEqual([]);
    expect(bytes).toBe(input);
  });

  test("does not run off the end of a truncated file", () => {
    const whole = png([pngChunk("IHDR", [1]), pngChunk("tEXt", [2, 3, 4, 5])]);
    const input = whole.subarray(0, whole.byteLength - 6);

    expect(() => stripImageMetadata(input)).not.toThrow();
  });
});
