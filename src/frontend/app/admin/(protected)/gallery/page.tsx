import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { GalleryManager } from "@/components/admin/GalleryManager";
import { getAdminGallery } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

export default async function GalleryPage() {
  const [result, requestHeaders] = await Promise.all([getAdminGallery(), headers()]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return <main id="main-content"><h1>Gallery editor unavailable</h1><p>Try again in a few minutes.</p></main>;
  }
  return <GalleryManager initial={result.data} />;
}
