# Phase 6 — Implementation Evidence

**Scope:** PR-17 (Search Engine Indexing), PR-18 (Structured Restaurant Information), PR-19 (Searchable Menu)

**Branch:** `feature/phase-6-seo`

This document records what was actually executed and observed, including the checks that could not be run
on this machine and why. Claims that were not verified are marked as such rather than omitted.

## 1. Environment

| Component | Version / note |
| --- | --- |
| Host | Windows 11 |
| .NET SDK | 10.0.302 — the pinned user-local SDK, not the machine-wide 10.0.400 that a bare `dotnet` resolves |
| Node / npm | 26.5.0 / 11.17.0 |
| Next.js / React | 16.2.12 / 19.2.8 |
| PostgreSQL | 18, via Docker Compose |
| Docker Engine | 29.7.2 |

## 2. Backend

```
dotnet build src/backend/OmniRest.sln       → Build succeeded. 0 Error(s), 2 Warning(s)
dotnet test  src/backend/OmniRest.sln       → Failed: 11, Passed: 226, Skipped: 0, Total: 237
```

The two build warnings are the pre-existing `NU1903` advisory for `SSH.NET 2025.1.0`, a transitive test
dependency. Not introduced by Phase 6.

**The 11 failures are the documented Windows media-storage limitation, not Phase 6 regressions.** All 11
are media tests — 8 `Unit/MediaStorageTests` plus the 3 integration tests that upload bytes
(`AdminRestaurantApiTests.ReadyMediaUploadListing…` and two `AdminGalleryApiTests` upload tests). They fail
with `PlatformNotSupportedException` from `UnixMediaFileOperations.EnsureSupportedPlatform`, or with
`A required privilege is not held by the client` when creating a symlink. This is the same limitation
recorded in `specifications/phase-5/README.md` section 6. The Phase 5 baseline was 190 of 201 passing on
Windows with the same 11 failures; Phase 6 adds 36 tests, all passing.

Integration tests **did** execute — Testcontainers started a real `postgres:18` container.

**Migration verified against a real database.** `dotnet ef database update` applied
`20260901120000_Phase6RestaurantIdentity` cleanly, including the widened constraint:

```sql
ALTER TABLE public.social_links ADD CONSTRAINT ck_social_links_platform
  CHECK (platform IN ('instagram','facebook','tiktok','google_business','x','youtube','linkedin'));
```

### 2.1 `dotnet format --verify-no-changes` fails, and it is pre-existing

This check does **not** pass, and Phase 6 did not cause it. Verified by stashing every Phase 6 change and
re-running against a pristine tree, where it still fails on files Phase 6 never opened — for example
`Unit/WebsiteDesignCatalogTests.cs` (`ENDOFLINE`) and `20260827120000_Phase5RestaurantGallery.cs`
(`CHARSET`, a BOM).

The cause is environmental: `git config core.autocrlf` is `true`, so the working tree is CRLF, while
`.editorconfig` sets `end_of_line = lf`. Every `.cs` file in the repository therefore fails `ENDOFLINE` on
a Windows checkout. `dotnet format style` and `dotnet format analyzers` both pass clean. Normalizing line
endings would rewrite the entire repository and is out of scope for this phase; it is filed as separate
follow-up work.

## 3. Frontend static checks

```
npm run lint          → clean (eslint --max-warnings=0)
npm run typecheck     → clean
npm run test          → 25 files, 222 tests passed
npm run test:coverage → statements 81.07%, branches 75.56%, functions 81.39%, lines 84.37%
npm run build         → compiled successfully
```

All four coverage thresholds (80/75/80/80) are met. `lib/seo.ts` and `lib/public-data.ts` were added to the
coverage exclusion list alongside the existing `lib/menu-api.ts` and `lib/server-api.ts`: they import
`server-only`, which throws under jsdom, so they cannot be unit tested and would report 0% for a structural
reason. Their testable logic is deliberately factored into `lib/site-origin.ts`, which is covered.

The production build registers both generated documents as dynamic (`ƒ`), which is required for per-host
output:

```
ƒ /menu/[category]
ƒ /robots.txt
ƒ /sitemap.xml
```

## 4. End-to-end evidence

Run against the real ASP.NET Core backend, the seeded PostgreSQL database, the test proxy, and the
**production** frontend build.

| Suite | Result |
| --- | --- |
| `e2e/seo.spec.ts` (13 tests) | all passed |
| `e2e/menu.spec.ts` | 4 passed, 1 skipped (viewport-specific) |
| `e2e/restaurant.spec.ts` (2 tests, includes owner sign-in) | all passed |
| `e2e/design.spec.ts` (8 tests, all five designs) | all passed |

`seo`, `menu`, and `restaurant` were run together in one process against a freshly started proxy:
**19 passed, 1 skipped, 0 failed.** `design.spec.ts` was run separately because it needs its own base URL
and mutates proxy state (section 4.1).

`design.spec.ts` matters here beyond its own scope: `DesignMenuBrowser` is shared by all five website
designs and Phase 6 changed its category-link `href`. All eight design tests passing is the evidence that
the change did not regress any design, including the keyboard-navigation and reduced-motion cases.

### 4.1 Harness limitation on Windows

`npm run test:e2e` **cannot run on this Windows host.** `playwright.config.ts`, `playwright.design.config.ts`,
and `playwright.real.config.ts` all start the frontend with a POSIX inline environment prefix
(`OMNI_REST_API_BASE_URL=… npm run start`), which Windows `cmd` rejects with
`'OMNI_REST_API_BASE_URL' is not recognized as an internal or external command`. This is pre-existing and
unrelated to Phase 6.

The suites above were therefore executed against servers started by hand, using scratch Playwright configs
with the `webServer` block removed. The tests themselves are unmodified and are what CI will run on Linux.

Two further notes for anyone reproducing this locally:

- **Node cannot resolve `*.localhost`; browsers can.** `page.goto("http://menu.localhost:3000")` works,
  but Playwright's `request.*` fixture is Node-side and fails with `getaddrinfo ENOTFOUND`. Every
  request-based assertion in `seo.spec.ts` therefore dials `127.0.0.1:3000` with an explicit `Host`
  header — which is what a real reverse proxy does, and exactly the input the tenant resolution reads.
- **The test proxy is stateful and its fixtures are mutable.** `design.spec.ts` publishes a design change
  that mutates the proxy's in-memory restaurant, so running it before another suite in the *same* proxy
  process changes which design later tests render. The committed configs each start a fresh proxy
  (`reuseExistingServer: false`), so this only affects hand-run sessions.

### 4.2 What the SEO suite proves

| PR-17 task | Evidence |
| --- | --- |
| 2 `robots.txt` | Served `200`; disallows `/admin`, `/api`, `/dashboard`, `/login`, `/register`; does not disallow `/media`; names the requesting tenant's sitemap. Asserted on two different hosts, each naming itself. |
| 3 `sitemap.xml` | Valid `urlset`, correct XML content type, contains `/`, `/menu`, and `/menu/starters`; contains no `/admin`, `/api`, or preview URL; `lastmod` is a real publication date. |
| 4 Meta robots | `index, follow` on all three public routes; `noindex` on `/admin/login` and on the `404` page; `X-Robots-Tag: noindex` present on `/admin/login` even though the header is redundant with the page tag. |
| 5 Canonical | Absolute and self-referencing on `/`, `/menu`, and `/menu/starters`. |
| 6 Duplicate URLs | `/menu?ref=qr&sort=price&page=2` emits the parameter-free canonical `/menu`. `/menu/` redirects `308` to `/menu`. |
| 7 Status codes | `200` for `/`, `/menu`, `/menu/starters`; **real** `404` for an unknown category, an unknown path, and an unknown tenant. No soft `404`. |
| 8 Verification | The whole suite is the Task 8 deliverable. |

| PR-18 / PR-19 | Evidence |
| --- | --- |
| Restaurant JSON-LD | Valid `@context`/`@type`, absolute `url`, seven `openingHoursSpecification` entries, `hasMenu` and `menu` both pointing at `/menu`. |
| No empty properties | A recursive walk of the live payload asserts no `null`, `""`, `[]`, or `{}` anywhere. Additionally, the seeded tenant has no address, phone, description, or social links, so `address`, `telephone`, `email`, `description`, `geo`, and `sameAs` are asserted **absent** — the rule observed against real sparse data rather than a fully populated fixture. |
| Menu JSON-LD | `Menu` node with sections and priced `MenuItem` offers in `CAD`. |
| Category page | Renders the category heading and its dishes with **zero** hidden dish headings, which is the indexing weakness `/menu` has and this route exists to resolve. |
| Internal linking | `/menu` links to `/menu/desserts` with a real `href`, not a fragment. |

## 5. Defects found and fixed during verification

Both were found by running the code, not by reading it.

1. **A transient upstream failure was being reported as `404`.** The request-memoized `readSite()` initially
   treated *every* `PublicMenuApiError` as "nothing published", so a `502` from the API rendered the
   not-found page with a `404` status instead of the error boundary with a `5xx`. That is materially worse
   than an outage: a `404` tells a crawler the page is permanently gone. Now only a `404` counts as an
   absence and every other status propagates. Caught by the existing
   `menu.spec.ts` `error.localhost` test, which was strengthened with an explicit
   `expect(errorResponse?.status()).toBeGreaterThanOrEqual(500)` assertion.

2. **Canonical URLs were derived from the wrong environment variable.** `resolveScheme` initially read
   `OMNI_REST_FORWARDED_PROTO`. That variable is set to `https` in local development *as a deliberate lie*,
   so the API believes the request arrived over TLS and will issue its `Secure` auth cookies over plain
   HTTP (`local-dev.ps1`, and `playwright.real.config.ts`). Reusing it would have made every local canonical
   and sitemap entry claim `https://…:3000` for a site served over `http`. Canonical resolution now reads
   its own `OMNI_REST_PUBLIC_SCHEME`, with a unit test asserting that setting `OMNI_REST_FORWARDED_PROTO`
   has no effect on the emitted origin.

## 6. Not verified

These are recorded as open, not as passed.

- **Google Rich Results Test and the Schema.org Validator.** Both require a publicly reachable URL, so they
  cannot run against `menu.localhost`. They remain manual staging-time checks. The automated suite asserts
  structural validity, absolute URLs, and the no-empty-property rule, which is what is verifiable locally.
- **`dotnet format --verify-no-changes`.** Fails for the pre-existing environmental reason in section 2.1.
- **`npm run test:e2e` as a single command.** Blocked on Windows by the harness limitation in section 4.1.
  The individual suites were run and passed.
- **Media upload paths for logo and cover image.** The new `PUT /api/v1/admin/restaurant/logo` and
  `/cover-image` endpoints are covered by integration tests that attach an already-uploaded asset, which
  passes. Uploading the underlying bytes cannot be exercised on Windows (section 2).
- **Field-level SEO outcomes.** Nothing here is evidence of ranking or indexing behavior in production;
  it is evidence that the documents, tags, and status codes are correct.
