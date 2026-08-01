import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { IncomingHttpHeaders } from "node:http";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

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
  const { path } = await context.params;
  const url = new URL(`/api/v1/${path.join("/")}${request.nextUrl.search}`, process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279");
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : Buffer.from(await request.arrayBuffer());
  const outgoing: Record<string, string> = {
    accept: request.headers.get("accept") ?? "application/json",
    host: request.headers.get("host")?.split(":", 1)[0] ?? "menu.localhost",
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

  return new Promise<Response>((resolve, reject) => {
    const upstream = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: request.method,
      headers: outgoing,
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        const body = status === 204 || status === 205 || status === 304 ? null : Buffer.concat(chunks);
        resolve(new Response(body, { status, headers: responseHeaders(response.headers) }));
      });
    });
    upstream.setTimeout(15_000, () => upstream.destroy(new Error("API proxy timed out.")));
    upstream.on("error", reject);
    if (body) upstream.write(body);
    upstream.end();
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const DELETE = proxy;
