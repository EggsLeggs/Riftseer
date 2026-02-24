import { SimplifiedDeck } from "./types";

export interface DeckSerializer {
    /**
     * Convert a SimplifiedDeck to a compact string representation for storage or sharing.
     * The exact format is up to the implementation, but it should be as concise as possible while still encoding all necessary information to reconstruct the deck.
     */
    serializeDeck(deck: SimplifiedDeck): string;
    /**
     * Parse a serialized deck string back into a SimplifiedDeck object.
     * Should handle invalid or malformed input gracefully, throwing an error if the input cannot be parsed.
     */
    deserializeDeck(serialized: string): SimplifiedDeck;
}

// ─── Binary format (V1) ────────────────────────────────────────────────────────
//
// Card/deck IDs are arbitrary UTF-8 strings, stored as [1 byte length][N bytes].
// Quantities fit in a single byte (max 255, well above any game limit).
// Section entry counts fit in a single byte (max 255).
//
// Layout:
//   [1 byte]  FORMAT_VERSION
//   [1 byte]  flags  (bit 0 = hasLegendId, bit 1 = hasChampionId)
//   [string]  legendId         (omitted when flag bit 0 is clear)
//   [string]  chosenChampionId (omitted when flag bit 1 is clear)
//   [1 byte]  mainDeck entry count
//     per entry: [string id][1 byte qty]
//   [1 byte]  sideboard entry count
//     per entry: [string id][1 byte qty]
//   [1 byte]  runes entry count
//     per entry: [string id][1 byte qty]
//   [1 byte]  battlegrounds entry count
//     per entry: [string id]
//
// Where [string] = [1 byte length][N bytes UTF-8], max 255 bytes per ID.
//
// The buffer is XOR-obfuscated with a fixed rotating key before base64url encoding.
// The result is opaque to anyone without the source.

const FORMAT_VERSION = 1;

// Fixed 16-byte XOR key — makes the encoded output non-trivially readable.
// Not cryptographic; purely obfuscatory so the output is application-readable only.
const XOR_KEY = new Uint8Array([
    0x3f, 0xa7, 0xd2, 0x18, 0x6c, 0x94, 0xb5, 0xe0,
    0x29, 0x5a, 0x87, 0xf3, 0x1e, 0x4d, 0xc6, 0x70,
]);

function xorTransform(data: Uint8Array): Uint8Array {
    const out = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
        out[i] = data[i] ^ XOR_KEY[i % XOR_KEY.length];
    }
    return out;
}

function base64urlEncode(bytes: Uint8Array): string {
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return btoa(bin)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function base64urlDecode(str: string): Uint8Array {
    const padded = str.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (4 - (padded.length % 4)) % 4;
    const bin = atob(padded + "=".repeat(pad));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
}

// ─── DeckSerializerV1 ─────────────────────────────────────────────────────────

export class DeckSerializerV1 implements DeckSerializer {
    serializeDeck(deck: SimplifiedDeck): string {
        const enc = new TextEncoder();

        const encodeId = (id: string): Uint8Array => {
            const bytes = enc.encode(id);
            if (bytes.length > 255) throw new Error(`ID too long (max 255 UTF-8 bytes): "${id}"`);
            return bytes;
        };

        // Encode optional header fields
        const legendEnc = deck.legendId !== null ? encodeId(deck.legendId) : null;
        const champEnc = deck.chosenChampionId !== null ? encodeId(deck.chosenChampionId) : null;

        // Parse and encode "cardId:qty" sections
        const encodeQtySection = (entries: string[]): Array<[Uint8Array, number]> =>
            entries.map(entry => {
                const colon = entry.lastIndexOf(":");
                if (colon === -1) throw new Error(`Malformed deck entry (expected "id:qty"): "${entry}"`);
                return [encodeId(entry.slice(0, colon)), parseInt(entry.slice(colon + 1), 10)];
            });

        const mainEnc = encodeQtySection(deck.mainDeck);
        const sideEnc = encodeQtySection(deck.sideboard);
        const runesEnc = encodeQtySection(deck.runes);
        const bgsEnc = deck.battlegrounds.map(encodeId);

        // Pre-compute exact buffer size
        const strLen = (b: Uint8Array) => 1 + b.length; // length prefix + data
        let size = 2; // version + flags
        if (legendEnc) size += strLen(legendEnc);
        if (champEnc) size += strLen(champEnc);
        size += 1 + mainEnc.reduce((s, [b]) => s + strLen(b) + 1, 0);
        size += 1 + sideEnc.reduce((s, [b]) => s + strLen(b) + 1, 0);
        size += 1 + runesEnc.reduce((s, [b]) => s + strLen(b) + 1, 0);
        size += 1 + bgsEnc.reduce((s, b) => s + strLen(b), 0);

        const buf = new Uint8Array(size);
        let pos = 0;

        buf[pos++] = FORMAT_VERSION;
        buf[pos++] =
            (legendEnc ? 0x01 : 0) |
            (champEnc ? 0x02 : 0);

        const writeStr = (bytes: Uint8Array) => {
            buf[pos++] = bytes.length;
            buf.set(bytes, pos);
            pos += bytes.length;
        };

        if (legendEnc) writeStr(legendEnc);
        if (champEnc) writeStr(champEnc);

        const writeQtySection = (entries: Array<[Uint8Array, number]>) => {
            buf[pos++] = entries.length;
            for (const [idBytes, qty] of entries) {
                writeStr(idBytes);
                buf[pos++] = qty;
            }
        };

        const writeBareSection = (ids: Uint8Array[]) => {
            buf[pos++] = ids.length;
            for (const idBytes of ids) writeStr(idBytes);
        };

        writeQtySection(mainEnc);
        writeQtySection(sideEnc);
        writeQtySection(runesEnc);
        writeBareSection(bgsEnc);

        return base64urlEncode(xorTransform(buf));
    }

    deserializeDeck(serialized: string): SimplifiedDeck {
        let buf: Uint8Array;
        try {
            buf = xorTransform(base64urlDecode(serialized));
        } catch {
            throw new Error("Invalid deck string: could not decode");
        }

        let pos = 0;
        const dec = new TextDecoder();

        const readByte = (): number => {
            if (pos >= buf.length) throw new Error("Invalid deck string: unexpected end of data");
            return buf[pos++];
        };

        const readStr = (): string => {
            const len = readByte();
            if (pos + len > buf.length) throw new Error("Invalid deck string: unexpected end of data");
            const str = dec.decode(buf.slice(pos, pos + len));
            pos += len;
            return str;
        };

        const version = readByte();
        if (version !== FORMAT_VERSION) {
            throw new Error(`Unsupported deck format version: ${version}`);
        }

        const flags = readByte();
        const legendId = (flags & 0x01) ? readStr() : null;
        const chosenChampionId = (flags & 0x02) ? readStr() : null;

        const readQtySection = (): string[] => {
            const count = readByte();
            const entries: string[] = [];
            for (let i = 0; i < count; i++) {
                const cardId = readStr();
                const qty = readByte();
                entries.push(`${cardId}:${qty}`);
            }
            return entries;
        };

        const readBareSection = (): string[] => {
            const count = readByte();
            const ids: string[] = [];
            for (let i = 0; i < count; i++) ids.push(readStr());
            return ids;
        };

        const mainDeck = readQtySection();
        const sideboard = readQtySection();
        const runes = readQtySection();
        const battlegrounds = readBareSection();

        return { id: null, legendId, chosenChampionId, mainDeck, sideboard, runes, battlegrounds };
    }
}
