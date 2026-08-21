import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

import { HomeDesignRenderer } from "@/components/designs/HomeDesignRenderer";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import { isWebsiteDesignId } from "@/lib/restaurant-contract";
import { getAdminWebsiteDesignPreview } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Draft home design preview",
  robots: { index: false, follow: false },
};

export default async function DesignHomePreviewPage({
  params,
}: Readonly<{ params: Promise<{ designId: string }> }>) {
  const [{ designId }, requestHeaders] = await Promise.all([params, headers()]);
  if (!isWebsiteDesignId(designId)) notFound();

  const result = await getAdminWebsiteDesignPreview(designId);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (result.status === 404 || !result.data) notFound();

  return (
    <HomeDesignRenderer
      designId={designId}
      restaurant={result.data.restaurant}
    />
  );
}
