import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { CategoryManager } from "@/components/admin/CategoryManager";
import { getAdminMenu, UNREACHABLE_API } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";

export default async function MenuPage() {
  // A transport fault used to escape to the root boundary, which carries no portal chrome at all.
  const [result, requestHeaders] = await Promise.all([
    getAdminMenu().catch(() => UNREACHABLE_API),
    headers(),
  ]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  // Only a `404` means "no menu exists yet"; every other failure is the backend, not the owner.
  if (!result.data) {
    return <AdminUnavailable reason={result.status === 404 ? "empty" : "unavailable"} section="admin.section.menu" />;
  }
  return <CategoryManager initial={result.data} />;
}
