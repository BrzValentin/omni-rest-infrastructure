import { describe, expect, it } from "vitest";

import { encodeQr, qrToPathData, qrToSvg, type QrMatrix } from "./qr-code";

const menuUrl = "https://menu.example.com/menu";

/** A hand-built matrix, so the renderer's geometry can be asserted exactly rather than approximately. */
/**
 * Builds a matrix from a picture of one.
 *
 * A QR symbol is always square, and `QrMatrix.size` is the single dimension for both axes, so a
 * ragged or oblong fixture is not a QR matrix at all. This asserts squareness rather than trusting
 * the caller: an oblong fixture silently declares the wrong `size`, and the reader then sees a
 * renderer failure where the real fault is in the test.
 */
function matrixOf(rows: readonly string[]): QrMatrix {
  const offending = rows.find((row) => row.length !== rows.length);
  if (offending !== undefined) {
    throw new Error(`matrixOf needs a square picture; got ${rows.length} rows and the row "${offending}".`);
  }
  return {
    size: rows.length,
    modules: rows.map((row) => [...row].map((cell) => cell === "#")),
  };
}

describe("encodeQr", () => {
  it("produces a square matrix whose rows all match the declared size", () => {
    const matrix = encodeQr(menuUrl);
    expect(matrix.modules).toHaveLength(matrix.size);
    for (const row of matrix.modules) expect(row).toHaveLength(matrix.size);
  });

  it("surrounds the symbol with the four-module quiet zone the spec mandates", () => {
    // A code cropped flush to its finder patterns scans on screen and fails on paper, because the
    // scanner has no light margin to locate the symbol against.
    const matrix = encodeQr(menuUrl);
    const isLight = (y: number, x: number) => matrix.modules[y]?.[x] === false;

    for (let i = 0; i < matrix.size; i += 1) {
      for (let band = 0; band < 4; band += 1) {
        expect(isLight(band, i)).toBe(true);
        expect(isLight(matrix.size - 1 - band, i)).toBe(true);
        expect(isLight(i, band)).toBe(true);
        expect(isLight(i, matrix.size - 1 - band)).toBe(true);
      }
    }
  });

  it("places the top-left finder pattern immediately inside the quiet zone", () => {
    // Every QR symbol starts its finder pattern at the first non-quiet-zone module; this is the fixed
    // landmark the PNG encoder's pixel assertions rely on.
    const matrix = encodeQr(menuUrl);
    expect(matrix.modules[4]?.[4]).toBe(true);
    expect(matrix.modules[5]?.[5]).toBe(false);
    expect(matrix.modules[6]?.[6]).toBe(true);
  });

  it("is deterministic, so the printed code and the on-screen preview are the same symbol", () => {
    expect(encodeQr(menuUrl)).toEqual(encodeQr(menuUrl));
  });

  it("grows the symbol version rather than truncating when the payload gets longer", () => {
    const short = encodeQr("https://a.example.com/menu");
    const long = encodeQr(`https://${"a".repeat(120)}.example.com/menu`);
    expect(long.size).toBeGreaterThan(short.size);
  });

  it.each([
    ["an empty string", ""],
    ["spaces only", "   "],
    ["a tab and a newline", "\t\n"],
  ])("refuses to encode %s rather than printing a code that scans to nothing", (_label, payload) => {
    expect(() => encodeQr(payload)).toThrow(/empty or whitespace only/);
  });
});

describe("qrToPathData", () => {
  it("returns an empty string for an all-light matrix so no path element is needed", () => {
    expect(qrToPathData(matrixOf(["..", ".."]))).toBe("");
  });

  it("emits one closed rectangle command for a single dark module", () => {
    expect(qrToPathData(matrixOf([".#", ".."]))).toBe("M1 0h1v1h-1z");
  });

  it("merges a run of horizontally adjacent modules into one command rather than several", () => {
    expect(qrToPathData(matrixOf(["####", "....", "....", "...."]))).toBe("M0 0h4v1h-4z");
  });

  it("closes a run at the right edge of the matrix instead of running past it", () => {
    // The real symbol always ends in four light quiet-zone columns, so a renderer that forgot to
    // flush a run touching the final column would still look correct on every code this app draws.
    // This is the only case that would catch it.
    expect(qrToPathData(matrixOf(["..##", "....", "....", "...."]))).toBe("M2 0h2v1h-2z");
  });

  it("keeps runs separated by a light module as distinct commands", () => {
    expect(qrToPathData(matrixOf(["##.#", ".##.", "....", "...."])))
      .toBe("M0 0h2v1h-2zM3 0h1v1h-1zM1 1h2v1h-2z");
  });

  it("emits every dark module of a real symbol, counted against the matrix itself", () => {
    const matrix = encodeQr(menuUrl);
    const darkModules = matrix.modules.flatMap((row) => row.filter(Boolean)).length;
    const emitted = [...qrToPathData(matrix).matchAll(/h(\d+)v1/g)].reduce(
      (total, [, width]) => total + Number(width),
      0,
    );
    expect(emitted).toBe(darkModules);
  });
});

describe("qrToSvg", () => {
  const svg = qrToSvg(encodeQr(menuUrl));

  it("scales losslessly by declaring only a module-unit viewBox and no pixel dimensions", () => {
    const matrix = encodeQr(menuUrl);
    expect(svg).toContain(`viewBox="0 0 ${matrix.size} ${matrix.size}"`);
    expect(svg).not.toMatch(/\swidth="\d+(px|mm|pt)/);
    expect(svg).not.toMatch(/<svg[^>]*\sheight=/);
  });

  it("paints an opaque white ground across the whole viewBox including the quiet zone", () => {
    // A transparent QR printed onto coloured stock does not scan.
    const matrix = encodeQr(menuUrl);
    expect(svg).toContain(
      `<rect x="0" y="0" width="${matrix.size}" height="${matrix.size}" fill="#fff"/>`,
    );
  });

  it("emits every dark module as one merged path instead of hundreds of elements", () => {
    expect(svg.match(/<path/g)).toHaveLength(1);
    expect(svg.match(/<rect/g)).toHaveLength(1);
  });

  it("hardcodes black on white so no theme can invert or wash out the code", () => {
    expect(svg).toContain('fill="#000"');
    expect(svg).not.toContain("currentColor");
    expect(svg).not.toContain("var(--");
  });

  it("keeps module edges crisp so they do not antialias into grey at preview sizes", () => {
    expect(svg).toContain('shape-rendering="crispEdges"');
  });

  it("is a standalone document that renders when saved to a .svg file", () => {
    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg"')).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
  });

  it("names the code for assistive technology when a title is given", () => {
    const titled = qrToSvg(encodeQr(menuUrl), { title: "Scan for the menu" });
    expect(titled).toContain('role="img"');
    expect(titled).toContain("<title>Scan for the menu</title>");
    expect(titled).not.toContain("aria-hidden");
  });

  it("hides an untitled code rather than announcing an unlabelled graphic", () => {
    expect(svg).toContain('aria-hidden="true"');
    expect(svg).not.toContain("<title>");
  });

  it("escapes XML metacharacters in the title so a restaurant name cannot break the document", () => {
    const titled = qrToSvg(encodeQr(menuUrl), { title: `Chez <b>"Ampersand & Co"</b> 'menu'` });
    expect(titled).toContain(
      "<title>Chez &lt;b&gt;&quot;Ampersand &amp; Co&quot;&lt;/b&gt; &apos;menu&apos;</title>",
    );
    expect(titled).not.toContain("<b>");
  });

  it("carries the same merged path data the inline JSX renderer uses", () => {
    const matrix = matrixOf(["###", "#.#", "..#"]);
    expect(qrToSvg(matrix)).toContain(`d="${qrToPathData(matrix)}"`);
  });

  it("scales the coordinate system by moduleSize without adding pixel dimensions", () => {
    const svgOut = qrToSvg(matrixOf([".#", ".."]), { moduleSize: 4 });
    expect(svgOut).toContain('viewBox="0 0 8 8"');
    expect(svgOut).toContain('d="M1 0h1v1h-1z"');
    expect(svgOut).toContain('transform="scale(4)"');
    expect(svgOut).not.toMatch(/<svg[^>]*\s(width|height)=/);
  });

  it("keeps a fractional module size exact instead of emitting floating-point noise", () => {
    const svgOut = qrToSvg(matrixOf(["#..", "...", "..."]), { moduleSize: 1.5 });
    expect(svgOut).toContain('viewBox="0 0 4.5 4.5"');
    expect(svgOut).toContain('transform="scale(1.5)"');
  });

  it("omits the scale transform at the default module size", () => {
    expect(qrToSvg(matrixOf([".#", ".."]))).not.toContain("transform");
  });

  it("omits the path entirely for an all-light matrix rather than emitting an empty one", () => {
    const svgOut = qrToSvg(matrixOf(["..", ".."]));
    expect(svgOut).not.toContain("<path");
    expect(svgOut).toContain('fill="#fff"');
  });

  it.each([
    ["zero", 0],
    ["a negative size", -2],
    ["a non-finite size", Number.NaN],
  ])("refuses %s as a moduleSize", (_label, moduleSize) => {
    expect(() => qrToSvg(encodeQr(menuUrl), { moduleSize })).toThrow(/positive finite number/);
  });

  it("refuses an empty matrix rather than emitting a zero-area document", () => {
    expect(() => qrToSvg({ size: 0, modules: [] })).toThrow(/matrix is empty/);
  });
});
