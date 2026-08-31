# PR-18 — Structured Restaurant Information

**Source:** `requirments/Phase 6/Phase_6_PR-18_Structured_Restaurant_Information.md`

**Normalization rulings:** `specifications/phase-6/README.md` section 2, rulings 7, 8, and 11

## 1. Schema foundation (Task 1)

`lib/json-ld.ts` is the shared generation module. It is pure — no `server-only`, no request access — so
every rule below is unit tested. `components/JsonLd.tsx` is the only place a payload reaches the DOM.

Three properties of the module carry the acceptance criteria:

1. **No empty properties.** `prune` recursively removes `null`, `undefined`, blank strings, empty arrays,
   and empty objects, and drops a node left holding nothing but its `@type`. Builders assign optimistically
   and one function enforces the rule, so a new property cannot forget it. Genuinely meaningful falsy
   values — `0`, `false` — are retained.
2. **Escaped serialization.** `serializeJsonLd` replaces `<` with `<` (README ruling 11). Restaurant
   and menu text is tenant-supplied; a literal `</script>` inside it would otherwise terminate the element
   and turn the remainder of the payload into markup. This is a live XSS vector, not a theoretical one.
   `JSON.stringify` must never be passed to `dangerouslySetInnerHTML` directly.
3. **Multiple objects.** `JsonLd` accepts an array of nodes and emits a single node or a JSON array as
   appropriate, so a page can attach a `MenuSection` and a `BreadcrumbList` together.

A native `<script>` is used rather than `next/script`, because JSON-LD is data, not executable code. Google
accepts JSON-LD from `<head>` or `<body>`; Next.js hoists a page-rendered `<script>` into `<head>`.

Structured data is generated only from the **published** projection, so it is emitted only for published
restaurant websites and cannot disagree with the visible page.

## 2. Restaurant identity (Task 2)

| Requirement | Source | Notes |
| --- | --- | --- |
| Restaurant Name | `restaurant.name` | Always present |
| Description | `restaurant.shortDescription` | Omitted when null |
| Logo | `restaurant.logo` | New in Phase 6 (ruling 7) |
| Website URL | derived | Absolute tenant origin |
| Restaurant Type | `restaurant.restaurantType` | Used as `@type` |
| Price Range | `restaurant.priceRange` | Omitted when unset |

**Restaurant Type is modelled as the Schema.org `@type`, not as a property.** `Restaurant` is a leaf type;
the alternatives are siblings under `FoodEstablishment`. Google asks for the most specific subtype
available, so a coffee shop is `CafeOrCoffeeShop` rather than `Restaurant` plus a label. The allowed set is
therefore exactly the `FoodEstablishment` subtypes — `Restaurant`, `CafeOrCoffeeShop`, `Bakery`, `BarOrPub`,
`Brewery`, `Distillery`, `FastFoodRestaurant`, `IceCreamShop`, `Winery` — enforced by a database check
constraint, by backend validation, and by `isRestaurantType` on the frontend. An unset type falls back to
`Restaurant`.

Cuisine is a *different* concept and is not part of this phase. If it is added later it belongs in
`servesCuisine` (free text), never in `@type` or `additionalType`.

Price Range is constrained to `$`, `$$`, `$$$`, `$$$$`.

## 3. Address and contact (Task 3)

`PostalAddress` with `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`,
alongside `telephone` (E.164) and `email`. `streetLine1` and `streetLine2` are joined into a single
`streetAddress`; Schema.org has no second-line property. Email is emitted only when present, and the whole
`address` node is pruned away when the restaurant has no address at all.

## 4. Opening hours (Task 4)

`OpeningHoursSpecification`, one entry per service period, covering all seven days. Three encoding rules
are non-obvious and are each covered by a test:

- **A closed day is `opens: "00:00"`, `closes: "00:00"`** — not an omitted entry. This is Google's
  documented way to state "closed all day" unambiguously. (`00:00`–`23:59` means open 24 hours, which is
  why the distinction matters.)
- **An overnight interval stays one entry on its opening day,** with `closes` wrapping past midnight. It is
  not split across two days.
- **Multiple service periods on one day are separate entries** for the same `dayOfWeek`.

Times are emitted as `HH:mm`; the projection sends `HH:mm:ss` and the seconds component is trimmed when it
is zero, matching Google's examples.

Special hours are **not** emitted. Schema.org expresses date-specific exceptions with `validFrom`/`validThrough`,
which is a separate modelling problem from weekly hours; emitting a holiday closure as if it were a weekly
rule would be actively wrong. Recorded as a deliberate omission, not an oversight.

## 5. Menu (Task 5)

`hasMenu` carries the absolute `/menu` URL, and is **omitted entirely when no menu is published** — the
home page performs a second, request-memoized read to determine this, so the property never points at a
page with nothing on it.

`menu` is emitted alongside `hasMenu` with the same value. Schema.org marks `menu` as superseded by
`hasMenu`, but Google's LocalBusiness documentation still names `menu` and does not list `hasMenu`. Both
are valid; emitting both costs one duplicated URL and satisfies both consumers.

A plain URL string is valid for `hasMenu`; a full `Menu` object is not required, and the richer `Menu` node
lives on `/menu` itself (PR-19).

## 6. Geo coordinates (Task 6)

`GeoCoordinates` with `latitude` and `longitude`, emitted only when both are present.

The backend already carried coordinates on `PublicAddress`; the **frontend contract silently dropped them**
in `parseAddress`. Phase 6 adds them to the parser with range validation (±90 / ±180) and normalizes a
half-populated pair to absent, so `geo` is either complete or missing — a single axis is meaningless and
guarding it at every use site would be error-prone.

## 7. Social links (Task 7)

`sameAs`, one entry per configured link, omitted entirely when there are none.

PR-18 names Facebook, Instagram, TikTok, X, YouTube, and LinkedIn. The shipped platform set was
`instagram`, `facebook`, `tiktok`, `google_business`, enforced by the `ck_social_links_platform` check
constraint and by a host allowlist in `RestaurantValidation`. Phase 6 widens **both** (ruling 7) to add
`x`, `youtube`, and `linkedin`, with these accepted hosts:

| Platform | Hosts |
| --- | --- |
| `x` | `x.com`, `www.x.com`, `twitter.com`, `www.twitter.com` |
| `youtube` | `youtube.com`, `www.youtube.com`, `m.youtube.com`, `youtu.be` |
| `linkedin` | `linkedin.com`, `www.linkedin.com` |

`google_business` is retained; it predates this phase and is a legitimate official profile.

## 8. Images (Task 8)

`logo` takes the logo asset; `image` takes the cover image and the main restaurant photo. All are absolute
URLs — a same-origin media path is joined onto the tenant origin, and an allowlisted absolute HTTPS host is
passed through unchanged. The largest available variant is selected. Logo and cover image are new columns
in Phase 6 and reuse the existing media pipeline and the tenant-safe composite foreign key that
`MainMediaAsset` already uses, so a restaurant cannot reference another tenant's asset.

Only assets whose `processing_status` is `ready` and whose variants pass the media-host allowlist are
projected, matching the existing main-image and gallery rules.

## 9. Automatic synchronization (Task 9)

No cache, no invalidation hook, and no scheduled regeneration. Restaurant profile fields are part of the
restaurant draft aggregate and publish through the existing outbox, and the public routes are
`force-dynamic`, so JSON-LD is rendered per request from the same published snapshot the page body reads.
A name, address, phone, hours, menu, or image change is therefore live in the structured data as soon as it
is published, and the schema cannot drift from the visible page because there is only one source for both.

## 10. Validation and QA (Task 10)

| Scenario | Coverage |
| --- | --- |
| Complete restaurant | `lib/json-ld.test.ts` + `e2e/seo.spec.ts` |
| No menu | Unit — `hasMenu`/`menu` both absent |
| No social links | Unit — `sameAs` absent |
| No coordinates | Unit — `geo` absent |
| Multiple opening periods | Unit — two entries for one day |
| Overnight hours | Unit — one entry, wrapped close |
| Minimal restaurant | Unit — eleven optional properties all absent |
| No empty properties | Unit assertion plus a recursive e2e walk of the live payload |
| No duplicate schemas | One `Restaurant` node on `/`, one `Menu` node on `/menu` |
| XSS escaping | Unit — a `</script>` payload cannot close the element |

Google Rich Results Test and the Schema.org validator require a publicly reachable URL, so they are
**manual, staging-time** checks rather than automated ones. That limitation is recorded explicitly in
`implementation-evidence.md`; the automated suite asserts structural validity, absolute URLs, and the
no-empty-property rule, which is what can be verified locally.
