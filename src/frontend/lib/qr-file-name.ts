/**
 * Names the QR downloads after the restaurant.
 *
 * Owners save these next to their other artwork and open them weeks later in a print shop, so
 * `prairie-table-menu-qr.png` is worth the few lines that `qr.png` is not.
 *
 * This lives here rather than beside the route handlers that use it because those import
 * `server-only`, which throws under jsdom and so cannot be unit tested at all — the same split
 * `lib/site-origin.ts` makes against `lib/seo.ts`, and for the same reason.
 */

/** The longest stem we will build, before the `-menu-qr` suffix. */
const maximumNameLength = 60;

/**
 * Builds a filesystem-safe stem for one restaurant's QR downloads.
 *
 * Falls back to the host when the name yields nothing usable — a restaurant named only in a script
 * this transliteration does not cover would otherwise produce a bare `-menu-qr`, and a download that
 * cannot be named must still download.
 */
export function qrFileStem(restaurantName: string | null, host: string): string {
  const fromName = slugify(
    (restaurantName ?? "")
      .normalize("NFKD")
      // NFKD splits accents off their letters; dropping the combining marks turns "Café Boréal" into
      // "cafe-boreal" rather than losing the accented letters entirely to the ASCII filter below.
      .replace(/\p{M}/gu, ""),
  );
  return `${fromName || slugify(host) || "menu"}-menu-qr`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    // Apostrophes are dropped rather than treated as separators, because they sit *inside* a word:
    // "Joe's Bar" has to become "joes-bar", not "joe-s-bar". Restaurant names are full of them.
    .replace(/['‘’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maximumNameLength)
    .replace(/-+$/, "");
}
