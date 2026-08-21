import { redirect } from "next/navigation";
import { headers } from "next/headers";

import { DesignSelector } from "@/components/admin/DesignSelector";
import { safeAdminReturnPath } from "@/lib/auth-contract";
import { getAdminRestaurant } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function DesignPage() {
  const [result, requestHeaders] = await Promise.all([getAdminRestaurant(), headers()]);
  if (result.status === 401 || result.status === 403) {
    const returnPath = safeAdminReturnPath(requestHeaders.get("x-omni-admin-return-path"));
    redirect(`/admin/login?returnPath=${encodeURIComponent(returnPath)}`);
  }
  if (!result.data) {
    return (
      <main id="main-content">
        <h1>Design selection unavailable</h1>
        <p>Try again in a few minutes.</p>
      </main>
    );
  }
  return <DesignSelector initial={result.data} />;
}
