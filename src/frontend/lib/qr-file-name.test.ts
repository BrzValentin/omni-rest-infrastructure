import { describe, expect, it } from "vitest";

import { qrFileStem } from "./qr-file-name";

describe("qrFileStem", () => {
  it("names the download after the restaurant so an owner can find it again weeks later", () => {
    expect(qrFileStem("Prairie Table", "menu.localhost")).toBe("prairie-table-menu-qr");
  });

  it("transliterates accented names instead of dropping the accented letters", () => {
    // "Café Boréal" is a seeded fixture tenant. Filtering to ASCII without decomposing first would
    // have produced "caf-bor-al", which names the wrong restaurant on a print shop's file list.
    expect(qrFileStem("Café Boréal", "alternate.localhost")).toBe("cafe-boreal-menu-qr");
  });

  it.each([
    ["punctuation and symbols", "Joe's Bar & Grill!", "joes-bar-grill-menu-qr"],
    ["runs of separators", "The   Quiet  --  Kitchen", "the-quiet-kitchen-menu-qr"],
    ["leading and trailing noise", "  ...Sunroom...  ", "sunroom-menu-qr"],
  ])("collapses %s into a single safe stem", (_label, name, expected) => {
    expect(qrFileStem(name, "menu.localhost")).toBe(expected);
  });

  it("falls back to the host when the name contributes nothing usable", () => {
    // A name written entirely in a script this transliteration does not cover would otherwise leave
    // a bare "-menu-qr". The download still has to be named something.
    expect(qrFileStem("寿司", "sushi.example.com")).toBe("sushi-example-com-menu-qr");
  });

  it("falls back to the host when there is no name at all", () => {
    expect(qrFileStem(null, "menu.localhost")).toBe("menu-localhost-menu-qr");
  });

  it("truncates a very long name without leaving a trailing separator", () => {
    const stem = qrFileStem(`${"Restaurant ".repeat(20)}End`, "menu.localhost");
    expect(stem.endsWith("-menu-qr")).toBe(true);
    expect(stem).not.toMatch(/--menu-qr$/);
    expect(stem.length).toBeLessThanOrEqual(60 + "-menu-qr".length);
  });

  it("never emits a path separator, which would send the download somewhere else entirely", () => {
    expect(qrFileStem("../../etc/passwd", "menu.localhost")).toBe("etc-passwd-menu-qr");
  });

  it("never emits a quote that would break out of the Content-Disposition filename", () => {
    // The stem is interpolated into `filename="…"`. A surviving quote would let a restaurant name
    // rewrite the response header.
    expect(qrFileStem('Bad" name', "menu.localhost")).toBe("bad-name-menu-qr");
  });
});
