# PR-2 — Restaurant Information Technical Specification

**Status:** Proposed

**Depends on:** Phase 0, PR-1

**Product source:** `requirments/Phase 1/Phase_1_PR-2_Restaurant_Information_Tasks(1).md`

## 1. Objective

Persist and publicly present the restaurant's contact information, address, location, regular business hours, and supported social links. Replace the PR-1 fixture source with a typed ASP.NET Core public API while preserving the existing home-page components.

PR-3, not PR-2, owns special-hour persistence and precedence. PR-2 establishes extension points used by PR-3.

## 2. In scope

- restaurant profile/contact persistence;
- one primary physical address and optional coordinates;
- restaurant timezone;
- regular weekly hours supporting multiple intervals and overnight service;
- supported social links;
- anonymous public restaurant API;
- public contact, address, map, hours, social-link, and open-status presentation;
- validation, caching, accessibility, and tests.

## 3. Out of scope

- owner editing or authenticated management;
- special-hour CRUD and precedence, delivered by PR-3;
- multiple addresses or branches per restaurant;
- automatic geocoding;
- reservations, orders, or contact forms;
- social feeds or embedded social-media content.

## 4. Data model

### 4.1 `restaurants`

| Field | PostgreSQL type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `name` | `varchar(120)` | Required, trimmed, nonblank. |
| `short_description` | `varchar(300)` | Required for Phase 1. |
| `phone_e164` | `varchar(16)` | Required, validated E.164. |
| `email` | `varchar(254)` | Nullable, normalized for comparison. |
| `website_url` | `varchar(2048)` | Nullable HTTPS URL. |
| `time_zone` | `varchar(100)` | Required IANA timezone identifier. |
| `created_at` | `timestamptz` | Required UTC instant. |
| `updated_at` | `timestamptz` | Required UTC instant. |
| concurrency token | provider-supported | Required for future owner edits. |

PR-1 name, description, phone, and image data are reconciled with this entity. Hero media remains a Media-module reference when that module is introduced; a transitional configured URL is allowed in Phase 1.

### 4.2 `restaurant_addresses`

| Field | PostgreSQL type | Rule |
| --- | --- | --- |
| `restaurant_id` | `uuid` | Primary/foreign key; one current address per restaurant. |
| `street_line_1` | `varchar(160)` | Required. |
| `street_line_2` | `varchar(160)` | Nullable. |
| `city` | `varchar(100)` | Required. |
| `region` | `varchar(100)` | Required. |
| `postal_code` | `varchar(20)` | Nullable only when the country permits omission. |
| `country_code` | `char(2)` | Required ISO 3166-1 alpha-2 value. |
| `latitude` | `numeric(9,6)` | Nullable; range -90 through 90. |
| `longitude` | `numeric(9,6)` | Nullable; range -180 through 180. |
| `google_place_id` | `varchar(255)` | Nullable. |

Latitude and longitude must either both be present or both be absent.

### 4.3 `business_hour_intervals`

| Field | PostgreSQL type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `restaurant_id` | `uuid` | Required foreign key. |
| `day_of_week` | `smallint` | 0–6 using one documented convention. |
| `opens_at` | `time` | Required local wall time. |
| `closes_at` | `time` | Required local wall time. |
| `closes_next_day` | `boolean` | Distinguishes overnight intervals. |
| `display_order` | `smallint` | Required within the weekday. |

Zero intervals for a weekday means closed. Multiple non-overlapping intervals support split service. Database and application validation prevent duplicate order values and overlapping intervals for the same restaurant/day.

### 4.4 `restaurant_social_links`

| Field | PostgreSQL type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `restaurant_id` | `uuid` | Required foreign key. |
| `platform` | `varchar(40)` | Instagram, Facebook, TikTok, or GoogleBusinessProfile. |
| `url` | `varchar(2048)` | Required HTTPS URL matching the platform's allowed hosts. |
| `display_order` | `smallint` | Required. |

One link per supported platform per restaurant is allowed. The table representation remains extensible without adding nullable platform columns.

### 4.5 Initial public projection

Phase 1 has no owner writes, but public endpoints still follow the architecture's published-projection boundary. A controlled onboarding/import command validates the normalized restaurant aggregate and creates the initial versioned public snapshot. The command is idempotent for the same source version and records the publication version and timestamp.

The anonymous API reads the public snapshot rather than exposing partially imported normalized rows. Phase 3 later connects owner drafts and the publish command to the same projection mechanism.

## 5. Public API contract

### 5.1 Endpoint

`GET /api/v1/public/restaurant`

The endpoint resolves the restaurant from the validated request host and returns the current public restaurant projection.

### 5.2 Response

```json
{
  "id": "uuid",
  "name": "string",
  "shortDescription": "string",
  "phone": {
    "e164": "+12045550123",
    "display": "+1 204-555-0123"
  },
  "email": "optional@example.com",
  "websiteUrl": "https://example.com",
  "timeZone": "America/Winnipeg",
  "address": {
    "streetLine1": "string",
    "streetLine2": null,
    "city": "string",
    "region": "string",
    "postalCode": "string",
    "countryCode": "CA",
    "formatted": "string",
    "latitude": 49.8951,
    "longitude": -97.1384,
    "directionsUrl": "https://www.google.com/maps/dir/?api=1&destination=..."
  },
  "regularHours": [
    {
      "dayOfWeek": 1,
      "intervals": [
        { "opensAt": "11:00:00", "closesAt": "22:00:00", "closesNextDay": false }
      ]
    }
  ],
  "status": {
    "state": "open",
    "label": "Open now",
    "nextChangeAt": "2026-07-31T03:00:00Z"
  },
  "socialLinks": [
    { "platform": "instagram", "url": "https://www.instagram.com/example" }
  ]
}
```

Rules:

- Optional absent values are `null` or omitted according to the shared JSON contract; one convention must be selected globally and tested.
- Hours are returned in deterministic weekday and interval order.
- Status is authoritative server output calculated in the restaurant timezone.
- PR-3 may add `specialHours` and status provenance as additive fields.
- The response supports output caching and includes a validator such as `ETag` tied to the public content version.
- Status-bearing responses expire or revalidate no later than `nextChangeAt`, so caching cannot preserve an incorrect open/closed state across a schedule transition.
- Unknown restaurant hosts return a safe 404 Problem Details response.

## 6. Task specifications

### Task 2.1 — Restaurant Contact Information Model

#### Technical requirements

- Add the contact and timezone fields in section 4.1 through an EF Core migration.
- Normalize phone values to E.164 before persistence.
- Keep display formatting outside persistence.
- Email and website are nullable; phone is required for the Phase 1 product actions.
- Add database length constraints and application validation.

#### Verification

- Migration applies to an empty PostgreSQL database.
- Integration tests persist and retrieve required and nullable combinations.
- Invalid phone, email, website, or timezone values are rejected.

### Task 2.2 — Restaurant Address Model

#### Technical requirements

- Add the one-to-one address entity from section 4.2.
- Store structured address fields; do not store only one formatted string.
- Create formatted display text in a locale-aware formatter.
- Enforce restaurant ownership and cascade behavior according to the aggregate lifecycle.

#### Verification

- Required-field and paired-coordinate constraints are tested.
- Formatting tests cover address-line omission and postal-code omission.
- Deleting a restaurant in a database integration test removes its address.

### Task 2.3 — Restaurant Coordinates

#### Technical requirements

- Use fixed-precision numeric columns.
- Validate latitude and longitude bounds in application and database constraints.
- Require both values together.
- Prefer coordinates in Directions and map presentation when available; otherwise use the structured address.
- Do not geocode implicitly during public requests.

#### Verification

- Boundary and out-of-range values are tested.
- Missing coordinates produce a valid address-only response.
- Coordinates are serialized without precision-changing string conversion.

### Task 2.4 — Restaurant Business Hours Model

#### Technical requirements

- Implement the interval model from section 4.3.
- Use zero intervals to represent a closed weekday; do not store placeholder null-time rows.
- Support split and overnight intervals.
- Validate order, duplication, and overlap in restaurant-local time.
- Store the restaurant timezone separately as required data.

#### Verification

- Tests cover closed days, one interval, split intervals, overnight intervals, overlap rejection, and deterministic ordering.
- Migration constraints reject invalid weekday values.

### Task 2.5 — Special Hours Support

#### Technical requirements

- Do not create a second special-hours model in PR-2.
- Define an application extension interface through which PR-3 can supply date-specific overrides to the status calculator and public projection.
- Until PR-3, the implementation always reports no special override.

#### Verification

- A contract test proves the regular-hours calculator accepts an optional override source.
- No `special_hours` migration or owner CRUD endpoint is introduced by PR-2.

### Task 2.6 — Restaurant Social Links Model

#### Technical requirements

- Implement the row-based social-link model from section 4.4.
- Validate HTTPS scheme and platform hostnames.
- Normalize supported platform identifiers to stable lowercase API values.
- Unknown platform identifiers are rejected until product requirements add support.
- Missing social links are valid and return an empty collection.

#### Verification

- Tests cover every supported platform, duplicate rejection, unsafe schemes, deceptive hosts, and an empty collection.

### Task 2.7 — Restaurant Information API

#### Technical requirements

- Implement the endpoint and response contract from section 5.
- Allow anonymous access explicitly.
- Resolve the restaurant through `IRestaurantResolver` using the validated host/default-development configuration.
- Query a purpose-built public projection; do not serialize tracked entities.
- Require an initial published snapshot created by the controlled onboarding/import command.
- Use typed results, OpenAPI metadata, output caching, ETag, and Problem Details.
- Keep the endpoint handler free of business calculations.

#### Verification

- `WebApplicationFactory` integration tests cover 200, unknown host 404, optional fields, ordering, ETag, and cache-safe output.
- OpenAPI contract tests detect unreviewed changes.
- Query-count diagnostics guard against per-row database queries.

### Task 2.8 — Restaurant Information Validation

#### Technical requirements

- Implement reusable domain/application validators for contact, address, coordinates, timezone, schedule intervals, and social links.
- Return field-level validation codes internally; public Phase 1 reads do not expose write-validation endpoints.
- Enforce invariant validation when sample/seed data is loaded and when future commands write data.
- Overnight hours are valid when `closes_next_day` is true; the simplistic `openTime < closeTime` rule is not used.

#### Verification

- Unit tests cover boundary, whitespace, malformed Unicode/URL, and cross-field cases.
- Database integration tests cover constraints that protect persisted integrity.

### Task 2.9 — Public Restaurant Information UI

#### Technical requirements

- Replace the PR-1 fixture source with a server-side API-backed source.
- Render name, phone, optional email, address, map, regular hours, and social links.
- Hide optional fields by omitting the element; do not render empty labels or broken links.
- Use semantic `address`, list, time, and link markup where appropriate.
- Keep essential content server-rendered.
- Use the shared Call and Directions components from PR-1.

#### Verification

- Component tests cover complete and minimal optional-data responses.
- Browser tests verify content in initial HTML and absence of empty controls.
- Accessibility scans cover the contact and hours sections.

### Task 2.10 — Google Maps Integration

#### Technical requirements

- Render a Google Maps Embed API iframe only when required configuration and location data are available.
- Restrict the browser-visible Maps key by allowed referrer and enabled API in the cloud configuration.
- The iframe has a descriptive title and does not become a keyboard trap.
- Use coordinates or Place ID when present; fall back to the structured address.
- If the embed fails or configuration is unavailable, retain formatted address and Directions link.
- Defer map loading until near the viewport when doing so does not hide essential address information.

#### Verification

- Tests cover coordinates, Place ID, address fallback, missing key, and embed failure.
- No unrestricted Maps key appears in repository files.
- Manual verification covers keyboard traversal and responsive sizing.

### Task 2.11 — Business Hours Display

#### Technical requirements

- Render all seven weekdays in locale-defined order.
- Render all intervals or a localized “Closed” state.
- Mark the restaurant-local current weekday, not the browser-local weekday.
- Use semantic `<time>` values and locale-aware display formatting.
- Clearly indicate intervals that close after midnight.
- The component receives a prepared display model and does not calculate status itself.

#### Verification

- Tests cover closed, single, split, and overnight display.
- A timezone-difference test proves the highlighted day follows the restaurant timezone.
- A screen-reader check confirms days and intervals are understandable without visual layout.

### Task 2.12 — Open Now Status

#### Technical requirements

- Implement a backend `RestaurantStatusCalculator` using an injected clock and timezone provider.
- Return `open`, `closed`, or `unknown` machine state plus localized-display inputs and the next known transition instant.
- Calculate from regular intervals in PR-2 and accept PR-3 override input.
- Define behavior for DST gaps and repeated times using the selected .NET timezone library/provider.
- Do not rely on periodic browser timers for the authoritative state.
- The web may refresh status after `nextChangeAt` or on navigation using a lightweight public request introduced only if required by measurement.

#### Verification

- Deterministic unit tests cover before opening, exactly at opening, exactly at closing, split intervals, overnight service, closed days, next transition, DST boundaries, and timezone differences.
- Integration tests prove the API response uses the injected time source.

## 7. Web integration

The Next.js server-side source calls the API through an internal service URL in hosted environments and a local URL in development. It forwards only the validated public host context needed for restaurant resolution. Public cache behavior must not mix one restaurant's response with another restaurant's host.

The home page must continue working if optional email, website, coordinates, or social links are absent.

## 8. Security and privacy

- Public responses expose only fields explicitly included in the public DTO.
- Database and internal identifiers are not accepted as authorization inputs on future admin endpoints.
- URLs are validated before persistence and safely escaped at rendering.
- The API key used for Maps Embed is referrer-restricted and has no server/database privileges.
- API logs do not record full email addresses or unnecessary personal contact data.
- Output-cache keys include resolved restaurant identity and publication version.
- Output-cache lifetime is bounded by the next schedule transition.

## 9. PR-2 completion evidence

- reviewed migration and schema snapshot;
- validator unit-test results;
- PostgreSQL/API integration-test results;
- OpenAPI contract snapshot;
- initial public-projection import and idempotency evidence;
- public UI component and browser tests;
- map fallback and configuration evidence;
- schedule calculator boundary-case report;
- accessibility and responsive reports.

## 10. References

- [Phase 1 shared specification](README.md)
- [Application architecture](../architecture.md)
- [ASP.NET Core Minimal APIs](https://learn.microsoft.com/aspnet/core/fundamentals/minimal-apis)
- [ASP.NET Core error handling](https://learn.microsoft.com/aspnet/core/fundamentals/error-handling-api)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
