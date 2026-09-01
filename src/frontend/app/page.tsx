import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/JsonLd";
import { HomeDesignRenderer } from "@/components/designs/HomeDesignRenderer";
import { buildRestaurantSchema } from "@/lib/json-ld";
import { readRestaurant, readSiteForSchema } from "@/lib/public-data";
import { publicPageMetadata, siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const restaurant = await readRestaurant();
  if (!restaurant) notFound();
  return publicPageMetadata("/", {
    title: restaurant.name,
    description: restaurant.shortDescription ?? `Restaurant information and digital menu for ${restaurant.name}.`,
  });
}

export default async function Home() {
  const restaurant = await readRestaurant();
  // A host that resolves to no published restaurant has no home page. The check runs before any
  // suspending boundary, so this is a real 404 rather than a soft one (specifications/phase-6/README.md
  // ruling 12) — and it is what keeps an unresolved host from rendering a page under some other
  // restaurant's branding (PR-20 Task 6).
  if (!restaurant) notFound();
  // `hasMenu` must only be emitted when the URL leads somewhere, so the schema needs to know whether a
  // menu is published. Both reads are request-memoized, so this costs no extra round trip.
  const site = await readSiteForSchema();
  const origin = await siteOrigin();

  return (
    <>
      <JsonLd
        nodes={[buildRestaurantSchema(origin, restaurant, { hasPublishedMenu: site?.menu != null })]}
      />
      <HomeDesignRenderer designId={restaurant.websiteDesignId} restaurant={restaurant} />
    </>
  );
}
