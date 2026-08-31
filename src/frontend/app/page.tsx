import type { Metadata } from "next";

import { JsonLd } from "@/components/JsonLd";
import { HomeDesignRenderer } from "@/components/designs/HomeDesignRenderer";
import { buildRestaurantSchema } from "@/lib/json-ld";
import { readRestaurant, readSite } from "@/lib/public-data";
import { publicPageMetadata, siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const restaurant = await readRestaurant();
  return publicPageMetadata("/", {
    title: restaurant?.name ?? "Omni REST",
    description: restaurant?.shortDescription ?? "Public restaurant information and digital menu.",
  });
}

export default async function Home() {
  const restaurant = await readRestaurant();
  // `hasMenu` must only be emitted when the URL leads somewhere, so the schema needs to know whether a
  // menu is published. Both reads are request-memoized, so this costs no extra round trip.
  const site = await readSite();
  const origin = await siteOrigin();

  return (
    <>
      {restaurant ? (
        <JsonLd
          nodes={[buildRestaurantSchema(origin, restaurant, { hasPublishedMenu: site?.menu != null })]}
        />
      ) : null}
      <HomeDesignRenderer designId={restaurant?.websiteDesignId} restaurant={restaurant} />
    </>
  );
}
