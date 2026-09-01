# Phase 7 — Implementation Evidence

Observed output from the verification runs, recorded verbatim. Nothing here is predicted or inferred.

## 1. Environment

Windows 11 host, but the toolchain lives in WSL2 Ubuntu: Windows carries only .NET 8 and has no Node or
Docker, while `global.json` pins .NET SDK **10.0.302** with `"rollForward": "disable"`.

| Tool | Version | Pinned by |
|---|---|---|
| .NET SDK | 10.0.302 | `global.json` |
| Node | v26.5.0 | `.node-version` |
| npm | 11.17.0 | `src/frontend/package.json` |
| Docker | 29.2.1 | — |

Backend and frontend were built and tested from the Linux-side mirror at
`~/projects/omni-rest-infrastructure`, the same copy `start-app.ps1` uses, because the repository's own
setup guide forbids building off `/mnt/c`.

## 2. Baseline before Phase 7

Taken on `main` at `7ecd51d` (Phase 6 merged) before any Phase 7 change:

```
Passed!  - Failed:     0, Passed:   237, Skipped:     0, Total:   237, Duration: 44 s - OmniRest.Api.Tests.dll (net10.0)
```

This matches the figure `specifications/phase-6/README.md` records, confirming the starting point.

## 3. Backend suite after Phase 7

```
Passed!  - Failed:     0, Passed:   242, Skipped:     0, Total:   242, Duration: 43 s - OmniRest.Api.Tests.dll (net10.0)
```

237 → 242: five added tests, zero regressions.

- `TenantIsolationApiTests` — 3 new integration tests
- `OwnerSecurityTests` — 2 new unit tests (12 → 14)

The new isolation tests, run in isolation:

```
Passed OmniRest.Api.Tests.Integration.TenantIsolationApiTests.BoundTenantScopeFiltersEveryRestaurantOwnedSetAndSuppressionRestoresFullAccess [2 s]
Passed OmniRest.Api.Tests.Integration.TenantIsolationApiTests.OwnersReachOnlyTheirOwnRestaurantAndAnonymousCallersAreRefused [1 s]
Passed OmniRest.Api.Tests.Integration.TenantIsolationApiTests.RestaurantResolvesByCustomDomainAndBySubdomainSlugAndUnknownHostsAreNotFound [594 ms]
```

**Note on the Windows figure.** Phase 5 and 6 record 11 backend tests that cannot pass on native Windows,
because `LocalMediaStorage` uses Unix libc P/Invoke. Every run above was executed on Linux through WSL2,
so all 242 pass. A native-Windows run would still show those 11 pre-existing failures.

## 4. Frontend suite after Phase 7

`npm run lint && npm run typecheck && npm run test` — lint and typecheck gate the test run through `&&`,
so a green test summary implies both were clean:

```
 Test Files  29 passed (29)
      Tests  244 passed (244)
   Duration  4.86s
```

Baseline was 25 files / 224 tests. New files: `lib/tenant-host.test.ts`, `lib/brand.test.ts`,
`components/PublicShell.test.tsx`, `app/media/[...path]/route.test.ts`, plus added cases in the API-proxy
and design-renderer suites.

`npm run test:coverage` passes its thresholds (statements 84.62, branches 76.10, functions 81.64, lines
81.32). `npm run build` succeeds with every route still dynamic, and `npm run test:design-assets` passes
against that build.

**Playwright was not run.** All three configs start the frontend with a POSIX inline environment prefix
that `cmd` rejects, a limitation `specifications/phase-6/implementation-evidence.md` already records.
`e2e/seo.spec.ts` was updated for two legitimately changed behaviours — `/` on an unknown tenant is now
404 rather than 200, and a new case asserts the seeded `fr-CA` tenant serves `<html lang="fr-CA">` while
the `en-CA` tenant serves `en-CA` — but those assertions are unverified by execution.

## 5. Migration

One migration added: `20260910120000_Phase7RestaurantSlug`, hand-written in the Phase 6 style with
matching `[DbContext]`/`[Migration]` attributes, an explicit `schema: "public"` on every operation, and a
`Down` that is an exact inverse. `MenuDbContextModelSnapshot.cs` was updated by hand to match.

`MigrationTests.CleanDatabaseMigratesToLatestModel` asserts both that no pending migrations remain after
migrating a clean database — which is what catches model/snapshot drift — and that the applied count is
exactly 10, updated from 9. Both pass, so the model and the migration agree.

The check constraint text is duplicated between `RestaurantSlugs.CheckExpression` and the migration by
necessity; the constant carries a comment saying the two must stay identical.

## 6. Change inventory

50 files modified, 19 added.

**Backend, added**

| File | Purpose |
|---|---|
| `Infrastructure/TenantScope.cs` | Ambient tenant, drives the query filters (PR-20 Task 4) |
| `Infrastructure/RestaurantContext.cs` | Per-request memoized resolution (PR-20 Task 3) |
| `Infrastructure/TenantMediaMiddleware.cs` | Per-tenant media serving (PR-20 Task 8) |
| `Data/Phase7Model.cs` | Slug mapping and the 20 query filters |
| `Data/Migrations/20260910120000_Phase7RestaurantSlug.cs` | The slug column, index, and check |
| `Restaurants/RestaurantConfigurationService.cs` | Centralized configuration (PR-20 Task 5) |
| `Security/CurrentUserContext.cs` | PR-21 Task 2 |
| `Security/RestaurantAccessGuard.cs` | PR-21 Task 4 |
| `Security/SecurityAuditLog.cs` | PR-21 Task 10 |
| `Tests/Integration/TenantIsolationApiTests.cs` | PR-21 Task 11 |

**Backend, modified** — `MenuDbContext.cs` (optional tenant scope, `Slug`, `ConfigurePhase7`),
`RestaurantResolver.cs` (three-strategy chain), `PublicMenuReader.cs` (resolves through the context),
`OwnerSecurity.cs` (policy, roles, binding, memoization), `PublicMenuProjection.cs`
(`PlatformBaseDomains`), `GuardedSampleDataSeeder.cs` (slugs, per-tenant media layout), `Program.cs`
(registrations, tenant-scoped media), the model snapshot, and four test files.

**Frontend, added** — `lib/tenant-host.ts` (one fail-closed host rule set), `lib/brand.ts`,
`lib/tenant-document.ts`, `lib/admin-data.ts`, `app/error.tsx`, and four test files.

**Frontend, modified** — the three host-forwarding surfaces, `lib/menu-api.ts`, `lib/public-data.ts`,
`proxy.ts`, the root layout and home page, `PublicShell`, all five designs plus the shared design parts
and their stylesheets, the admin layout and dashboard, `RestaurantPreview`, and `vitest.config.ts`.

**Requirements** — PR-20 Task 10 removed from
`requirments/Phase 7/Phase_7_PR-20_Independent_Restaurants.md`, section and summary row, at the product
owner's direction.

## 7. Defects found and fixed while implementing

1. **Media path traversal in the frontend.** `app/media/[...path]/route.ts` validated segments with
   `/^[a-zA-Z0-9._-]+$/`, which accepts `.` and `..`; `new URL` then resolves them, so a dot-only segment
   could climb out of the per-restaurant directory. Dot-only segments are now rejected, and the backend
   middleware independently requires the leading segment to be a 32-digit GUID.

2. **Error responses cached publicly.** The media proxy applied its `public, max-age=3600` fallback to
   every response, so an upstream 404 or 503 was cached publicly for an hour. It now applies only to 2xx,
   and `Vary: Host` was added.

3. **Draft media in the shared image-optimizer cache.** `RestaurantPreview` rendered unpublished media
   through the optimizer while every other admin surface opted out. Now consistent.

## 8. Not done, and why

- **PR-20 Task 10** — deleted from the requirements at the product owner's direction.
- **PR-20 Task 11** — out of scope at the product owner's direction; PR-21 Task 11's isolation tests
  shipped instead.
- **PR-21 Task 7's literal method names** — satisfied by the ambient query filters and the existing
  scoped services, mapped one-to-one in `README.md` section 2.5. A renaming shim would be dead code.
- **Playwright end-to-end verification** — blocked by a pre-existing platform limitation, not by this
  phase.
