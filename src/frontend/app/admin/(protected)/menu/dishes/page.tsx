import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { DishManager } from "@/components/admin/DishManager";
import { getAdminMediaAssets, getAdminMenu, UNREACHABLE_API } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

export default async function DishesPage() {
  const [result, media, requestHeaders] = await Promise.all([
    getAdminMenu().catch(() => UNREACHABLE_API),
    getAdminMediaAssets().catch(() => UNREACHABLE_API),
    headers(),
  ]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return <AdminUnavailable reason={result.status === 404 ? "empty" : "unavailable"} section="admin.section.dishes" />;
  }
  return <DishManager initial={result.data} initialMedia={media.data ?? []} />;
}
