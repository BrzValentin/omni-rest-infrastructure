import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { headers } from "next/headers";
import type { ApiProblem, Session } from "./auth-contract";
import { tenantHostOrNull } from "./tenant-host";
import type { PublicMenuResponse } from "./menu-contract";
import type { AdminMenu } from "./menu-admin-contract";
import type { AdminGallery } from "./gallery-admin-contract";
import type {
  AdminMediaAsset,
  AdminPublicAddress,
  AdminRestaurant,
  PublicGalleryResponse,
  PublicRestaurant,
} from "./restaurant-contract";

export type WebsiteDesignPreview = PublicMenuResponse & { restaurant: PublicRestaurant | null };

/**
 * The result of one server-side read.
 *
 * `problem` is additive: `status` and `data` keep the meanings every existing call site relies on.
 */
export type ServerResult<T> = Readonly<{ status: number; data: T | null; problem: ApiProblem | null }>;

/**
 * The result to use when the request never reached the API at all.
 *
 * `status: 0` is the same "no response" sentinel `lib/browser-api.ts` uses, so a page can tell an
 * outage apart from a `404` that genuinely means "nothing is set up here yet".
 */
export const UNREACHABLE_API: ServerResult<never> = Object.freeze({
  status: 0,
  data: null,
  problem: { code: "network_error" },
});

async function serverGet<T>(path: string): Promise<ServerResult<T>> {
  const incoming = await headers();
  const url = new URL(path, process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279");
  // A request that carries no usable `Host` resolves to no restaurant at all. Substituting a default
  // would serve one tenant's data to every unaddressed request, so this fails closed with the same
  // `404` the backend returns for an unknown host, without contacting the API.
  const host = tenantHostOrNull(incoming.get("host"));
  if (!host) return { status: 404, data: null, problem: { status: 404, code: "restaurant_not_found" } };
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: { accept: "application/json", cookie: incoming.get("cookie") ?? "", host },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      // Paired with the `request` listener below. Without it a fault arriving after the response
      // headers — including one raised by destroying the response — left this promise unsettled.
      response.on("error", reject);
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        const text = Buffer.concat(chunks).toString("utf8");
        // The error body used to be thrown away, so `code` and `detail` never reached the UI and
        // every non-2xx looked identical to the caller.
        if (status < 200 || status >= 300) return resolve({ status, data: null, problem: readProblem(status, text) });
        try { resolve({ status, data: JSON.parse(text) as T, problem: null }); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error("API request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

/**
 * Reads an `application/problem+json` error body, falling back to the bare status.
 *
 * A failing API is exactly the case where the body is least likely to be well-formed JSON, so a
 * parse failure must never become a second, worse error on top of the first.
 */
function readProblem(status: number, text: string): ApiProblem {
  try {
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null) return { status };
    const { code, title, detail, errors } = parsed as ApiProblem;
    return { status, code, title, detail, errors };
  } catch {
    return { status };
  }
}

export const getSession = () => serverGet<Session>("/api/v1/auth/session");
export const getAdminRestaurant = () => serverGet<AdminRestaurant>("/api/v1/admin/restaurant");
export const getAdminPreview = () => serverGet<PublicRestaurant>("/api/v1/admin/restaurant/preview");
export const getAdminWebsiteDesignPreview = (designId: string) =>
  serverGet<WebsiteDesignPreview>(`/api/v1/admin/website-designs/${encodeURIComponent(designId)}/preview`);
export const getAdminMediaAssets = () => serverGet<AdminMediaAsset[]>("/api/v1/admin/media-assets");
export const getAdminMenu = () => serverGet<AdminMenu>("/api/v1/admin/menu");
export const getAdminGallery = () => serverGet<AdminGallery>("/api/v1/admin/gallery");
export const getAdminPublicAddress = () => serverGet<AdminPublicAddress>("/api/v1/admin/restaurant/public-address");
export const getPublicRestaurant = () => serverGet<PublicRestaurant>("/api/v1/public/restaurant");
export const getPublicGallery = () => serverGet<PublicGalleryResponse>("/api/v1/public/restaurant/gallery");
