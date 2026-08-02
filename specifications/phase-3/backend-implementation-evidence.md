# Phase 3 Backend Implementation Evidence

**Implementation base:** `46db811`

**Scope:** `src/backend/**`, root backend instructions, and Phase 3 backend documentation. No Phase 4 menu-management API or deployment action is included.

## Acceptance mapping

| Criterion | Backend implementation | Automated evidence |
| --- | --- | --- |
| A1 authentication and session security | ASP.NET Core Identity in `MenuDbContext`; active owner memberships; controlled provisioning/revoke/disable commands; secure cookie; antiforgery; one configured password verification for known and unknown syntactically valid logins; generic login failures; Identity lockout plus HMAC-partitioned normalized-account limiter and a separate high-capacity global circuit; 30-minute idle/12-hour absolute session; per-request user, stamp, and membership validation; production fail-closed protected durable Data Protection, login partition secret, and explicit trusted-proxy/network configuration; untrusted forwarding headers are stripped; HTTPS/HSTS and security headers; safe `/admin` return paths | `AuthApiTests` proves six unrelated identities remain independent, one normalized identity across cookie jars/spoofed headers reaches 429, known/unknown failure shapes match, and Identity lockout occurs; `OwnerSecurityTests` validates production configuration |
| A2 tenant authorization | `RequireOwner` plus active-membership handler; `IOwnerRestaurantContext` derives restaurant from the authenticated user; no admin mutation accepts a restaurant ID; resource lookups always include the derived restaurant | anonymous, revoked-membership, cross-tenant media, and cross-tenant status cases in integration tests |
| A3 restaurant management | Separate admin DTOs for profile/address, weekly split/overnight hours, special hours CRUD, platform social links, and ready media upload/list/alt-text/main-image selection/removal; server-side decoded image validation with byte, MIME, dimension, and pixel limits; randomized tenant/UUID storage using Linux/macOS no-follow directory descriptors and fixed-ABI create/install operations; every surviving blob is forced to owner-only `0600`; exact-blob compensation retains the original tenant descriptor across the database outcome and remains contained during a tenant link swap; unsupported platforms fail closed; ETags/409; PostgreSQL transactions; stable Problem Details codes and field errors; audit rows | `RestaurantValidationTests`, `AdminRestaurantApiTests`, and `MediaStorageTests` covering exact stored bytes/content type, repeated create mode/readability and descriptor stability, create-new collisions, normal exact compensation, cancellation, traversal, symlinked tenant store/delete, outside sentinels, and database failure/cancellation after a tenant-directory link swap; PostgreSQL constraints and migration tests |
| A4 publication | Each edit transaction stores an immutable public snapshot in `publication_outbox` at the exact draft version. Atomic claims use pending/processing/succeeded/failed state plus a lease; a hosted worker recovers pending and stale processing work after host restart. The worker observes migration-before-start ordering and waits without querying the outbox while migrations are pending. Dispatch atomically activates one publication, invalidates the old memory-cache version, and retries idempotently. Failure rolls back activation and retains the previous public snapshot. Preview is authenticated, private/no-store, and noindex. | publication failure/retry/old-snapshot and crash/restart recovery tests; transaction/audit/outbox assertions; real-stack migration-before-Kestrel fixture |
| A5 public compatibility and phone | Additive `restaurant` property on the Phase 2 `PublicMenuResponse`; `GET /api/v1/public/restaurant`; E.164 plus display phone values; address, hours, special hours, status, social links, and ready main-image variants; schedule status correctly distinguishes current-day overnight start, prior-day carry, exclusive close boundaries, and today-special overrides; legacy snapshot backfill during migration | existing Phase 2 menu tests plus exhaustive `RestaurantStatusCalculatorTests`, public profile/phone, and staged-upgrade tests |
| A6 backend verification | xUnit unit tests, `WebApplicationFactory`, Testcontainers PostgreSQL 18, migration upgrade checks, security/adversarial cases, OpenAPI check, and this runbook/evidence | exact commands recorded below |

## Stable problem codes

The Phase 3 backend emits stable codes including `auth_validation`, `auth_invalid_credentials`, `auth_rate_limited`, `auth_unavailable`, `csrf_invalid`, `admin_validation`, `concurrency_conflict`, `data_conflict`, `special_date_duplicate`, `media_not_ready`, `admin_resource_not_found`, and `publication_dispatch_failed`. Problem payloads do not disclose passwords, cookies, antiforgery values, database exceptions, account existence, or cross-restaurant membership details.

## Verification commands

Run from repository root with Docker available:

```sh
dotnet restore src/backend/OmniRest.sln
dotnet build src/backend/OmniRest.sln --no-restore
dotnet test src/backend/OmniRest.sln --no-build --logger "console;verbosity=normal"
dotnet format src/backend/OmniRest.sln --verify-no-changes --no-restore
dotnet ef migrations has-pending-model-changes --project src/backend/OmniRest.Api/OmniRest.Api.csproj --startup-project src/backend/OmniRest.Api/OmniRest.Api.csproj --no-build
```

The test suite uses PostgreSQL 18 through Testcontainers; it does not replace relational behavior with EF's in-memory provider.

Final V019 ABI rework verification on macOS: 93 backend tests passed, including 9 focused media-storage tests and the static-serving integration assertion for exact uploaded bytes and `image/png`; the solution restored and built with zero warnings/errors; formatting passed with zero findings; and EF reported no model changes after the migration. The focused stress test performed 96 creates and verified exact `0600` mode, readable bytes, stable descriptor count, and post-swap containment; a separate collision test proved create-new does not overwrite or delete an existing blob and leaves no temporary file. The preceding dependency gate reported no vulnerable direct or transitive NuGet packages. The real browser fixture applied the migration to a fresh PostgreSQL 18 container before exercising the API through Kestrel. Linux uses the same descriptor-relative contract with fixed-ABI Linux creation and no-follow operations; execution in Linux CI remains part of independent verification.

## Explicitly unverified or outside this backend slice

- Manual iPhone Safari and Android Chrome dialer-launch verification is unverified and must remain so until performed on physical devices.
- Browser/layout/accessibility verification is recorded in `frontend-implementation-evidence.md`; this backend evidence does not claim physical-device coverage.
- Edge cache revalidation within 60 seconds requires a deployed same-origin edge/web environment; the backend outbox and in-process memory-cache invalidation are verified locally, but deployed edge timing is unverified.
- Production certificate installation, durable media/key-ring volume behavior, forwarded proxy identity, HSTS, and restore procedures require staging deployment evidence. Production deployment is human-controlled and was not performed.
