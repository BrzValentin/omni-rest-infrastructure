import { encodeQr } from "@/lib/qr-code";
import { qrToPng } from "@/lib/qr-png";
import { readAdminRestaurant } from "@/lib/admin-data";
import { qrFileStem } from "@/lib/qr-file-name";

import { readQrTarget } from "../qr-target";

/**
 * The raster download, for owners whose printer or design tool will not take an SVG.
 *
 * See `../qr.svg/route.ts` for why both downloads are route handlers rather than client-side blobs.
 */
export const dynamic = "force-dynamic";

/**
 * Roughly how many pixels wide the finished image should be.
 *
 * The scale is derived from this rather than fixed, because the module count grows with the URL
 * length: a fixed scale would quietly shrink the printed code for a restaurant with a long domain.
 * At the 300 DPI `qrToPng` declares, ~1000 px is about 85 mm — comfortably above the ~20 mm a phone
 * camera needs at arm's length, with room to be printed smaller on a sticker.
 */
const targetPixels = 1000;

export async function GET(): Promise<Response> {
  const target = await readQrTarget();
  if (target.kind === "unauthorized") return new Response("Sign in to download this code.", { status: 401 });
  if (target.kind === "unavailable") return new Response("This code is temporarily unavailable.", { status: 503 });
  if (target.kind === "no-address") return new Response("This restaurant has no public address yet.", { status: 404 });

  const restaurant = await readAdminRestaurant();
  const matrix = encodeQr(target.menuUrl);
  const png = qrToPng(matrix, Math.max(8, Math.ceil(targetPixels / matrix.size)));

  return new Response(png, {
    status: 200,
    headers: {
      "content-type": "image/png",
      "content-disposition": `attachment; filename="${qrFileStem(restaurant?.name ?? null, target.host)}.png"`,
      "cache-control": "no-store",
      "x-robots-tag": "noindex, nofollow",
    },
  });
}
