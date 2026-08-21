---
title: Remediation Plan for Implementing Agent — Phase 1/2/3
source_report: Bug-Report-Phase-1-2-3.md
repo: BrzValentin/omni-rest-infrastructure
branch: feature/requirements-changes
head: 00b7be7
audited: 2026-08-19
open_defects: 29
tags: [agent-task, remediation, omni-rest]
---

# Remediation Plan — Agent Work Orders

You are fixing defects found in an audit of Phase 1–3 of this repository. Each **work order (WO)** below is self-contained: it names the exact files, the current behaviour, the required behaviour, and a machine-checkable "Done when".

## Rules

1. **One WO per commit.** Commit message: `fix(<area>): <WO-id> <short title>`.
2. **Do not start a WO whose `blocked_by` is unresolved.** The dependency graph is in §Execution order.
3. **Never mark a WO done without running its verification command.** If you cannot run it, say so explicitly and leave the WO open.
4. **Three WOs are decisions, not code** (WO-03, WO-04, WO-05). Do not implement them. Produce the written artefact and stop for human approval.
5. **Do not "fix" anything not listed here.** If you find a new defect, append it to §Newly discovered and continue.
6. Backend targets .NET 10 (`global.json` pins SDK `10.0.302`, `rollForward: disable`). Frontend targets Node `26.5.0` / npm `11.17.0`. Do not bump versions.
7. **Path warning:** `start-app.ps1` runs a **WSL-internal copy** at `$HOME/projects/omni-rest-infrastructure`. The canonical source is `C:\Work\Projects\Winnipeg restorans website\omni-rest-infrastructure`. Confirm which tree you are editing and keep them in sync, or every runtime check will be misleading.

## Global verification

Run after every WO. All must pass before the WO is closed.

```sh
# backend
dotnet build src/backend/OmniRest.sln
dotnet test  src/backend/OmniRest.sln

# frontend
cd src/frontend
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

---

# WAVE 1 — Quick wins (runtime-proven, small, no dependencies)

---

## WO-01 · Seeded dish images are served from a path that does not exist

- **id:** `WO-01` · **severity:** High · **defect:** BUG-022
- **status:** Fixed 2026-08-20 — seed media integration test and full backend suite passed
- **requirement:** PR-5 Task 8 — *"Images load correctly"*
- **blocked_by:** none

**Files**

| Path | Lines |
|---|---|
| `src/backend/OmniRest.Api/Infrastructure/GuardedSampleDataSeeder.cs` | 95, 160 |
| `src/backend/OmniRest.Api/Program.cs` | 132–138 (read-only, context) |

**Current behaviour**

The seeder writes media variant URLs under `/media/seed/`:

```csharp
// GuardedSampleDataSeeder.cs:95
Url = "/media/seed/poutine-640.webp",
// GuardedSampleDataSeeder.cs:160
Url = "/media/seed/alternate-private.webp",
```

But the API only serves static files under `PublicPathBase`, which defaults to `/media/uploads`:

```csharp
// Program.cs:133-138
app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(mediaRoot),
    RequestPath = mediaStorageOptions.PublicPathBase,   // "/media/uploads"
    ServeUnknownFileTypes = false
});
```

There is no `/media/seed` route and no such file anywhere in the repo. `GET /media/seed/poutine-640.webp` returns no valid response. `DishMedia.tsx` catches the failure via `onError` and renders a `◇` placeholder, which is why this was invisible in review.

**Required behaviour**

Every seeded dish and restaurant image resolves to a real HTTP 200 image response.

**Change**

1. Add real seed image files (WebP, 640×480, small) to the media root the API serves, e.g. `src/backend/OmniRest.Api/seed-media/`.
2. On seed, copy them into `mediaRoot` under a `seed/` subfolder so they resolve as `/media/uploads/seed/<name>.webp`.
3. Update both seeder URLs to the `/media/uploads/seed/...` form.
4. Confirm the URLs still satisfy `MenuValidation.IsSafeMediaUrl` — relative paths starting with a single `/` are allowed, so this holds.
5. Declared variant dimensions (`Width = 640, Height = 480`) must match the real files, otherwise `next/image` will letterbox.

**Do not** widen the static-file mapping to `/media` — that would expose the whole media root.

**Tests**

Add to `src/backend/OmniRest.Api.Tests/Integration/MenuApiTests.cs`: after seeding, assert that every `variant.url` in the public menu response returns 200 with an `image/*` content type.

**Done when**

- [ ] `curl -I http://menu.localhost:3000/media/uploads/seed/poutine-640.webp` → `200`, `content-type: image/webp`
- [ ] `/menu` shows photographs for seeded dishes, no `◇` placeholder
- [ ] New integration test passes

---

## WO-02 · Hero image is not marked `priority`

- **id:** `WO-02` · **severity:** Medium · **defect:** BUG-024
- **requirement:** PR-4 Task 11 (Responsive Performance), PR-1 Task 1.3
- **blocked_by:** none

**Files:** `src/frontend/app/page.tsx:19`

- **status:** Fixed 2026-08-20 — hero priority renderer test and full frontend unit/build gates passed

**Current behaviour**

```tsx
{image && <Image className="homeImage" src={image.url} width={image.width} height={image.height} sizes="(max-width: 704px) 100vw, 704px" alt={restaurant?.mainImage?.altText ?? ""} />}
```

No `priority`, so Next.js lazy-loads the LCP element. Observed: the hero area renders as a ~490 px blank block for ~1–2 s after navigation. `DishMedia.tsx` already sets `priority` for the first dish — the home hero was simply missed.

**Change:** add `priority` to this `<Image>`. One prop. Do not change `sizes`.

**Done when**

- [ ] Rendered `<img>` has `fetchpriority="high"` and no `loading="lazy"`
- [ ] Hero photo is present in the first paint after navigation

---

## WO-03 · Public status never looks ahead to the next open day

- **id:** `WO-03` · **severity:** Medium · **defect:** BUG-023 (and closes BUG-010)
- **status:** Fixed 2026-08-20 — 27 status-calculator tests and full backend suite passed
- **requirement:** PR-2 Task 2.12 — required states are `Open Now`, `Closed`, `Opens at HH:mm`, `Closes at HH:mm`
- **blocked_by:** none

**Files:** `src/backend/OmniRest.Api/Restaurants/PublicRestaurantContracts.cs:194–221` (`RestaurantStatusCalculator.CalculateForCurrentDay`)

**Current behaviour**

Observed live on Wed 2026-08-19 at 17:41 local, with hours 09:00–17:00:

```json
"status": { "state": "closed", "label": "Closed", "nextChangeAt": null, "source": "regularHours" }
```

`CalculateForCurrentDay` iterates only **today's** intervals. It returns `"Opens at HH:mm"` when `time < opens`; otherwise it falls out of the loop and returns:

```csharp
// :220
return new PublicRestaurantStatus("closed", "Closed", null, source);
```

There is no look-ahead. Consequences:

- `"Opens at HH:mm"` is reachable only between midnight and today's first opening.
- From closing time until midnight, and on every fully closed day, the visitor gets a bare `"Closed"` with no `nextChangeAt`.
- `"Closes at HH:mm"` is never produced at all — the open branch always returns the literal `"Open now"` (`:209-210`).

**Required behaviour**

| Situation | `state` | `label` | `nextChangeAt` |
|---|---|---|---|
| Inside an interval | `open` | `Closes at HH:mm` | interval close instant |
| Before today's first opening | `closed` | `Opens at HH:mm` | today's opening instant |
| After today's last close, or a closed day | `closed` | `Opens at HH:mm` (next open day) | that opening instant |
| No open interval within the next 7 days | `closed` | `Closed` | `null` |

**Change**

1. In the open branch, replace the literal `"Open now"` with `$"Closes at {closes:HH\\:mm}"`. Keep `state = "open"`.
2. Add a `FindNextOpening(restaurant, localDate, timeZone)` helper that walks forward up to 7 days, applying the **same precedence as `Calculate`** — a special-hours record for a date overrides that weekday's regular hours, and `isClosed` means skip the day entirely.
3. When today yields no match, call it and return `("closed", $"Opens at {opens:HH\\:mm}", <instant>, <source of that day>)`.
4. If nothing is found in 7 days, keep the current `("closed", "Closed", null, source)`.
5. Reuse the existing `ToUtc` (`:223`) for all instants. Keep everything driven by the injected `TimeProvider` — no `DateTime.Now`.

**Warning:** `Calculate` (`:133`) also handles overnight continuation from the previous day via `CalculatePreviousDayContinuation` (`:176`). Do not regress that path — an interval whose `closesNextDay` is true must still report `open` in the early hours.

**Tests** — extend `src/backend/OmniRest.Api.Tests/Unit/RestaurantStatusCalculatorTests.cs`:

- after last close on a normal day → `Opens at 09:00`, `nextChangeAt` = tomorrow 09:00
- inside an interval → label starts with `Closes at`
- on a closed weekday → skips to the next open weekday
- next day is a special `isClosed` date → skips it, targets the day after
- next day is a special date with different hours → uses the special opening time
- no open interval in 7 days → `Closed`, `nextChangeAt` = `null`
- overnight interval before midnight and after midnight → both still `open` (regression guard)

**Done when**

- [ ] All new and existing `RestaurantStatusCalculatorTests` pass
- [ ] `GET /api/v1/public/restaurant` outside opening hours returns a non-null `nextChangeAt` and an `Opens at …` label
- [ ] While open, the label reads `Closes at …`

---

## WO-04 · Past special-hours dates are returned and displayed forever

- **id:** `WO-04` · **severity:** Medium · **defect:** BUG-027
- **requirement:** PR-3 Task 5 (Update Public Restaurant Availability)
- **blocked_by:** none

**Files**

- `src/backend/OmniRest.Api/Restaurants/PublicRestaurantContracts.cs:61-72` (`RestaurantPublicProjectionBuilder.Build`, the `special` projection)
- `src/frontend/app/page.tsx:34` (read-only, context)

**Current behaviour**

On 2026-08-19 the public API still returned `"specialHours": [ { "date": "2026-08-18", … } ]`, and the home page rendered a "Special hours" heading listing yesterday. The projection emits every row with no date filter. Only the **admin** endpoint supports `from`/`to` (`AdminRestaurantEndpoints.ReadSpecialHoursAsync`).

**Change**

Filter the public projection to `date >= today` in the restaurant's own time zone (`restaurant.Settings.TimeZoneId`), with a forward window of 180 days. Use the injected `TimeProvider` — it is already a constructor parameter of `RestaurantPublicProjectionBuilder`.

**Caution:** the status calculator reads `restaurant.SpecialHours` for **yesterday** to resolve overnight continuation (`CalculatePreviousDayContinuation`, `:165-172`). If you filter to `>= today`, that lookup breaks. Either include `today - 1` in the window, or filter at render time instead of in the projection. **Filtering at `today - 1` is the smaller change — prefer it.**

**Tests** — extend `MenuApiTests` / a projection test: a special date in the past is absent from the public response; today and future dates are present; an overnight interval on yesterday's special date still produces `open`.

**Done when**

- [ ] Public response contains no `specialHours` entry older than yesterday
- [ ] Overnight-continuation status tests still pass
- [ ] Home page shows no stale special dates

---

## WO-05 · SEO metadata: no Open Graph, no canonical, hardcoded title

- **id:** `WO-05` · **severity:** High · **defect:** BUG-002
- **requirement:** PR-1 Task 1.9 (all 4 acceptance criteria); spec `specifications/phase-1/pr-1-home-page.md:226-228`
- **blocked_by:** none

**Files**

| Path | Lines |
|---|---|
| `src/frontend/app/layout.tsx` | 6–9 |
| `src/frontend/app/page.tsx` | add `generateMetadata` |
| `src/frontend/app/menu/page.tsx` | 13–16 |

**Current behaviour**

Live DOM on `/`: `{ "title": "Omni REST", "ogCount": 0, "hasCanonical": false }` — while the restaurant is named **"Restaurant 1"**. `/menu` shows `"Menu | Omni REST"`. Both titles are static literals:

```ts
// layout.tsx:6-9
export const metadata: Metadata = {
  title: "Omni REST",
  description: "Public restaurant information and digital menu.",
};
```

**Required behaviour**

Per spec `pr-1-home-page.md:226`: use the Next.js Metadata API for title, description, canonical URL and Open Graph, derived from restaurant data.

**Change**

1. Replace the static export in `app/page.tsx` with `export async function generateMetadata()` that calls `getPublicRestaurant()` and returns:
   - `title` = restaurant name
   - `description` = `shortDescription`
   - `openGraph`: `title`, `description`, `type: "website"`, `url` (canonical), `images` = `mainImage` largest variant absolute URL
   - `alternates.canonical`
2. Do the same in `app/menu/page.tsx` — `"<Restaurant name> — Menu"`.
3. Set `metadataBase` in `layout.tsx` from a **validated deployment config** env var (e.g. `OMNI_REST_PUBLIC_ORIGIN`). Spec `:228` is explicit: *"never infer it from an untrusted forwarded host without platform validation."* Do **not** build the origin from the request `Host` header.
4. Keep `layout.tsx` metadata as a fallback only (used when the API is unreachable).
5. When the restaurant fetch fails, fall back to the current static values rather than throwing — `page.tsx:12` already `.catch()`es this.

**Tests:** a component/unit test asserting `generateMetadata` maps restaurant fields correctly and degrades safely on a failed fetch. Add a Playwright assertion in `e2e/restaurant.spec.ts` that `og:title` and `link[rel=canonical]` exist on `/`.

**Done when**

- [ ] `document.title` on `/` equals the restaurant name
- [ ] `document.querySelectorAll('meta[property^="og"]').length > 0`
- [ ] `link[rel=canonical]` present on `/` and `/menu`
- [ ] Canonical origin comes from config, not from the `Host` header

---

# WAVE 2 — Decisions (produce a document, do not write code)

> **Stop after each. These need human approval before any implementation.**

---

## WO-06 · PR-9 requirements document is truncated

- **id:** `WO-06` · **severity:** Medium · **defect:** BUG-014 · **type:** blocker, human input required
- **blocked_by:** none · **blocks:** any PR-9 work

`requirments/Phase 3/Phase_3_PR-9_Restaurant_Information_Management.md` ends at Task 2 with the placeholder:

> `(Tasks 3--14 continue exactly as provided in the conversation.)`

**12 of 14 PR-9 tasks have no requirement text**, so they cannot be implemented or tested. Do not invent them.

**Action:** report this to the human owner and request the original text. Then re-run the audit for PR-9 only.

---

## WO-07 · Three requirements contradict the code — reconcile before coding

- **id:** `WO-07` · **severity:** Medium · **defects:** BUG-011, BUG-012, BUG-013 · **type:** decision
- **blocked_by:** none · **blocks:** WO-12

Produce a short decision memo covering all three. Do **not** change code or requirements unilaterally.

**(a) Social platforms — 4 vs 6.** `Phase_2`-era PR-2 Task 2.6 requires Facebook, Instagram, TikTok, **X**, **YouTube**, **LinkedIn**. Code allows exactly four:

```csharp
// Data/Phase3Model.cs, ConfigureSocialLinks
"platform IN ('instagram', 'facebook', 'tiktok', 'google_business')"
```

`RestaurantValidation.SocialHosts` mirrors it. But `specifications/phase-1/README.md` §2 rule 8 says the PRD is authoritative and lists exactly these four, and PR-9 Task 1 agrees. **The PR-2 task file is the outlier.** Recommend amending PR-2; if the six-platform set is genuinely wanted, it needs a migration plus a host allowlist per platform.

**(b) Unavailable dishes.** PR-5 Task 3 says *"Return only available menu items"*; PR-7 Task 4 says every unavailable dish must show an indicator. The code implements PR-7 (`PublicMenuProjection.cs` filters only on `IsActive` and `ArchivedAt`). The implemented behaviour is correct — **recommend amending the stale PR-5 wording.**

**(c) `openTime < closeTime`.** PR-2 Task 2.8 and PR-3 Tasks 2 & 6 all require opening earlier than closing. `RestaurantValidation.ValidateIntervals` instead treats `close <= open` as an overnight shift:

```csharp
if (end <= start) { end += 24 * 60; }
```

Only `opens == closes` is rejected. Overnight service is a real feature (`ClosesNextDay` is modelled end-to-end), but a typo like `18:00–08:00` is silently accepted as a 14-hour shift. **Recommend: keep the behaviour, amend the requirement, and add an explicit "closes next day" checkbox in the editor so the owner confirms intent.**

---

## WO-08 · Phase 1 was never delivered as a PR

- **id:** `WO-08` · **severity:** Critical · **defect:** BUG-001 · **type:** decision
- **blocked_by:** none

`git log` contains `feat: implement phase 2 digital menu` (`da5570d`) and `feat: implement phase 3 restaurant management` (`6d8ae65`) — **no Phase 1 implementation commit**. `src/frontend/app/page.tsx` was created by the scaffold commit `5205ed1` and only edited by the Phase 3 commit. `specifications/phase-1/` has no implementation-evidence file; all four specs remain `Status: Proposed`.

Every PR-1…PR-4 acceptance criterion is therefore unverified, and WO-02, WO-05, WO-09, WO-10, WO-11, WO-13, WO-14 are all downstream of this gap.

**Action:** produce a PR-1…PR-4 traceability matrix — one row per task, marked `met` / `partially met` / `not met`, each citing the file that satisfies it. Then propose either a Phase 1 delivery PR or a formal re-scope. Await approval.

---

# WAVE 3 — Schema and data (needs a migration; batch into one)

---

## WO-09 · Missing columns: `website_url`, special-hours timestamps

- **id:** `WO-09` · **severity:** High + Medium · **defects:** BUG-004, BUG-009
- **requirement:** PR-2 Tasks 2.1 / 2.7 / 2.8; PR-3 Task 1
- **blocked_by:** WO-07(a) — settle the social-platform set first so this is a single migration

**Files**

- `src/backend/OmniRest.Api/Data/MenuDbContext.cs` — `RestaurantEntity` (~:255), `ConfigureRestaurant` (~:49)
- `src/backend/OmniRest.Api/Data/Phase3Model.cs` — `SpecialHourEntity`, `ConfigureSpecialHours`
- `src/backend/OmniRest.Api/Restaurants/AdminRestaurantContracts.cs`, `PublicRestaurantContracts.cs`, `RestaurantValidation.cs`
- `src/frontend/lib/restaurant-contract.ts`, `components/admin/RestaurantEditor.tsx`, `app/page.tsx`

**(a) `website_url` is absent everywhere.** `grep -rni "website" src/backend src/frontend` → 0 matches. Spec `phase-1/pr-2-restaurant-information.md:46` defines `` `website_url` | varchar(2048) | Nullable HTTPS URL `` and `:123` shows `"websiteUrl": "https://example.com"` in the response contract. Add the column, the DTO fields (admin + public), HTTPS-only validation (mirror the `SocialHosts` URL checks minus the host allowlist), an editor input, and conditional rendering on the home page (hide when empty, per PR-2 Task 2.9).

**(b) `special_hours` has no timestamps.** PR-3 Task 1 lists `created_at` and `updated_at` among the required fields. `SpecialHourEntity` has only `Id, RestaurantId, Date, IsClosed, Note, ConcurrencyVersion`. Compare `MenuEntity` / `DishEntity` / `MenuCategoryEntity`, which all carry both. Add both columns and set them in `RestaurantManagementService` create/update paths.

**Migration:** one new EF migration covering both. Existing rows must survive — backfill timestamps with `now()`. Follow the staged pattern used by `20260731044753_Pr7DishAvailability` (backfill, then apply the non-null rule).

**Done when**

- [ ] `dotnet ef migrations add …` produces a clean migration; `MigrationTests` pass
- [ ] `GET /api/v1/public/restaurant` includes `websiteUrl`
- [ ] An invalid website URL is rejected with a field error
- [ ] Creating a special date populates `created_at`/`updated_at`

---

## WO-10 · Coordinates are never captured

- **id:** `WO-10` · **severity:** Low · **defect:** BUG-029
- **requirement:** PR-2 Task 2.3
- **blocked_by:** none · **blocks:** WO-11

Live data has `"latitude": null, "longitude": null`, so `directionsUrl` degrades to a text-address search. The admin editor already exposes Latitude/Longitude inputs and the DB already enforces ranges via `ck_restaurant_addresses_coordinates`, so **the plumbing exists and is unused**.

**Change:** seed coordinates for the sample restaurant; surface a hint in the editor explaining the effect on directions and the map. Optionally add a geocoding assist — but only behind config, never a hardcoded key.

**Done when**

- [ ] Seeded restaurant has non-null coordinates
- [ ] `directionsUrl` uses the `lat,lng` destination form
- [ ] Saving out-of-range coordinates returns `coordinates_invalid`

---

# WAVE 4 — Phase 1 UI package

---

## WO-11 · Google Maps integration is absent

- **id:** `WO-11` · **severity:** High · **defect:** BUG-003
- **requirement:** PR-2 Task 2.10; also unblocks PR-2 Task 2.9 (*"Display: … Map"*)
- **blocked_by:** WO-10

`grep -rniE "iframe|google.com/maps|leaflet|mapbox" src/frontend` → **0 matches**. Latitude/longitude are stored and returned but never rendered; only `directionsUrl` is used.

Spec `pr-2-restaurant-information.md:306-320` requires a **Google Maps Embed API iframe**, rendered only when configuration and location data are both available, with a marker and a directions link, deferred until near the viewport, and **no unrestricted key in the repository**.

**Change**

1. New `components/restaurant/RestaurantMap.tsx`.
2. Render only when coordinates **and** a configured public Maps key are present. Otherwise render the address block alone — this fallback is required, per PR-2 Task 2.10 (*"Missing coordinates do not cause errors"*) and `:206`.
3. Key from env, referrer-restricted, Embed API only. **Never commit a key.** Add it to `.env.example` with a comment.
4. `loading="lazy"` on the iframe; a `title` attribute for screen readers.

**Done when**

- [ ] Map renders with a marker at the seeded coordinates
- [ ] With coordinates removed, the page renders the address with no error and no empty iframe
- [ ] With the key unset, the page renders the address with no error
- [ ] No key literal anywhere in the repo

---

## WO-12 · Business-hours display: no current-day highlight, no `<time>`

- **id:** `WO-12` · **severity:** High · **defect:** BUG-005
- **requirement:** PR-2 Task 2.11
- **blocked_by:** WO-07 (settle overnight-display wording)

**Files:** `src/frontend/app/page.tsx:33`; extract into `components/restaurant/BusinessHours.tsx`

Live DOM returns `timeEls: 0` — no `<time>` elements at all — and on Wednesday all seven days render identically. Current markup is a flat `<dl>` with no comparison against the current day.

Spec `pr-2-restaurant-information.md:325-331` requires: all seven weekdays in locale order; intervals or a localized "Closed"; **the restaurant-local current weekday marked, not the browser-local one**; semantic `<time>` values; a clear indicator for intervals closing after midnight; and the component must receive a prepared display model rather than computing status itself.

**Change**

1. Extract a `BusinessHours` component taking a prepared model.
2. Compute the current weekday **server-side from the restaurant time zone** — the API already returns `timeZone` (`America/Winnipeg`). Do not use `new Date().getDay()` in the browser.
3. Mark the current day with `aria-current="date"` plus a visual treatment that survives forced-colors mode.
4. Wrap each opening/closing time in `<time datetime="HH:mm">`.
5. Keep the existing `closesNextDay` → `" next day"` suffix, or whatever WO-07 decides.

**Tests:** closed / single / split / overnight rendering; **a timezone-difference test proving the highlighted day follows the restaurant time zone, not the test runner's** (spec `:337` requires this explicitly).

**Done when**

- [ ] `document.querySelectorAll('time').length >= 7`
- [ ] Exactly one day carries `aria-current="date"`, matching the restaurant-local weekday
- [ ] Timezone-difference test passes

---

## WO-13 · No Hero / About / CTA structure

- **id:** `WO-13` · **severity:** High · **defect:** BUG-006
- **requirement:** PR-1 Tasks 1.1, 1.3
- **blocked_by:** WO-08 (scope decision)

`app/page.tsx:18` renders a single `<section className="homeCard">` containing image, name, description, status, buttons, email, address, hours and social links. `src/frontend/components/` contains no `Hero`, `About` or `CTA` component, and there is no About content.

PR-1 Task 1.1 requires Hero, About and CTA sections plus *"reusable component structure for future expansion"*.

**Change:** split the home page into `Hero`, `About` and `CtaGroup` components under `components/restaurant/`. Preserve the existing heading hierarchy (`h1#page-title`) and all current accessibility attributes — do not regress the axe checks. `About` renders nothing when there is no content.

**Done when**

- [ ] Three distinct sections exist as separate components
- [ ] Heading hierarchy unchanged; axe reports no new serious/critical violations
- [ ] Existing Playwright home-page assertions still pass

---

## WO-14 · Image pipeline generates a single variant; hero is upscaled ~3×

- **id:** `WO-14` · **severity:** Medium · **defect:** BUG-025
- **requirement:** PR-4 Task 5 (*"Support responsive image loading"*, *"Media remains sharp"*)
- **blocked_by:** WO-01

Live API returns exactly one variant: `{ "url": "…jpg", "width": 225, "height": 225 }`. The DOM renders it at 702×702 from a `naturalWidth` of 211 — a **3.3× upscale**, visibly soft. `sizes="(max-width: 704px) 100vw, 704px"` is set, but with a single small source the `srcset` has nothing to choose from.

`LocalMediaStorage.StoreAsync` stores the original and generates no derivatives.

**Change**

1. Generate derivative widths on upload (e.g. 320 / 640 / 1024 / 1600, never upscaling past the original) using the ImageSharp dependency already present.
2. Persist one `MediaVariantEntity` per derivative.
3. Enforce a minimum dimension for the **main** image and return a validation error below it — a 225 px hero should be rejected at upload, not silently stretched.
4. `RestaurantPublicProjectionBuilder` already orders variants by width and `app/page.tsx:14` takes `.at(-1)`; confirm both still pick the largest.

**Done when**

- [ ] Uploading a large image produces ≥ 3 variants
- [ ] Public response lists them ascending by width
- [ ] Uploading an undersized main image returns a validation error
- [ ] Rendered hero `naturalWidth >= clientWidth`

---

## WO-15 · Phone number displayed raw in E.164

- **id:** `WO-15` · **severity:** Medium · **defect:** BUG-026
- **requirement:** PR-10 Task 1 — *"Display a formatted phone number"*
- **blocked_by:** none

Live: the Call button reads **"Call +14313778457"**; the API returns `"phone": { "e164": "+14313778457", "display": "+14313778457" }` — byte-identical.

`phoneDisplay` is free text typed by the owner (`RestaurantEditor.tsx`, placeholder `(204) 555-0123`). `RestaurantValidation.ValidateProfile` checks only that both fields are present or both absent, and `length <= 40`. The e2e suite passes because its fixture hardcodes `(204) 555-0123`.

**Change**

1. When `phoneDisplay` is blank, derive it from `phoneE164` — for `+1` numbers, `(NPA) NXX-XXXX`.
2. Add a "Format automatically" affordance in the editor.
3. Warn (do not block) when `display` equals `e164`.
4. **Do not touch `buildTelUri`.** `lib/phone.ts` is the single sanctioned construction point for `tel:` URIs and is guarded by `phone-static-audit.test.ts` — the `href` must keep using strict E.164.

**Done when**

- [ ] Saving a profile with an empty display field yields a formatted display value
- [ ] `tel:` href remains bare E.164; `phone-static-audit.test.ts` passes
- [ ] Call button shows a formatted number

---

# WAVE 5 — Hygiene and consistency

---

## WO-16 · Evidence document cites a nonexistent commit and test file

- **id:** `WO-16` · **severity:** High · **defect:** BUG-007
- **blocked_by:** none

`specifications/phase-3/frontend-implementation-evidence.md`:

- Header says `**Implementation base:** 46db811` → `git cat-file -t 46db811` = `fatal: Not a valid object name`.
- Acceptance row A2 lists `LogoutButton.test.tsx` as evidence → `find src/frontend -name "LogoutButton.test*"` = 0 results. `LogoutButton.tsx` has **no tests**.
- Claims *"62 tests across 14 files"*; 14 files is correct, but the logout flow is uncovered.

**Change:** correct the commit reference to a real SHA, **write the missing `LogoutButton.test.tsx`** (session cleared, redirect to `/admin/login`, error branch on failed logout), and re-run the suite to record true counts.

**Done when**

- [ ] Referenced SHA resolves via `git cat-file -t`
- [ ] `LogoutButton.test.tsx` exists and passes
- [ ] Test counts in the document match actual output

---

## WO-17 · Repository-wide line-ending churn

- **id:** `WO-17` · **severity:** Medium · **defect:** BUG-015
- **blocked_by:** none — **do this first if you plan to review diffs**

`git diff --stat HEAD` reports `143 files changed, 28754 insertions(+), 28754 deletions(-)` — insertions exactly equal deletions across every text file (CRLF↔LF), including 16 676 lines of `package-lock.json`. Diff-based review and `git blame` are unusable.

**Change:** add `.gitattributes` with `* text=auto eol=lf` (plus binary rules for images), run `git add --renormalize .`, commit the normalization **alone**, and confirm `git diff HEAD` is clean afterwards.

**Done when**

- [ ] `.gitattributes` committed
- [ ] `git diff --stat HEAD` shows no whitespace-only churn
- [ ] Normalization is its own commit, touching no logic

---

## WO-18 · 401/403 return an empty body instead of Problem Details

- **id:** `WO-18` · **severity:** Low · **defect:** BUG-028
- **requirement:** PR-8 Task 8, PR-9 Task 2
- **blocked_by:** none

`src/backend/OmniRest.Api/Security/OwnerSecurity.cs:160-169`:

```csharp
public override Task RedirectToLogin(RedirectContext<CookieAuthenticationOptions> context)
{
    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
    return Task.CompletedTask;
}
public override Task RedirectToAccessDenied(RedirectContext<CookieAuthenticationOptions> context)
{
    context.Response.StatusCode = StatusCodes.Status403Forbidden;
    return Task.CompletedTask;
}
```

Status code only, no body — Chrome renders a network error page for `GET /api/v1/admin/restaurant` while anonymous. Every other failure path uses `ApiProblems.Problem(...)` and returns `application/problem+json`.

**The security behaviour is correct** (no HTML login redirect, no information leak). Only the response contract is inconsistent.

**Change:** write a Problem Details body in both handlers — codes `auth_required` (401) and `auth_forbidden` (403). Keep the messages generic; leak nothing about whether the user exists or which restaurant was requested.

**Done when**

- [ ] Anonymous `GET /api/v1/admin/restaurant` → 401 with `content-type: application/problem+json`
- [ ] `AuthApiTests` assert the body shape
- [ ] Response reveals nothing about account existence

---

## WO-19 · Small consistency fixes (batch into one commit)

- **id:** `WO-19` · **severity:** Low · **defects:** BUG-016, BUG-019, BUG-021
- **blocked_by:** WO-09 (BUG-019 rides its migration)

**(a) BUG-016 — directions link opens in the same tab.** `app/page.tsx`: `<a href={restaurant.address.directionsUrl} rel="noreferrer">Get directions</a>` has no `target`. Add `target="_blank"` and `rel="noreferrer noopener"`.

**(b) BUG-019 — `postalCode` is mandatory.** PR-2 Task 2.2 says all address fields are required *except* `postalCode`. Code requires it in both places:

```csharp
// Phase3Model.cs
.Property(x => x.PostalCode)…IsRequired();
// RestaurantValidation.ValidateAddress
ValidateText(errors, "address.postalCode", …, required: true);
```

Make it nullable in the entity, the validator and the DTOs; include it in the WO-09 migration.

**(c) BUG-021 — placeholder image host.** `next.config.ts` allows only `https://images.example.test`; `appsettings.Development.json` matches, production `appsettings.json` has `[]`. Harmless today (uploads use relative paths) but any CDN URL will be rejected by `next/image`. Drive `remotePatterns` from `OMNI_REST_MEDIA_HOSTS`, the env var `lib/menu-api.ts` already reads, and document it in `.env.example`.

**Done when**

- [ ] Directions link opens in a new tab with a safe `rel`
- [ ] A restaurant saves successfully with an empty postal code
- [ ] Image host allowlist comes from config, not a literal

---

# Deferred — do not implement

## WO-20 · Dish availability management in the owner dashboard

- **defect:** BUG-008 · **requirement:** PR-7 Tasks 2 and 3 · **status:** deferred by design

`grep -rn "dishes\|categories" src/backend/OmniRest.Api/Modules/` → 0 matches. There are no dish or category endpoints, and `RestaurantEditor.tsx` has no availability control.

This is a **documented deferral**, recorded in `specifications/phase-2/implementation-evidence.md`:

> `PR-7.2 Dashboard Availability Management` — **Deferred to Phase 4 PR-14**; no admin/auth endpoint or UI exists

PR-7's stated deliverables ("Dashboard controls") and acceptance criteria ("Owner can change availability", "Changes persist after page refresh") are therefore **unmet in Phase 2**. Build this in Phase 4 PR-14, not now. Flag it to the human owner if they believed PR-7 was complete.

---

# Intentionally not actioned

These two audit findings have **no work order on purpose**. Do not "fix" them — the current behaviour is defensible. Revisit only under the stated trigger.

| Defect | Why no WO | Revisit when |
|---|---|---|
| **BUG-017** — no mobile collapsible navigation | `PublicShell.tsx` renders a single always-visible nav link. Spec `phase-1/pr-4-responsive-experience.md:102` explicitly permits this: *"Use a collapsible mobile menu only if the number/length of links cannot fit at 320 CSS pixels."* One link fits. | A second public nav item is added — e.g. Gallery (Phase 5, PR-15). Then it becomes a real defect. |
| **BUG-020** — menu not cached client-side, no explicit refresh | `app/menu/page.tsx` is `force-dynamic` and refetches server-side; caching relies on the `ETag` + `must-revalidate` pair from `PublicMenuEndpoints.cs`. PR-5 Tasks 4 and 12 ask for session caching, but ETag + 304 is cheaper, and PR-6 category switching already performs **zero** refetches. | Measurement shows the public menu read is a bottleneck. Do not add a client cache speculatively — it would risk the stale-availability behaviour PR-7 Task 7 forbids. |

---

# Execution order

```
WAVE 1  (parallel, no dependencies)
  WO-01 seed media          WO-02 hero priority
  WO-03 status look-ahead   WO-04 stale special hours
  WO-05 SEO metadata

WAVE 2  (decisions — STOP for approval)
  WO-06 PR-9 text ──blocks──▶ all PR-9 work
  WO-07 3 contradictions ──blocks──▶ WO-12, WO-09(a)
  WO-08 Phase 1 scope ──blocks──▶ WO-13

WAVE 3  (one migration)
  WO-09 website_url + timestamps   [needs WO-07a]
  WO-10 coordinates

WAVE 4  (Phase 1 UI)
  WO-11 map          [needs WO-10]
  WO-12 hours        [needs WO-07]
  WO-13 Hero/About   [needs WO-08]
  WO-14 variants     [needs WO-01]
  WO-15 phone format

WAVE 5  (hygiene — WO-17 first if reviewing diffs)
  WO-16 evidence doc   WO-17 .gitattributes
  WO-18 problem details   WO-19 small fixes [needs WO-09]

DEFERRED
  WO-20 dish availability → Phase 4 PR-14
```

---

# Progress checklist

```
[x] WO-01  High    seeded dish images 404
[x] WO-02  Medium  hero image priority
[x] WO-03  Medium  status next-day look-ahead
[ ] WO-04  Medium  stale special hours
[ ] WO-05  High    SEO metadata
[ ] WO-06  Medium  PR-9 requirements truncated      (decision)
[ ] WO-07  Medium  3 requirement contradictions     (decision)
[ ] WO-08  CRIT    Phase 1 never delivered          (decision)
[ ] WO-09  High    website_url + special timestamps (migration)
[ ] WO-10  Low     coordinates never captured
[ ] WO-11  High    Google Maps integration
[ ] WO-12  High    current-day highlight + <time>
[ ] WO-13  High    Hero / About / CTA
[ ] WO-14  Medium  image variants
[ ] WO-15  Medium  phone formatting
[ ] WO-16  High    evidence doc + LogoutButton test
[ ] WO-17  Medium  .gitattributes normalization
[ ] WO-18  Low     Problem Details on 401/403
[ ] WO-19  Low     directions target, postalCode, image hosts
[~] WO-20  Medium  dish availability — DEFERRED to Phase 4
```

---

# Still unverified — verify, do not assume

Two audit items could not be checked. Resolve them before claiming Phase 1–3 is done.

| ID | What | Why it is open |
|---|---|---|
| VER-02 | `dotnet test` + `npm test` / `test:e2e` / `test:e2e:real` on current HEAD | Never executed during the audit (no .NET SDK, npm registry returned 403). **Several WOs above assume the existing suites are green — confirm that first.** |
| VER-03 | Responsive rendering at 320 / 768 / 1440 px across Chrome, Edge, Safari, Firefox | Browser viewport resizing was ignored during the audit (`innerWidth` stayed 2174 px). Only desktop width was checked: no horizontal overflow. Use the Playwright projects `chromium-minimum` (320×568) and `chromium-tablet` (768×1024), which already exist in `playwright.config.ts`. |

Related open finding, unchanged: **BUG-018** — only two layout media queries exist (`menu.module.css` `max-width: 35rem`, `admin.module.css` `max-width: 48rem`) against a documented three-breakpoint strategy (320–767 / 768–1023 / 1024+), with **no 1024 px rule at all**. Layouts are fluid, which mitigates it, but "responsive behavior is defined for each breakpoint" is not demonstrable. Address it while doing VER-03.

---

# Newly discovered

> Append any defect found during remediation that is not listed above. Do not fix it silently.

| ID | Severity | Description | Found during |
|---|---|---|---|
| | | | |
