# Phase 5 — Implementation evidence

**Date:** 2026-08-30

**Scope:** PR-15 Public Gallery, PR-16 Gallery Management

**Specification:** `specifications/phase-5/README.md`, `pr-15-public-gallery.md`, `pr-16-gallery-management.md`

## 1. Route surface shipped

| Method | Route | Auth | Notes |
| --- | --- | --- | --- |
| `GET` | `/api/v1/public/restaurant/gallery` | anonymous | Published snapshot, `ETag` + `304`, empty list is `200` |
| `GET` | `/api/v1/admin/gallery` | owner | All rows, ordered; emits `ETag` |
| `POST` | `/api/v1/admin/gallery` | owner + antiforgery + `If-Match` | `multipart/form-data`, 6 MB request cap |
| `PATCH` | `/api/v1/admin/gallery/reorder` | owner + antiforgery + `If-Match` | Mapped before `/{id}` |
| `PATCH` | `/api/v1/admin/gallery/{id:guid}` | owner + antiforgery + `If-Match` | Caption, alt text, active state |
| `DELETE` | `/api/v1/admin/gallery/{id:guid}` | owner + antiforgery + `If-Match` | Renumbers survivors |

`PublicRestaurantResponse` also carries `gallery`, so the public home page server-renders the section with no second
request.

## 2. Backend files

New: `Data/Phase5Model.cs`, `Data/Migrations/20260827120000_Phase5RestaurantGallery.cs` (+ `.Designer.cs`),
`Menus/GalleryManagementContracts.cs`, `Menus/GalleryValidation.cs`, `Modules/AdminGalleryEndpoints.cs`,
`Restaurants/GalleryManagementService.cs`, `Restaurants/GalleryThumbnails.cs`.

Modified: `Data/MenuDbContext.cs`, `Data/Phase3Model.cs`, `Data/Migrations/MenuDbContextModelSnapshot.cs`,
`Infrastructure/GuardedSampleDataSeeder.cs`, `Menus/PublicMenuReader.cs`, `Modules/ApiV1Endpoints.cs`,
`Modules/PublicRestaurantEndpoints.cs`, `Program.cs`, `Restaurants/PublicRestaurantContracts.cs`,
`Restaurants/RestaurantManagementService.cs`.

`GalleryManagementService` is a further `partial` on `RestaurantManagementService`, so it reuses `MutateCoreAsync`,
`LoadAggregateAsync`, `StageAsync`, `DraftETag`, the publication outbox, the audit writer, and the dispatcher.
No parallel mutation pipeline was introduced.

## 3. Frontend files

New: `components/designs/shared/DesignGallery.tsx`, `components/admin/GalleryManager.tsx`,
`components/admin/useGalleryDraft.ts`, `lib/gallery-admin-contract.ts`,
`app/admin/(protected)/gallery/page.tsx`, plus the two test files.

Modified: `lib/restaurant-contract.ts`, `lib/server-api.ts`, `lib/browser-api.ts`, `lib/menu-contract.ts`,
`components/designs/shared/designClassNames.ts`, the five `*Home.tsx` design components, the five
`public/design-previews/styles/*.css`, `app/admin/(protected)/layout.tsx`, `app/admin/admin.module.css`,
`test/fixtures.ts`.

## 4. Verification

Run on Windows on 2026-08-30.

| Gate | Result |
| --- | --- |
| `dotnet build` (solution) | **Pass** — 0 errors. Two `NU1903` warnings for `SSH.NET` in the test project are pre-existing and unrelated |
| Backend unit tests | **Pass except a pre-existing platform failure** — all gallery unit tests pass (13 `GalleryValidationTests`, 4 `GalleryThumbnailTests`). 8 `MediaStorageTests` fail on Windows for want of symlink privileges; `MediaStorage.cs` is untouched by Phase 5. See section 5 item 4 |
| Backend suite on **Linux** | **201 / 201 pass** — run in a `mcr.microsoft.com/dotnet/sdk:10.0` container with the Docker socket mounted so Testcontainers spins sibling containers. This is the authoritative run: it exercises the media-storage write path that Windows cannot |
| Backend suite on **Windows** | 201 total, 190 passed, 11 failed — all 11 are the Windows storage-platform failures in section 5 items 4 and 6, and all 11 pass on Linux |
| `npm run lint` | **Pass** — `--max-warnings=0`, clean |
| `npm run typecheck` | **Pass** |
| `npm run test` | **Pass** — 23 files, 170 tests. (`RestaurantEditor.test.tsx` intermittently exceeds the 5 s default timeout on this machine; it passed in the final runs. See section 5 item 2) |
| `npm run test:coverage` | **Pass** — statements 80.89%, branches 75.29%, functions 81.47%, lines 84.03%. Three of the four thresholds were **already failing before Phase 5**; the new gallery tests brought them back over the line |
| `npm run build` | **Pass** — `/admin/gallery` present in the route manifest |
| `npm run test:design-assets` | **Pass** — all five stylesheets stay prefix-isolated and byte-distinct; isolated selector counts rose to 59/67/67/68/68 |

New test coverage: 17 backend unit tests (13 `GalleryValidationTests`, 4 `GalleryThumbnailTests`), 10 integration
tests (5 `AdminGalleryApiTests`, 5 `PublicGalleryApiTests` — none yet executed, see section 5 item 1), 16
`DesignGallery.test.tsx` cases, 14 `GalleryManager.test.tsx` cases, plus gallery cases across all five renderers in
`DesignRenderers.test.tsx`.

## 5. Open items

1. **Resolved.** The Docker daemon stopped mid-session and blocked every integration test
   (`DockerUnavailableException`). Docker Desktop was restarted and the full suite has now been executed.
   All gallery integration tests pass except the two that perform a real upload, which are blocked by the Windows
   storage limitation in item 6 — not by any defect. Specifically verified as passing:
   ordering and contiguous renumbering after delete, reorder, authentication, antiforgery, `If-Match` concurrency,
   cross-tenant `404`, the 50-image cap being enforced **before** storage is touched, and all five
   `PublicGalleryApiTests` cases (active-only ordering, `304` revalidation, unknown-host `404`, empty gallery,
   and republish-changes-the-response).
   The documented remedy for a future recurrence is to move `%LOCALAPPDATA%\Docker\run` and
   `%LOCALAPPDATA%\docker-secrets-engine` aside with Docker stopped and restart Docker Desktop — never
   "Reset to factory defaults", which would destroy the seeded Postgres volume.
1b. **A second real Phase 5 regression was caught by the Linux run and fixed.**
   `AdminRestaurantApiTests.ScheduleSocialSpecialAndMainImageMutationsAreTransactionalAndTenantSafe` took
   `SingleAsync()` over every media asset owned by the sample restaurant to pick a main-image candidate. The Phase 5
   seeder adds gallery photos as media assets of that same restaurant, so the query began returning several rows and
   threw `Sequence contains more than one element`. The query now excludes gallery-backed assets, which keeps the
   original `SingleAsync` strictness rather than relaxing it to `FirstAsync`.
   This is worth noting as a process point: the failure is platform-independent, but on Windows it was **masked** by
   the upload failure occurring earlier in the same test, so it looked like one more storage-platform casualty.
   Only the Linux run separated the two.
1a. **One real Phase 5 regression was caught by that run and fixed.**
   `MenuApiTests.OpenApiDocumentsPublicAndPhaseThreeContractsWithoutPersistenceFields` asserts the exact set of
   admin routes exposing `PATCH`, and the new gallery routes had not been added to it — the definition-of-done item
   "OpenAPI contract expectations updated when the route surface changes" had been missed. The expectation now
   includes `/api/v1/admin/gallery/reorder` and `/api/v1/admin/gallery/{id}`, plus positive assertions that the
   admin and public gallery paths appear in the document. This defect was invisible while Docker was down.
2. **`RestaurantEditor.test.tsx` pre-existing flake.** The test "edits and saves each restaurant section while
   preserving accessible structure" types 13 fields character-by-character with `userEvent` and exceeds the 5 s
   default timeout on this machine. It passes with `--testTimeout=30000`. It does not use the gallery fixture and
   `RestaurantEditor.tsx` was not modified by Phase 5. Left unchanged as out of scope.
4. **8 `MediaStorageTests` fail on Windows.** Full run: 201 total, 137 passed, 64 failed — 56 of those are the
   Docker-blocked integration tests and 8 are `Unit.MediaStorageTests`, which exercise the hardened Unix storage
   path and require symlink privileges (`System.IO.IOException: A required privilege is not held by the client`).
   They are pre-existing and environmental: `Restaurants/MediaStorage.cs` is not modified by Phase 5. They were
   already failing before this work began, and an earlier draft of this document wrongly described the unit suite
   as fully green.
5. **`dotnet format --verify-no-changes --severity warn` fails repo-wide** on 38 pre-existing files with CRLF/charset
   violations against the `.editorconfig`. None of the Phase 5 files are among them. Normalizing line endings across
   38 untouched files is a separate decision and was deliberately not bundled into this change.
6. **Gallery upload cannot be exercised on Windows.** `LocalMediaStorage` writes through Unix `libc` P/Invoke and
   throws `PlatformNotSupportedException`, surfacing as `500` on the upload route; reading and serving gallery
   images is unaffected. Pre-existing Phase 3 limitation, recorded in `README.md` section 6, and the same root
   cause as item 4. Four integration tests are blocked by it, and two of them are **Phase 3 tests that never
   touched the gallery** (`AdminRestaurantApiTests.ReadyMediaUploadListing…` and
   `…ScheduleSocialSpecialAndMainImageMutations…`), which is what confirms the cause is the platform rather than
   Phase 5. **All of these pass on Linux**, so the two-variant thumbnail path, the distinct storage keys, and the
   storage-compensation behaviour are now genuinely verified — just not on this Windows host.

   How to reproduce the Linux run (no WSL distro is installed on this machine; only Docker Desktop's utility VM):
   copy `src/backend` to a scratch directory without `bin`/`obj` — which also places it outside `global.json`, whose
   pinned 10.0.302 SDK is not in the image — then:

   ```bash
   docker run --rm -v "<scratch>":/src -v //var/run/docker.sock:/var/run/docker.sock \
     -e TESTCONTAINERS_HOST_OVERRIDE=host.docker.internal \
     --add-host host.docker.internal:host-gateway \
     -w /src mcr.microsoft.com/dotnet/sdk:10.0 dotnet test OmniRest.Api.Tests
   ```

## 5a. Review round and defects fixed

An independent findings-first review was run against the whole Phase 5 diff before sign-off. It returned **reject**,
with two shipping defects. Both were confirmed by tracing the code and then fixed:

1. **Upload deleted the blobs of an already-committed row (HIGH).** The `catch` around the upload mutation also
   covered work that runs *after* `transaction.CommitAsync` — `DispatchAsync`, the aggregate reload, and the outbox
   query. A cancelled request (user navigates away) made `DispatchAsync` throw `OperationCanceledException`, the
   catch compensated both blobs, and the committed, published gallery row was left pointing at deleted files.
   *Fix:* `MutateCoreAsync` gained an optional `onCommitted` callback fired immediately after commit; upload now
   compensates only when the transaction did **not** commit, and on a post-commit throw it logs and rethrows while
   keeping the blobs.
2. **The lightbox lost focus and stopped responding to the keyboard (HIGH).** `disabled` on the nav button blurred
   the button the user had just clicked, and the key handler sat on a dialog `<div>` with no `tabIndex`, so Escape
   and the arrow keys died and Tab escaped the `inert` page — WCAG 2.1.2. *Fix:* the dialog takes `tabIndex={-1}`
   and an effect keyed on the photo index returns focus into the dialog whenever it lands outside or on a disabled
   control. Regression tests were proven to fail without the fix.
3. **Blob compensation aborted before the thumbnail (MEDIUM).** A throw compensating the original leaked the
   thumbnail. *Fix:* both are attempted independently, failures collected into one `AggregateException`.
4. **The ordering unit tests guarded dead code (MEDIUM).** `GalleryOrdering.Assign`/`Renumber` were called by
   nothing in production; the live logic in `RestackGalleryAsync` had no unit coverage, so the ordering tests would
   have passed against a broken implementation. *Fix:* `RestackGalleryAsync` and the delete path now route through
   `GalleryOrdering.Stage`/`Assign`/`Renumber`, and the test that asserted its own re-implemented arithmetic was
   rewritten against the helper. The staged **flush** still has no unit coverage — it needs a live `DbContext` and
   remains integration-only.
5. **The two-variant thumbnail path was never exercised (MEDIUM).** The only upload test used a 1×1 PNG, which
   takes the `ReusedSource` branch, and asserted `ImageUrl == ThumbnailUrl` — the opposite of its own name.
   *Fix:* the main upload test now generates a 1200×800 source so the real two-blob path runs; the small-source
   case was split out and named accurately. The oversized-upload body was reduced to 5.5 MB so it provably hits the
   5 MB media cap rather than possibly tripping the 6 MB request-size limit.
6. **Missing spec-required coverage (MEDIUM).** `PublicGalleryApiTests.cs` was added for the public read, and
   `DesignRenderers.test.tsx` gained gallery-present / gallery-empty / gallery-absent cases across all five designs
   — the last of which pins the `restaurant?.gallery ?? []` fallback for pre-Phase-5 snapshots.
7. **Two LOW findings** were also fixed: the admin thumbnail declared the original's intrinsic dimensions, and the
   spec's reduced-motion clause had no shimmer to disable.

One finding was resolved **against** the code and **in favour of** the implementation: the spec claimed anonymous
admin requests return `403`, but cookie authentication challenges with `401`. `pr-16` section 7 was corrected.

`scripts/assert-design-assets.mjs` was extended during this round: it now namespace-checks `@keyframes` names and
no longer mis-parses keyframe steps as rule selectors. This **strengthens** the guard — it previously could not see
animation names at all, and would have rejected any `@keyframes` block outright. The whole-file class-selector
scan still runs over keyframe bodies, so a rogue class inside one is still caught.

## 6. Traceability

| Requirement | Where satisfied |
| --- | --- |
| PR-15 T1 data model | `pr-16` section 1 (shared table) |
| PR-15 T2 public API | `Modules/PublicRestaurantEndpoints.cs` |
| PR-15 T3, T6, T7, T9 grid, states, performance, errors | `DesignGallery.tsx` |
| PR-15 T4, T5, T8 viewer, navigation, accessibility | `DesignGallery.tsx` lightbox |
| PR-15 T10 integration | Five `*Home.tsx` designs + five design stylesheets |
| PR-16 T1 model, T3 storage | `Phase5Model.cs`, migration, `GalleryThumbnails.cs` |
| PR-16 T2, T4, T5, T6 upload, read, delete, reorder | `GalleryManagementService.cs`, `AdminGalleryEndpoints.cs` |
| PR-16 T7, T8 validation, business rules | `GalleryValidation.cs`, `GalleryOrdering` |
| PR-16 T9 authorization | Owner policy + antiforgery filter + `If-Match` on every mutation |
| PR-16 T10 testing | Section 4, subject to the integration-test caveat in section 5 |
