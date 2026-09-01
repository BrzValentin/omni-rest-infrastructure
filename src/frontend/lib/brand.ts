import type { MediaVariant, PublicImage } from "./restaurant-contract";

/**
 * Restaurant branding helpers.
 *
 * Phase 6 added `logo` to the published snapshot but nothing ever rendered it — it reached the JSON-LD
 * and stopped there. PR-20 Task 6 requires branding to be restaurant-specific on the page itself, so
 * every design now shows the tenant's logo where the platform used to print a fixed brand mark.
 *
 * Both helpers degrade rather than fail: a pre-Phase-6 snapshot has `logo: null`, and a snapshot may
 * carry a logo whose variants are still processing.
 */

/**
 * The smallest usable variant of a logo, or `null`.
 *
 * A brand mark is rendered at roughly 2.5rem, so the smallest variant is the right source — unlike the
 * hero image, which takes the largest. Variants are not guaranteed to be ordered, so this compares
 * rather than indexing.
 */
export function brandLogoVariant(logo: PublicImage | null | undefined): MediaVariant | null {
  return logo?.variants.reduce<MediaVariant | null>(
    (smallest, variant) => (!smallest || variant.width < smallest.width ? variant : smallest),
    null,
  ) ?? null;
}

/**
 * Up to two initials for a restaurant name, used as the brand mark when no logo is published.
 *
 * This replaces the hardcoded `OR` glyph. On a multi-tenant platform a fixed glyph is another
 * restaurant's mark on every site that has not uploaded a logo.
 */
export function brandInitials(name: string | null | undefined): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((word) => [...word][0]?.toUpperCase() ?? "").join("");
}
