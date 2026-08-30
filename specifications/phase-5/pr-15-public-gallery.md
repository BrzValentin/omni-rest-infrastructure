# PR-15 — Public Gallery (visitor)

**Source:** `requirments/Phase 5/Phase_5_PR-15_Public_Gallery.md`

**Normalization rulings:** `specifications/phase-5/README.md` section 2

PR-15 Task 1 (data model) is delivered by `pr-16-gallery-management.md` section 1 — one table serves both PRs
(README ruling 1). This document covers the public read path and the visitor experience.

## 1. Snapshot projection

`RestaurantPublicProjectionBuilder.Build` gains a `gallery` array, so the gallery travels inside the publication
snapshot and inherits its `ETag` and cache semantics (README ruling 5).

```csharp
public sealed record PublicGalleryImage(
    string Id,
    string ImageUrl,
    string ThumbnailUrl,
    string AltText,
    string? Caption,
    int Width,
    int Height,
    int ThumbnailWidth,
    int ThumbnailHeight);
```

`PublicRestaurantResponse` gains `IReadOnlyList<PublicGalleryImage> Gallery` before the trailing optional
`WebsiteDesignId` parameter (it must stay last so existing positional construction keeps compiling — add `Gallery`
as a required positional parameter ahead of it and fix the call sites).

Projection rules:

- include only `is_active = true` rows;
- order by `display_order`, then `id`;
- `ThumbnailUrl` is the variant with the smallest width, `ImageUrl` the variant with the largest; when an asset has
  a single variant both point at it;
- an asset whose `processing_status` is not `ready`, or that has no variants, is skipped rather than published with
  a broken URL;
- media host validation reuses the existing `PublicMenuOptions.AllowedMediaHosts` check applied to dish media.

Because the projection is snapshot-based, a gallery change reaches the public site through the normal publication
dispatch — no separate cache invalidation.

## 2. Public API (PR-15 Task 2)

```http
GET /api/v1/public/restaurant/gallery
```

Mapped in `PublicRestaurantEndpoints`, `AllowAnonymous`, resolving the restaurant from the request host through
`IPublicMenuReader` exactly as `GET /api/v1/public/restaurant` does.

```csharp
public sealed record PublicGalleryResponse(
    string PublicationVersion,
    IReadOnlyList<PublicGalleryImage> Images);
```

| Case | Result |
| --- | --- |
| Restaurant resolved | `200` with `ETag` and `Cache-Control: public, max-age=0, must-revalidate` |
| `If-None-Match` matches the publication `ETag` | `304` |
| Host resolves to no published restaurant | `404 public_restaurant_not_found` |
| Restaurant has no active photos | `200` with `images: []` — an empty gallery is not an error |

PR-15 Task 2's `{restaurantId}` path parameter is dropped per README ruling 3; the id is still present in the
payload of `GET /api/v1/public/restaurant`.

## 3. Frontend contract

`src/frontend/lib/restaurant-contract.ts`:

```ts
export type GalleryPhoto = Readonly<{
  id: string;
  imageUrl: string;
  thumbnailUrl: string;
  altText: string;
  caption: string | null;
  width: number;
  height: number;
  thumbnailWidth: number;
  thumbnailHeight: number;
}>;
```

`PublicRestaurant` gains `gallery: readonly GalleryPhoto[]`. Treat it defensively — every consumer must tolerate
`undefined` from an older snapshot (`restaurant.gallery ?? []`).

`src/frontend/lib/server-api.ts` gains `getPublicGallery()` -> `{ status, data: PublicGalleryResponse | null }`,
following the existing one-line `serverGet` pattern. The public home page does **not** call it — the gallery arrives
with `getPublicRestaurant()`. It exists for the dedicated route and for tests.

## 4. `DesignGallery` component (PR-15 Tasks 3–9)

New client component `src/frontend/components/designs/shared/DesignGallery.tsx`, following the
`DesignMenuBrowser` precedent: `"use client"`, props `{ photos, classes, headingId, restaurantName }`, with an
exported `DesignGalleryClasses` readonly type. It is rendered by all five Home designs.

### 4.1 Thumbnail grid (Task 3)

- `<section className={classes.gallerySection} aria-labelledby={headingId}>` with an `<h2 id={headingId}>Gallery</h2>`.
- `<ul className={classes.galleryGrid}>` of `<li>`; each tile is a `<button type="button">` so it is focusable and
  activates on Enter and Space for free.
- Tiles use `next/image` with `unoptimized` and the identity `loader` (the `/media/` URLs are same-origin and
  already sized — this is the established admin idiom), explicit `width`/`height` from `thumbnailWidth`/
  `thumbnailHeight`, and a fixed `aspect-ratio` frame so tiles are uniform without distorting the image
  (`object-fit: cover`). This is the `DishMedia` frame idiom.
- The grid is responsive via CSS only: `grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr))`.
- Empty state: the section renders `<p>No photos available.</p>` (Task 6's exact copy) when `photos` is empty **and**
  the component was asked to render. On the public home page the section is not rendered at all when the gallery is
  empty (Task 10); the empty copy is what the dedicated gallery view shows.

### 4.2 Loading and error states (Tasks 6 and 9)

- Each tile holds a `loaded` flag; until the thumbnail's `onLoad` fires, a `classes.gallerySkeleton` placeholder is
  shown in the frame. `@media (prefers-reduced-motion: reduce)` disables the shimmer.
- `onError` on any image flips that tile to a placeholder — `<div role="img" aria-label={`${altText}: image unavailable`}><span aria-hidden="true">◇</span></div>` —
  matching `DishMedia`'s failure idiom. A failed tile stays in the grid and stays clickable-disabled; the rest of the
  gallery keeps working (Task 9).
- Image failures are reported once per photo through `console.warn` so they surface in the browser console without
  spamming (Task 9 "Errors logged").
- The viewer shows its own skeleton until the full-size image loads, and the same placeholder if it fails.

### 4.3 Full-screen viewer (Tasks 4, 5, 8)

Copy the modal implementation from `CategoryManager`'s `DeleteCategoryDialog`, which is this repo's only focus-trap
modal and the bar the accessibility tests enforce:

- rendered through `createPortal(..., document.body)`;
- `role="dialog"`, `aria-modal="true"`, `aria-label={`Photo ${index + 1} of ${photos.length}`}`;
- on mount, set `inert` and `aria-hidden="true"` on every `document.body` child that does not contain the dialog,
  restore on unmount;
- move focus to the close button on open, restore focus to the originating thumbnail on close;
- hand-rolled Tab/Shift+Tab trap over enabled buttons.

Viewer contents: the full-size image (`imageUrl`, `width`/`height`, `alt={altText}`), the caption in a
`<figcaption>` when present, a Close button, and Previous/Next buttons.

Navigation (Task 5):

| Input | Behaviour |
| --- | --- |
| `ArrowRight` / Next button | next photo |
| `ArrowLeft` / Previous button | previous photo |
| `Escape` | close |
| `Home` / `End` | first / last photo |
| Touch swipe left / right | next / previous |

Navigation is **clamped, not wrapping** — Task 5 requires it to "stay within bounds". Previous is disabled on the
first photo and Next on the last. Swipe uses `onTouchStart`/`onTouchEnd` with a 40 px horizontal threshold and a
guard that the vertical delta is smaller than the horizontal one, so vertical scrolling is never hijacked. Keyboard
handling is bound on the dialog element, not on `window`.

A `role="status" aria-live="polite"` region announces `Photo {n} of {total}` on every change so screen-reader users
track navigation.

### 4.4 Performance (Task 7)

- Grid tiles load thumbnails only; the full-size `imageUrl` is never referenced until the viewer opens, so the
  browser does not fetch it (Task 7 "Full-size loaded only when opened").
- Tiles after the first row set `loading="lazy"`; the first four set `loading="eager"`.
- Caching is the media proxy's existing `Cache-Control: public, max-age=3600` (`app/media/[...path]/route.ts`) — no
  change needed, but the spec records it as the mechanism satisfying "Cache reused".
- The viewer preloads only the immediate neighbours of the current photo.
- `DesignGallery` is imported directly by the Home designs, so it lands in the home route chunk.
  `scripts/assert-design-assets.mjs` asserts the home manifest excludes the *menu* browser chunks; adding a gallery
  chunk to the home route does not violate that, but the script must be re-run after the change.

## 5. Design integration (Task 10)

1. Add the gallery keys to `createDesignClassNames` in
   `src/frontend/components/designs/shared/designClassNames.ts`: `gallerySection`, `galleryHeading`, `galleryGrid`,
   `galleryItem`, `galleryThumbButton`, `galleryFrame`, `galleryImage`, `gallerySkeleton`, `galleryFallback`,
   `galleryEmpty`, `lightboxBackdrop`, `lightbox`, `lightboxFigure`, `lightboxImage`, `lightboxCaption`,
   `lightboxNav`, `lightboxNavButton`, `lightboxClose`, `lightboxCounter`. One edit serves all five designs.
2. Render the section in each of `QuietEleganceHome`, `NightfallHome`, `BroadsheetHome`, `SunroomHome`, and
   `LegacyHome`, inside the existing `{restaurant ? (<>…</>) : null}` block, guarded by
   `{photos.length > 0 && <DesignGallery … />}` so an empty gallery hides the section entirely (Task 10).
   Heading ids follow each design's existing convention: `quiet-gallery`, `night-gallery`, `sheet-gallery`,
   `sun-gallery`, `legacy-gallery`.
3. Add `.<design-id>__gallery*` and `.<design-id>__lightbox*` rules to **all five**
   `src/frontend/public/design-previews/styles/*.css` files, each with its own palette, in the existing flat
   single-line house style. `scripts/assert-design-assets.mjs` enforces the prefix rule and that the five files stay
   byte-distinct, so the rules must not be copy-pasted identically across files.
4. No new public nav entry is added. `bugs/AGENT-FIX-PLAN.md:663` records that a second public nav item turns the
   missing mobile collapsible nav into a real defect; the gallery is a section on the existing home page, so that
   defect is not triggered. A dedicated gallery route is explicitly out of Phase 5 scope.

## 6. Tests

`src/frontend/components/designs/DesignGallery.test.tsx`:

- renders every photo as a thumbnail using `thumbnailUrl`, never `imageUrl`;
- the empty gallery renders `No photos available.`;
- clicking a thumbnail opens the dialog showing `imageUrl` and the caption;
- `ArrowRight`, `ArrowLeft`, `Home`, `End` navigate; navigation clamps at both ends;
- `Escape` closes and focus returns to the originating thumbnail;
- Tab is trapped inside the dialog;
- a thumbnail `error` event swaps in the placeholder and leaves the other tiles intact;
- `axe.run(container)` reports no violations, with the dialog both closed and open.

`src/frontend/components/designs/DesignRenderers.test.tsx` (existing) gains cases asserting each Home renders the
gallery section when photos are present and omits it when the gallery is empty or absent.

`src/frontend/test/fixtures.ts` gains a `galleryPhotos` fixture and `ordinaryRestaurant` gains a `gallery` array.

Backend integration, in `MenuApiTests` or a new `PublicGalleryApiTests`: the public endpoint returns only active
photos in `display_order`; `If-None-Match` yields `304`; an unknown host yields `404`; a restaurant with no photos
yields `200` with an empty list; a gallery change republishes and the public response changes with it.
