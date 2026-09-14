/**
 * The Google Maps embed URL for a restaurant's location (PR-2 Task 2.10, BUG-003).
 *
 * Two forms, chosen by whether the deployment has configured a key:
 *
 * - **With `GOOGLE_MAPS_EMBED_API_KEY`**: the documented Maps Embed API
 *   (`/maps/embed/v1/place`). This is what the Phase 1 specification asks for, and what production
 *   should run. The key ends up in the iframe `src`, so it must be restricted to the site's HTTP
 *   referrers in Google Cloud — that restriction is the security control, not secrecy.
 * - **Without a key**: Google's keyless `?output=embed` URL, so the map still renders in local
 *   development and demos. Google does not document this form and may withdraw it; if it stops
 *   working the page loses only the map, because the address and the Directions link are rendered
 *   independently of it.
 *
 * Coordinates only, never the address string. Task 2.10 says so outright — "Use coordinates. If
 * unavailable, display the address only." — and it is also the more correct choice: a geocoded
 * address can place the marker on the wrong side of a block, and "the marker is accurate" is the
 * acceptance criterion.
 *
 * Pure and free of `server-only` so it can be unit tested; the key is read by the caller.
 */

export type MapCoordinates = Readonly<{ latitude: number | null; longitude: number | null }>;

/** Street level: close enough to find the door, wide enough to recognise the neighbourhood. */
const zoom = 16;

/** Returns the embed URL, or `null` when there is nothing accurate to point a marker at. */
export function mapEmbedUrl(location: MapCoordinates | null | undefined, apiKey?: string | null): string | null {
  const latitude = location?.latitude;
  const longitude = location?.longitude;
  if (!isCoordinate(latitude, 90) || !isCoordinate(longitude, 180)) return null;

  const query = `${latitude},${longitude}`;
  const key = apiKey?.trim();
  if (key) {
    const params = new URLSearchParams({ key, q: query, zoom: String(zoom) });
    return `https://www.google.com/maps/embed/v1/place?${params.toString()}`;
  }
  const params = new URLSearchParams({ q: query, z: String(zoom), output: "embed" });
  return `https://www.google.com/maps?${params.toString()}`;
}

/**
 * `0` is a real coordinate (the equator, the prime meridian), so this checks finiteness and range
 * rather than truthiness — a truthy check would silently drop a restaurant in Accra.
 */
function isCoordinate(value: number | null | undefined, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}
