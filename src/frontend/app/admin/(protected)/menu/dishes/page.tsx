import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { DishManager } from "@/components/admin/DishManager";
import { getAdminMediaAssets, getAdminMenu } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

export default async function DishesPage() {
  const [result, media, requestHeaders] = await Promise.all([getAdminMenu(), getAdminMediaAssets(), headers()]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return <main id="main-content"><h1>Dish editor unavailable</h1><p>Try again in a few minutes.</p></main>;
  }
  return <DishManager initial={result.data} initialMedia={media.data ?? []} />;
}
