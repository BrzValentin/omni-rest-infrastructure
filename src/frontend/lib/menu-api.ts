import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

import { headers } from "next/headers";

import { parsePublicMenuResponse, type PublicMenuResponse } from "./menu-contract";

export class PublicMenuApiError extends Error {
  constructor(public readonly status: number) {
    super(status === 404 ? "Restaurant not found." : "Public menu request failed.");
    this.name = "PublicMenuApiError";
  }
}

export async function getPublicMenu(): Promise<PublicMenuResponse> {
  const requestHeaders = await headers();
  const host = normalizePublicHost(requestHeaders.get("host"));
  const apiBase = process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279";
  const allowedMediaHosts = new Set(
    (process.env.OMNI_REST_MEDIA_HOSTS ?? "images.example.test")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  );

  const response = await requestPublicMenu(new URL("/api/v1/public/menu", apiBase), host);
  if (response.status < 200 || response.status >= 300) throw new PublicMenuApiError(response.status);
  return parsePublicMenuResponse(JSON.parse(response.body) as unknown, allowedMediaHosts);
}

function requestPublicMenu(url: URL, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(
      url,
      { headers: { Accept: "application/json", Host: host }, method: "GET" },
      (response) => {
        const chunks: Buffer[] = [];
        let size = 0;
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > 10 * 1024 * 1024) {
            response.destroy(new Error("Public menu response exceeded the 10 MiB safety limit."));
            return;
          }
          chunks.push(chunk);
        });
        response.on("end", () =>
          resolve({ status: response.statusCode ?? 502, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    request.setTimeout(10_000, () => request.destroy(new Error("Public menu request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

export function normalizePublicHost(rawHost: string | null): string {
  if (!rawHost || rawHost.length > 259 || /[\s,\\/]/.test(rawHost)) {
    throw new PublicMenuApiError(404);
  }
  try {
    const parsed = new URL(`http://${rawHost}`);
    if (parsed.username || parsed.password || parsed.pathname !== "/") throw new Error("Unsafe host");
    return parsed.hostname.toLowerCase().replace(/\.$/, "");
  } catch {
    throw new PublicMenuApiError(404);
  }
}
