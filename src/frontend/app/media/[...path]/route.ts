import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const safePath = path.every((part) => /^[a-zA-Z0-9._-]+$/.test(part)) ? path.join("/") : null;
  if (!safePath) return new Response(null, { status: 404 });
  const url = new URL(`/media/${safePath}`, process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279");
  return new Promise<Response>((resolve, reject) => {
    const upstream = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: { accept: request.headers.get("accept") ?? "image/*", host: request.headers.get("host")?.split(":", 1)[0] ?? "menu.localhost" },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => resolve(new Response(Buffer.concat(chunks), {
        status: response.statusCode ?? 502,
        headers: { "content-type": response.headers["content-type"] ?? "application/octet-stream", "cache-control": response.headers["cache-control"] ?? "public, max-age=3600" },
      })));
    });
    upstream.setTimeout(15_000, () => upstream.destroy(new Error("Media proxy timed out.")));
    upstream.on("error", reject);
    upstream.end();
  });
}
