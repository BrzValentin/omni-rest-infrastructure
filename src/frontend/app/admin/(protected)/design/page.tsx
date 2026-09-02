import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { DesignSelector } from "@/components/admin/DesignSelector";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import { getAdminRestaurant, UNREACHABLE_API } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const [result, requestHeaders] = await Promise.all([
    getAdminRestaurant().catch(() => UNREACHABLE_API),
    headers(),
  ]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return <AdminUnavailable reason={result.status === 404 ? "empty" : "unavailable"} section="admin.section.design" />;
  }
  return <DesignSelector initial={result.data} />;
}
