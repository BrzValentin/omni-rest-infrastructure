import { encodeQr, qrToSvg } from "@/lib/qr-code";
import { readAdminRestaurant } from "@/lib/admin-data";
import { qrFileStem } from "@/lib/qr-file-name";

import { readQrTarget } from "../qr-target";

/**
 * The printable vector download.
 *
 * A route handler rather than a client-side blob, for three reasons. It keeps `uqr` and the SVG
 * renderer on the server, so nothing about this feature reaches the client bundle or the Phase 8
 * JavaScript budget. It makes the download a plain link, which works with the keyboard, the context
 * menu, and a right-click "save as" that a `Blob` URL handles badly. And it puts the encoded URL
 * behind the same backend authorization as everything else in the portal, instead of shipping the
 * tenant's public host to the browser and trusting it to come back unchanged.
 *
 * Route handlers do not run the `(protected)` layout, so nothing here inherits its session check.
 * That is fine: `readQrTarget()` reads through the backend, which refuses a caller without an active
 * owner membership, and the refusal is mapped straight onto this response below.
 */
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const target = await readQrTarget();
  if (target.kind === "unauthorized") return new Response("Sign in to download this code.", { status: 401 });
  if (target.kind === "unavailable") return new Response("This code is temporarily unavailable.", { status: 503 });
  if (target.kind === "no-address") return new Response("This restaurant has no public address yet.", { status: 404 });

  const restaurant = await readAdminRestaurant();
  const svg = qrToSvg(encodeQr(target.menuUrl), { title: `Menu for ${restaurant?.name ?? target.host}` });

  return new Response(svg, {
    status: 200,
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "content-disposition": `attachment; filename="${qrFileStem(restaurant?.name ?? null, target.host)}.svg"`,
      // The code changes the moment the restaurant's domain or slug changes, and an owner who just
      // moved domains is exactly the owner about to reprint. Never let a proxy hold this.
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
