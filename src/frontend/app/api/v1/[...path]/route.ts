import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import type { NextRequest } from "next/server";

import { upstreamProblemResponse } from "@/lib/api-error";
import { tenantHostOrNull } from "@/lib/tenant-host";

export const dynamic = "force-dynamic";

/** The same shape the API returns for an unknown restaurant, so clients need no special case. */
function unresolvedTenant(): Response {
  return new Response(
    JSON.stringify({ status: 404, code: "restaurant_not_found", title: "Restaurant not found." }),
    { status: 404, headers: { "content-type": "application/problem+json", "cache-control": "no-store" } },
  );
}

function responseHeaders(source: IncomingHttpHeaders): Headers {
  const result = new Headers();
  for (const [name, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((item) => result.append(name, item));
    else result.set(name, value);
  }
  result.delete("transfer-encoding");
  result.delete("content-length");
  return result;
}

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  // The tenant is resolved from `Host` by the API, so a request without a usable one addresses no
  // restaurant. It is refused here rather than forwarded under a default host, which would hand the
  // caller another tenant's data (PR-20 Task 2).
  const host = tenantHostOrNull(request.headers.get("host"));
  if (!host) return unresolvedTenant();

  const { path } = await context.params;
  const url = new URL(`/api/v1/${path.join("/")}${request.nextUrl.search}`, process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279");
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());
  const outgoing: Record<string, string> = {
    accept: request.headers.get("accept") ?? "application/json",
    host,
  };
  const forwardedProto = process.env.OMNI_REST_FORWARDED_PROTO;
  if (forwardedProto === "http" || forwardedProto === "https") {
    // Deployment-owned metadata only: never copy a client-supplied forwarding header.
    outgoing["x-forwarded-proto"] = forwardedProto;
  }
  for (const name of ["content-type", "cookie", "if-match", "user-agent", "x-csrf-token"]) {
    const value = request.headers.get(name);
    if (value) outgoing[name] = value;
  }

  return new Promise<Response>((resolve) => {
    let timedOut = false;
    // An upstream fault is answered with a problem document rather than by rejecting the handler.
    // A rejection reached the caller as an opaque framework `500` carrying an HTML body, which a
    // client expecting `application/problem+json` cannot read and cannot tell apart from a fault in
    // the proxy itself.
    const fail = () => resolve(upstreamProblemResponse(timedOut ? "timeout" : "unavailable"));
    const upstream = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: request.method,
      headers: outgoing,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      // Without this a fault that arrives after the headers did left the promise unsettled.
      response.on("error", fail);
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        const body = status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status, headers: responseHeaders(response.headers) }));
      });
    });
    upstream.setTimeout(15_000, () => {
      timedOut = true;
      upstream.destroy(new Error("API proxy timed out."));
    });
    upstream.on("error", fail);
    if (body) upstream.write(body);
    upstream.end();
  });
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
