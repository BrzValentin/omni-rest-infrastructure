import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { RestaurantEditor } from "@/components/admin/RestaurantEditor";
import { getAdminMediaAssets, getAdminRestaurant } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

export default async function RestaurantPage() {
  const [result, media, requestHeaders] = await Promise.all([getAdminRestaurant(), getAdminMediaAssets(), headers()]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return <main id="main-content"><h1>Restaurant editor unavailable</h1><p>Try again in a few minutes.</p></main>;
  }
  return <RestaurantEditor initial={result.data} initialMedia={media.data ?? []} />;
}
