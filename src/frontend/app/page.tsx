import { HomeDesignRenderer } from "@/components/designs/HomeDesignRenderer";
import { getPublicRestaurant } from "@/lib/server-api";

export const dynamic = "force-dynamic";

export default async function Home() {
  const result = await getPublicRestaurant().catch(() => ({ status: 503, data: null }));
  const restaurant = result.data;
  return (
    <HomeDesignRenderer
      designId={restaurant?.websiteDesignId}
      restaurant={restaurant}
    />
  );
}
