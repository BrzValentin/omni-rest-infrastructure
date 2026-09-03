import { encode } from "uqr";

/**
 * QR encoding and SVG rendering for the public menu code (PR-26).
 *
 * A QR code that lives on a table tent has exactly one job: it must still scan after months of grease,
 * scuffs, coffee rings, and whatever printer the restaurant actually owns. Every choice below exists
 * because of a specific way a printed code stops scanning, and each is named at its rule.
 *
 * Like `lib/site-origin.ts`, this module carries neither `server-only` nor any node builtin so the rules
 * can be unit tested and so the same matrix can be rendered in the browser (admin preview) and on the
 * server (download endpoint) without a second implementation. The PNG encoder, which *is* node-only,
 * lives separately in `lib/qr-png.ts` and consumes the `QrMatrix` produced here.
 */

/** A square grid of QR modules, quiet zone included. `modules[y][x] === true` is a dark module. */
export type QrMatrix = Readonly<{ size: number; modules: readonly (readonly boolean[])[] }>;

/**
 * The quiet zone the QR spec mandates: four light modules on every side. It is part of the symbol, not
 * decoration — a code cropped flush to its finder patterns is the classic "scans on screen, fails on
 * paper" bug, because a designer trimmed the whitespace a scanner uses to locate the symbol.
 */
const quietZoneModules = 4;

/**
 * Encodes text as a QR matrix at error-correction level M.
 *
 * Level M tolerates roughly 15% damage, which is the standard choice for printed table-top codes that
 * pick up grease and scuffs. L (~7%) is too fragile for a surface people eat over; Q and H push the
 * symbol to a higher version, so the same physical card holds more, smaller modules — which makes the
 * code *harder* to scan at these URL lengths rather than easier, and buys robustness we do not need.
 */
export function encodeQr(text: string): QrMatrix {
  if (text.trim().length === 0) {
    // A whitespace-only payload still produces a perfectly valid symbol, which is the danger: it would
    // print, pass visual inspection, and scan to nothing at the table.
    throw new Error("Refusing to encode a QR code: the payload is empty or whitespace only.");
  }

  const encoded = encode(text, { ecc: "M", border: quietZoneModules });
  return {
    size: encoded.size,
    modules: encoded.data.map((row) => [...row]),
  };
}

/** Options for `qrToSvg`. */
export type QrSvgOptions = Readonly<{
  /**
   * Coordinate units per QR module. The default of 1 keeps the SVG in module units, which is the
   * intent: the document is resolution independent and CSS or the print stylesheet sizes it.
   */
  moduleSize?: number;
  /** Accessible name, rendered as a `<title>` element. Omit for a code that a caption already names. */
  title?: string;
}>;

/**
 * Renders a QR matrix as a standalone, self-describing SVG document string.
 *
 * The output deliberately carries no `width`/`height` attributes, so it scales losslessly from a 120px
 * admin preview to a full-page print without re-encoding.
 */
export function qrToSvg(matrix: QrMatrix, options: QrSvgOptions = {}): string {
  const { moduleSize = 1, title } = options;
  if (!Number.isFinite(moduleSize) || moduleSize <= 0) {
    throw new Error("Refusing to render a QR code: moduleSize must be a positive finite number.");
  }
  if (matrix.size <= 0) {
    throw new Error("Refusing to render a QR code: the matrix is empty.");
  }

  const extent = unit(matrix.size * moduleSize);
  // The path is always emitted in module units and scaled by a transform, so `qrToPathData` stays the
  // single implementation of the run-merge for both this renderer and the admin page's inline JSX.
  const path = qrToPathData(matrix);
  const scale = moduleSize === 1 ? "" : ` transform="scale(${unit(moduleSize)})"`;

  return [
    // `shape-rendering="crispEdges"` is inherited by the children: without it a browser antialiases every
    // module edge, and at preview sizes the black/white boundary a scanner looks for smears into grey.
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}"`,
    // A code with no accessible name is hidden rather than announced as an unlabelled graphic; when a
    // name is given the `<title>` supplies it and `role="img"` makes assistive tech read it as one image
    // instead of walking the path.
    title === undefined ? ' role="img" aria-hidden="true"' : ' role="img"',
    ' shape-rendering="crispEdges">',
    title === undefined ? "" : `<title>${escapeXml(title)}</title>`,
    // An explicit white ground, covering the quiet zone as well. A transparent QR printed onto coloured
    // stock does not scan, and it is the single most common way this feature fails in the field.
    `<rect x="0" y="0" width="${extent}" height="${extent}" fill="#fff"/>`,
    // `#000` and `#fff` are hardcoded on purpose: a QR that inherits `currentColor` or a theme token
    // becomes an inverted or low-contrast code on a dark-mode page or a themed print sheet, and neither
    // scans.
    path === "" ? "" : `<path d="${path}" fill="#000"${scale}/>`,
    "</svg>",
  ].join("");
}

/**
 * The merged SVG path `d` for the dark modules, in module units. Empty when nothing is dark.
 *
 * Horizontally adjacent modules merge into one rectangle command. A version-3 symbol is 37x37; a naive
 * one-`<rect>`-per-module renderer emits close to 700 elements into the document for a single code, and
 * the admin page shows several at once. Run-length merging keeps it to one element whose `d` a browser
 * can rasterize in one pass.
 *
 * This is exported separately from `qrToSvg` so the admin page can render the code as real JSX
 * (`<svg><path d={qrToPathData(matrix)} /></svg>`) instead of pushing our own generated markup through
 * `dangerouslySetInnerHTML`.
 */
export function qrToPathData(matrix: QrMatrix): string {
  const commands: string[] = [];
  for (let y = 0; y < matrix.size; y += 1) {
    const row = matrix.modules[y];
    let runStart = -1;
    for (let x = 0; x <= matrix.size; x += 1) {
      const dark = x < matrix.size && row?.[x] === true;
      if (dark && runStart === -1) runStart = x;
      if (!dark && runStart !== -1) {
        const width = x - runStart;
        commands.push(`M${runStart} ${y}h${width}v1h-${width}z`);
        runStart = -1;
      }
    }
  }
  return commands.join("");
}

/** Formats a coordinate without a noisy trailing `.0`, so emitted SVGs stay diffable in snapshots. */
function unit(value: number): string {
  return Number.isInteger(value) ? String(value) : String(Number(value.toFixed(3)));
}

/** Escapes text for an XML text node. Titles are operator-supplied and can contain `&` or `<`. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
