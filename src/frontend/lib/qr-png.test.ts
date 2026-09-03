import { crc32 as nodeCrc32, inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { encodeQr, type QrMatrix } from "./qr-code";
import { qrToPng } from "./qr-png";

const menuUrl = "https://menu.example.com/menu";

type Chunk = Readonly<{ type: string; data: Uint8Array; crcVerifies: boolean }>;

/**
 * Walks the PNG structurally. We deliberately ship no PNG decoder, so the tests read the format the same
 * way a decoder would rather than trusting a library to agree with us.
 */
function parseChunks(png: Uint8Array): readonly Chunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: Chunk[] = [];
  let offset = 8; // past the signature
  while (offset < png.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    const data = png.subarray(offset + 8, offset + 8 + length);
    const declared = view.getUint32(offset + 8 + length);
    // Verified against node's own CRC-32 rather than against a second copy of our table.
    const crcVerifies = nodeCrc32(png.subarray(offset + 4, offset + 8 + length)) === declared;
    chunks.push({ type, data, crcVerifies });
    offset += 12 + length;
  }
  return chunks;
}

function chunkNamed(png: Uint8Array, type: string): Chunk {
  const found = parseChunks(png).find((chunk) => chunk.type === type);
  if (!found) throw new Error(`The PNG carries no ${type} chunk.`);
  return found;
}

function be32(data: Uint8Array, offset: number): number {
  return new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);
}

/** The unfiltered scanline bytes, with the per-row filter byte removed. */
function pixelBit(png: Uint8Array, x: number, y: number): number {
  const width = be32(chunkNamed(png, "IHDR").data, 0);
  const stride = 1 + Math.ceil(width / 8);
  const raw = inflateSync(chunkNamed(png, "IDAT").data);
  const byte = raw[y * stride + 1 + (x >> 3)] ?? 0;
  return (byte >> (7 - (x & 7))) & 1;
}

const solidDark: QrMatrix = { size: 2, modules: [[true, true], [true, false]] };

describe("qrToPng", () => {
  const scale = 4;
  const matrix = encodeQr(menuUrl);
  const png = qrToPng(matrix, scale);

  it("opens with the eight-byte PNG signature", () => {
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it("emits the chunks a decoder requires, in the order the specification mandates", () => {
    // `pHYs` must come before `IDAT`; a decoder is entitled to stop looking for it afterwards.
    expect(parseChunks(png).map((chunk) => chunk.type)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
  });

  it("carries a valid CRC-32 over the type and data of every chunk", () => {
    const verified = parseChunks(png).map((chunk) => `${chunk.type}:${chunk.crcVerifies}`);
    expect(verified).toEqual(["IHDR:true", "pHYs:true", "IDAT:true", "IEND:true"]);
  });

  it("declares a square image of size * scale pixels at one bit of greyscale", () => {
    const ihdr = chunkNamed(png, "IHDR").data;
    expect(be32(ihdr, 0)).toBe(matrix.size * scale);
    expect(be32(ihdr, 4)).toBe(matrix.size * scale);
    expect(ihdr[8]).toBe(1); // bit depth
    expect(ihdr[9]).toBe(0); // colour type: greyscale
    expect(ihdr[10]).toBe(0); // compression method
    expect(ihdr[11]).toBe(0); // filter method
    expect(ihdr[12]).toBe(0); // not interlaced
  });

  it("declares 300 DPI so a printed code is not silently placed at 72 DPI", () => {
    const phys = chunkNamed(png, "pHYs").data;
    expect(be32(phys, 0)).toBe(11811);
    expect(be32(phys, 4)).toBe(11811);
    expect(phys[8]).toBe(1); // unit specifier: metres
  });

  it("inflates to exactly one filter byte plus a byte-padded row of bits per scanline", () => {
    const side = matrix.size * scale;
    const raw = inflateSync(chunkNamed(png, "IDAT").data);
    expect(raw.length).toBe(side * (1 + Math.ceil(side / 8)));
  });

  it("prefixes every scanline with filter type 0, because filtering buys nothing on two-tone data", () => {
    const side = matrix.size * scale;
    const stride = 1 + Math.ceil(side / 8);
    const raw = inflateSync(chunkNamed(png, "IDAT").data);
    for (let y = 0; y < side; y += 1) expect(raw[y * stride]).toBe(0);
  });

  it("writes a dark module as 0 bits and the quiet zone as 1 bits", () => {
    // (4,4) is the corner of the top-left finder pattern, always dark; (0,0) is the quiet zone.
    expect(pixelBit(png, 4 * scale, 4 * scale)).toBe(0);
    expect(pixelBit(png, 4 * scale + scale - 1, 4 * scale)).toBe(0);
    expect(pixelBit(png, 0, 0)).toBe(1);
    expect(pixelBit(png, scale, scale)).toBe(1);
  });

  it("expands each module into a scale x scale block of identical pixels", () => {
    const small = qrToPng(solidDark, 3);
    for (let y = 0; y < 3; y += 1) {
      for (let x = 0; x < 6; x += 1) expect(pixelBit(small, x, y)).toBe(0);
    }
    for (let y = 3; y < 6; y += 1) {
      expect(pixelBit(small, 0, y)).toBe(0);
      expect(pixelBit(small, 5, y)).toBe(1);
    }
  });

  it("zeroes the padding bits past the image width so the rows are byte-exact", () => {
    // 2 modules at scale 3 is 6 pixels, so the low two bits of the single row byte are padding. The
    // second module row is dark then light, which packs to 000 111 — the padding must not inherit the
    // all-white fill the row starts from.
    const small = qrToPng(solidDark, 3);
    const raw = inflateSync(chunkNamed(small, "IDAT").data);
    expect(raw[7]).toBe(0b00011100);
  });

  it("stays small enough to serve inline, because a QR is a few hundred bytes of run-length data", () => {
    expect(png.length).toBeLessThan(4096);
  });

  it.each([
    ["zero", 0],
    ["a negative scale", -1],
    ["a fractional scale", 2.5],
    ["a non-finite scale", Number.POSITIVE_INFINITY],
    ["NaN", Number.NaN],
  ])("refuses %s as a scale", (_label, scaleValue) => {
    expect(() => qrToPng(matrix, scaleValue)).toThrow(/positive whole number/);
  });

  it("refuses a scale that would allocate an absurd bitmap on a request thread", () => {
    expect(() => qrToPng(matrix, 1000)).toThrow(/exceeds the 4096px limit/);
  });

  it("refuses an empty matrix rather than emitting a zero-pixel PNG", () => {
    expect(() => qrToPng({ size: 0, modules: [] }, 4)).toThrow(/matrix is empty/);
  });

  it("is byte-for-byte deterministic, so a cached download never drifts from the preview", () => {
    expect([...qrToPng(matrix, scale)]).toEqual([...qrToPng(encodeQr(menuUrl), scale)]);
  });
});
