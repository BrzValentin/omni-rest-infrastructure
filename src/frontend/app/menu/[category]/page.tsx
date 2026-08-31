import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { JsonLd } from "@/components/JsonLd";
import { MenuDesignRenderer } from "@/components/designs/MenuDesignRenderer";
import { buildMenuSection, prune } from "@/lib/json-ld";
import type { PublicMenuResponse } from "@/lib/menu-contract";
import { readSite } from "@/lib/public-data";
import { publicPageMetadata, siteOrigin } from "@/lib/seo";

export const dynamic = "force-dynamic";

type CategoryPageProps = Readonly<{ params: Promise<{ category: string }> }>;

/**
 * Resolves one published category, or `null`.
 *
 * A category that is not in the published snapshot does not exist as far as the public site is
 * concerned, whether it was never published or has since been unpublished. Both cases are a `404`.
 */
async function readCategory(slugParam: string) {
  const site = await readSite();
  if (!site?.menu) return null;
  const slug = decodeURIComponent(slugParam);
  const category = site.menu.categories.find((item) => item.slug === slug);
  return category ? { site, category } : null;
}

export async function generateMetadata({ params }: CategoryPageProps): Promise<Metadata> {
  const resolved = await readCategory((await params).category);
  if (!resolved) notFound();
  const { site, category } = resolved;
  return publicPageMetadata(`/menu/${category.slug}`, {
    title: `${category.name} | Menu | ${site.restaurantName}`,
    description: category.description
      ?? `${category.name} on the menu at ${site.restaurantName}.`,
  });
}

export default async function MenuCategoryPage({ params }: CategoryPageProps) {
  const resolved = await readCategory((await params).category);
  // Runs before any suspending boundary, so this is a real 404 and not a soft one
  // (specifications/phase-6/README.md ruling 12).
  if (!resolved) notFound();
  const { site, category } = resolved;
  const origin = await siteOrigin();

  // The whole design system is reused by narrowing the payload to a single category. Because
  // `DesignMenuBrowser` only hides panels when more than one category is present, every dish on this
  // page is visible to a crawler that executes JavaScript — which is precisely the indexing weakness
  // that `/menu` has and this route exists to resolve (README ruling 6).
  const scoped: PublicMenuResponse = {
    ...site,
    menu: site.menu ? { ...site.menu, categories: [category] } : null,
  };

  const breadcrumbs = prune({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: site.restaurantName, item: `${origin}/` },
      { "@type": "ListItem", position: 2, name: "Menu", item: `${origin}/menu` },
      { "@type": "ListItem", position: 3, name: category.name, item: `${origin}/menu/${category.slug}` },
    ],
  });

  return (
    <>
      <JsonLd
        nodes={[
          prune({
            "@context": "https://schema.org",
            ...buildMenuSection(origin, category, site.currency),
          }),
          breadcrumbs,
        ]}
      />
      <MenuDesignRenderer designId={site.websiteDesignId} site={scoped} />
    </>
  );
}
