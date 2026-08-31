import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/JsonLd";
import { MenuDesignRenderer } from "@/components/designs/MenuDesignRenderer";
import { buildMenuSchema } from "@/lib/json-ld";
import { readSite } from "@/lib/public-data";
import { publicPageMetadata, siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const site = await readSite();
  if (!site) notFound();
  return publicPageMetadata("/menu", {
    title: `Menu | ${site.restaurantName}`,
    description: site.menu
      ? `Browse the current published menu at ${site.restaurantName}.`
      : `${site.restaurantName} has not published a menu yet.`,
  });
}

export default async function MenuPage() {
  const site = await readSite();
  // An unresolvable host is a real 404. The check runs before any suspending boundary, so the status
  // is a genuine 404 rather than a soft one — see specifications/phase-6/README.md ruling 12.
  if (!site) notFound();

  const origin = await siteOrigin();
  return (
    <>
      {site.menu ? (
        <JsonLd nodes={[buildMenuSchema(origin, site.menu, site.currency, site.restaurantName)]} />
      ) : null}
      <MenuDesignRenderer designId={site.websiteDesignId} site={site} />
    </>
  );
}
