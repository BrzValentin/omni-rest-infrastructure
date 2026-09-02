import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { RestaurantPreview } from "@/components/admin/RestaurantPreview";
import { getAdminPreview, UNREACHABLE_API } from "@/lib/server-api";
import { safeAdminReturnPath } from "@/lib/auth-contract";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { robots: { index: false, follow: false, nocache: true } };

export default async function PreviewPage() {
  const [result, requestHeaders] = await Promise.all([
    getAdminPreview().catch(() => UNREACHABLE_API),
    headers(),
  ]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return <AdminUnavailable reason={result.status === 404 ? "empty" : "unavailable"} section="admin.section.preview" />;
  }
  return <RestaurantPreview restaurant={result.data} />;
}
