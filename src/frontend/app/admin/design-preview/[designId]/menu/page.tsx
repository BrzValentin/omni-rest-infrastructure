import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { AdminUnavailable } from "@/components/admin/AdminUnavailable";
import { MenuDesignRenderer } from "@/components/designs/MenuDesignRenderer";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import { isWebsiteDesignId } from "@/lib/restaurant-contract";
import { getAdminWebsiteDesignPreview, UNREACHABLE_API } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft menu design preview",
  robots: { index: false, follow: false },
};

export default async function DesignMenuPreviewPage({
  params,
}: Readonly<{ params: Promise<{ designId: string }> }>) {
  const [{ designId }, requestHeaders] = await Promise.all([params, headers()]);
  if (!isWebsiteDesignId(designId)) notFound();

  const result = await getAdminWebsiteDesignPreview(designId).catch(() => UNREACHABLE_API);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  // Only a real `404` means this design does not exist. Collapsing every non-200 into `notFound()`
  // told the owner a design was gone whenever the backend was merely having a bad minute.
  if (result.status === 404) notFound();
  if (!result.data) return <AdminUnavailable reason="unavailable" section="admin.section.designPreview" />;

  return <MenuDesignRenderer designId={designId} site={result.data} />;
}
