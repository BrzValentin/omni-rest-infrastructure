import { deflateSync } from "node:zlib";

import type { QrMatrix } from "./qr-code";

/**
 * A minimal PNG encoder for printable QR codes (PR-26).
 *
 * A QR symbol is the one raster we can encode honestly by hand: it is a 1-bit black-and-white bitmap of
 * axis-aligned squares, so there is nothing to rasterize, resample, or colour-manage. Adding a general
 * image library to the frontend to write about eighty lines of PNG chunks would pull a native or
 * WASM-backed dependency into the build and the supply chain for no gain, so we deliberately do not.
 *
 * This module is node-only — it uses `node:zlib` — and unlike the browser-safe `lib/qr-code.ts` it must
 * only be imported from server code. It carries no `server-only` marker so it stays unit testable, in the
 * same spirit as `lib/site-origin.ts`.
 */

/**
 * 300 DPI in the PNG's own unit: pixels per metre (300 / 0.0254 = 11811.02, rounded).
 *
 * The `pHYs` chunk is not decoration. A PNG with no physical dimensions is placed by most print paths at
 * 72 DPI, so a 29-module symbol at scale 8 lands as a 3.2-inch card that a phone still scans and a
 * 10-module-per-inch print that it does not. Declaring the real density is what makes "scans correctly
 * when printed" survive the trip through whatever the restaurant prints with.
 */
const pixelsPerMetre = 11811;

/** The `pHYs` unit specifier for metres. `0` would mean "aspect ratio only" and carry no DPI at all. */
const unitIsMetres = 1;

/**
 * The largest side we will encode, in device pixels. At 300 DPI this is roughly 13.8 inches, larger than
 * any table tent or A4 sheet, and it exists so a mistyped `scale` cannot ask for a multi-gigabyte buffer
 * on a request thread.
 */
const maxSideDevicePixels = 4096;

/**
 * Encodes a QR matrix as a 1-bit greyscale PNG. `scale` is device pixels per QR module.
 *
 * Bit depth 1 with colour type 0 means one bit per pixel: bit `0` is black and bit `1` is white, so a
 * dark module clears its bits. The whole 29x29 symbol at print scale is a few hundred bytes.
 *
 * The return type is narrowed to `Uint8Array<ArrayBuffer>` rather than the default
 * `Uint8Array<ArrayBufferLike>` because the latter also admits a `SharedArrayBuffer`, which `BodyInit`
 * rejects — so the plain type will not go into a `Response` at all. We always allocate a fresh
 * `ArrayBuffer` here, so stating it is accurate as well as convenient.
 */
export function qrToPng(matrix: QrMatrix, scale: number): Uint8Array<ArrayBuffer> {
  if (!Number.isSafeInteger(scale) || scale < 1) {
    throw new Error("Refusing to encode a QR PNG: scale must be a positive whole number of pixels.");
  }
  if (matrix.size <= 0) {
    throw new Error("Refusing to encode a QR PNG: the matrix is empty.");
  }
  const side = matrix.size * scale;
  if (side > maxSideDevicePixels) {
    throw new Error(
      `Refusing to encode a QR PNG: ${side}px per side exceeds the ${maxSideDevicePixels}px limit.`,
    );
  }

  const ihdr = new Uint8Array(13);
  const header = new DataView(ihdr.buffer);
  header.setUint32(0, side);
  header.setUint32(4, side);
  ihdr[8] = 1; // bit depth: one bit per pixel
  ihdr[9] = 0; // colour type: greyscale
  ihdr[10] = 0; // compression: deflate, the only method PNG defines
  ihdr[11] = 0; // filter method: adaptive, the only method PNG defines
  ihdr[12] = 0; // interlace: none — a progressive QR would only delay the scan

  const phys = new Uint8Array(9);
  const density = new DataView(phys.buffer);
  density.setUint32(0, pixelsPerMetre);
  density.setUint32(4, pixelsPerMetre);
  phys[8] = unitIsMetres;

  return concat([
    // The 8-byte signature, whose high bit and CRLF/LF pairs let a decoder detect a transfer that
    // mangled line endings.
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    // `pHYs` must precede `IDAT`, per the PNG specification's chunk ordering rules.
    chunk("pHYs", phys),
    chunk("IDAT", new Uint8Array(deflateSync(scanlines(matrix, scale)))),
    chunk("IEND", new Uint8Array(0)),
  ]);
}

/**
 * Packs the matrix into PNG scanlines: one filter byte per row followed by MSB-first pixel bits, with
 * every row padded out to a whole byte.
 *
 * Filter type 0 (None) throughout. The adaptive filters exist to help photographic data compress; on a
 * two-colour bitmap of long identical runs they cost a byte of guesswork per row and save nothing, and
 * an unfiltered image is far easier to verify by hand when a printed code misbehaves.
 */
function scanlines(matrix: QrMatrix, scale: number): Uint8Array {
  const width = matrix.size * scale;
  const bytesPerRow = Math.ceil(width / 8);
  const stride = 1 + bytesPerRow;
  const raw = new Uint8Array(matrix.size * scale * stride);

  const row = new Uint8Array(bytesPerRow);
  for (let moduleY = 0; moduleY < matrix.size; moduleY += 1) {
    // Start the row all-white (every bit set) and clear the bits a dark module covers.
    row.fill(0xff);
    const modules = matrix.modules[moduleY];
    for (let moduleX = 0; moduleX < matrix.size; moduleX += 1) {
      if (modules?.[moduleX] !== true) continue;
      for (let offset = 0; offset < scale; offset += 1) {
        const x = moduleX * scale + offset;
        row[x >> 3] &= ~(0x80 >> (x & 7));
      }
    }
    // Bits past the image width are padding a decoder ignores; zeroing them keeps the output
    // byte-identical to what a reference encoder produces, so a byte diff against a fixture is
    // meaningful rather than noisy.
    const padBits = bytesPerRow * 8 - width;
    if (padBits > 0) row[bytesPerRow - 1] &= (0xff << padBits) & 0xff;

    // Every device row of a module row is the same bytes, so pack once and repeat.
    for (let offset = 0; offset < scale; offset += 1) {
      const start = (moduleY * scale + offset) * stride;
      raw[start] = 0; // filter: None
      raw.set(row, start + 1);
    }
  }
  return raw;
}

/** Wraps data as a PNG chunk: big-endian length, four-byte type, data, then a CRC over type and data. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * The CRC-32 table PNG specifies (reflected polynomial 0xedb88320), built once at module load.
 *
 * Written here rather than imported: `node:zlib` only gained a public `crc32` recently, and the table is
 * eight lines. The tests verify our output against that platform implementation, so the two are checked
 * against each other rather than both trusted.
 */
const crcTable = buildCrcTable();

function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let bit = 0; bit < 8; bit += 1) c = (c & 1) === 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: readonly Uint8Array[]): Uint8Array<ArrayBuffer> {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
