import type { SocialPlatform } from "./restaurant-contract";

/**
 * The hosts each social platform's links may point at.
 *
 * This mirrors `SocialHosts` in `src/backend/OmniRest.Api/Restaurants/RestaurantValidation.cs`, and
 * the backend remains the authority: it validates every saved link against its own copy. The
 * frontend copy exists only so the editor can recognise which platform a pasted URL belongs to
 * (BUG-006) — it never decides whether a link is acceptable.
 */
const SOCIAL_HOSTS: Readonly<Record<SocialPlatform, readonly string[]>> = {
  instagram: ["instagram.com", "www.instagram.com"],
  facebook: ["facebook.com", "www.facebook.com"],
  tiktok: ["tiktok.com", "www.tiktok.com"],
  google_business: ["google.com", "www.google.com", "maps.google.com", "maps.app.goo.gl"],
  x: ["x.com", "www.x.com", "twitter.com", "www.twitter.com"],
  youtube: ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"],
  linkedin: ["linkedin.com", "www.linkedin.com"],
};

/**
 * The one platform whose hosts include this URL's hostname, or null when there is none.
 *
 * Returns null for anything that does not parse as an absolute web URL, which is the normal state
 * of the field while the owner is still typing. The scheme is not checked here: whether the link is
 * https is the backend's call, and recognising the platform early is still the helpful thing to do.
 */
export function platformForUrl(url: string): SocialPlatform | null {
  let hostname: string;
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    hostname = parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
  const matches = (Object.keys(SOCIAL_HOSTS) as SocialPlatform[])
    .filter((platform) => SOCIAL_HOSTS[platform].includes(hostname));
  // The host lists do not overlap today; insisting on exactly one keeps a future overlap from
  // silently picking whichever platform happens to be listed first.
  return matches.length === 1 ? matches[0] : null;
}
