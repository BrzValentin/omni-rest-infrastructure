import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { MenuDesignRenderer } from "@/components/designs/MenuDesignRenderer";
import { getPublicMenu, PublicMenuApiError } from "@/lib/menu-api";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Menu | Omni REST",
  description: "Browse the restaurant's current published menu.",
};

export default async function MenuPage() {
  let response;
  try {
    response = await getPublicMenu();
  } catch (error) {
    if (error instanceof PublicMenuApiError && error.status === 404) notFound();
    throw error;
  }

  return <MenuDesignRenderer designId={response.websiteDesignId} site={response} />;
}
