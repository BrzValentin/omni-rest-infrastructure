import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { NextRequest } from "next/server";

import { upstreamProblemResponse } from "@/lib/api-error";
import { tenantHostOrNull } from "@/lib/tenant-host";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  // Media is addressed per tenant, so a request without a usable `Host` addresses nothing. Forwarding
  // it under a default host would let an unaddressed request pull another restaurant's images.
  const host = tenantHostOrNull(request.headers.get("host"));
  if (!host) return new Response(null, { status: 404, headers: { "cache-control": "no-store" } });

  const { path } = await context.params;
  // `.` and `..` satisfy the character class, and `new URL` resolves them, so a segment that is only
  // dots would let a request climb out of `/media` — and out of the per-restaurant directory that
  // scopes media to a tenant. They are rejected explicitly.
  const safeSegment = (part: string) => /^[a-zA-Z0-9._-]+$/.test(part) && !/^\.+$/.test(part);
  const safePath = path.every(safeSegment) ? path.join("/") : null;
  if (!safePath) return new Response(null, { status: 404 });
  const url = new URL(`/media/${safePath}`, process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279");
  return new Promise<Response>((resolve) => {
    let timedOut = false;
    // The upstream failing is answered with a problem document rather than a rejected handler, which
    // reached the browser as an opaque framework `500` with an HTML body in place of an image.
    const fail = () => resolve(upstreamProblemResponse(timedOut ? "timeout" : "unavailable"));
    const upstream = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: { accept: request.headers.get("accept") ?? "image/*", host },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      // A fault part-way through the image body used to leave this promise unsettled for good.
      response.on("error", fail);
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        resolve(new Response(Buffer.concat(chunks), {
          status,
          headers: {
            "content-type": response.headers["content-type"] ?? "application/octet-stream",
            "cache-control": response.headers["cache-control"] ?? cacheControlFor(status),
            // Every tenant is served on its own host and the response body is tenant-specific, so an
            // intermediary that keys only on the path must be told the host participates in the key.
            vary: "host",
          },
        }));
      });
    });
    upstream.setTimeout(15_000, () => {
      timedOut = true;
      upstream.destroy(new Error("Media proxy timed out."));
    });
    upstream.on("error", fail);
    upstream.end();
  });
}

/**
 * The fallback used only when the API states no policy of its own.
 *
 * Published media is immutable public content, so a successful response stays cacheable. Anything else
 * — a `404` for an image this tenant does not own, a `503` from an outage — must never be stored: the
 * previous blanket `public, max-age=3600` cached those failures for an hour under a shared key.
 */
function cacheControlFor(status: number): string {
  return status >= 200 && status < 300 ? "public, max-age=3600" : "no-store";
}
