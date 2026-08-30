import "server-only";

import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import { headers } from "next/headers";
import type { Session } from "./auth-contract";
import type { PublicMenuResponse } from "./menu-contract";
import type { AdminMenu } from "./menu-admin-contract";
import type { AdminGallery } from "./gallery-admin-contract";
import type {
  AdminMediaAsset,
  AdminRestaurant,
  PublicGalleryResponse,
  PublicRestaurant,
} from "./restaurant-contract";

export type WebsiteDesignPreview = PublicMenuResponse & { restaurant: PublicRestaurant | null };

async function serverGet<T>(path: string): Promise<{ status: number; data: T | null }> {
  const incoming = await headers();
  const url = new URL(path, process.env.OMNI_REST_API_BASE_URL ?? "http://127.0.0.1:5279");
  const host = incoming.get("host")?.split(":", 1)[0] ?? "menu.localhost";
  return new Promise((resolve, reject) => {
    const request = (url.protocol === "https:" ? httpsRequest : httpRequest)(url, {
      method: "GET",
      headers: { accept: "application/json", cookie: incoming.get("cookie") ?? "", host },
    }, (response) => {
      const chunks: Buffer[] = [];
      response.on("data", (chunk: Buffer) => chunks.push(chunk));
      response.on("end", () => {
        const status = response.statusCode ?? 502;
        if (status < 200 || status >= 300) return resolve({ status, data: null });
        try { resolve({ status, data: JSON.parse(Buffer.concat(chunks).toString("utf8")) as T }); }
        catch (error) { reject(error); }
      });
    });
    request.setTimeout(10_000, () => request.destroy(new Error("API request timed out.")));
    request.on("error", reject);
    request.end();
  });
}

export const getSession = () => serverGet<Session>("/api/v1/auth/session");
export const getAdminRestaurant = () => serverGet<AdminRestaurant>("/api/v1/admin/restaurant");
export const getAdminPreview = () => serverGet<PublicRestaurant>("/api/v1/admin/restaurant/preview");
export const getAdminWebsiteDesignPreview = (designId: string) =>
  serverGet<WebsiteDesignPreview>(`/api/v1/admin/website-designs/${encodeURIComponent(designId)}/preview`);
export const getAdminMediaAssets = () => serverGet<AdminMediaAsset[]>("/api/v1/admin/media-assets");
export const getAdminMenu = () => serverGet<AdminMenu>("/api/v1/admin/menu");
export const getAdminGallery = () => serverGet<AdminGallery>("/api/v1/admin/gallery");
export const getPublicRestaurant = () => serverGet<PublicRestaurant>("/api/v1/public/restaurant");
export const getPublicGallery = () => serverGet<PublicGalleryResponse>("/api/v1/public/restaurant/gallery");
