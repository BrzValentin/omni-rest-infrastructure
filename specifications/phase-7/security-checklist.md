# Phase 7 — Final Security Review (PR-21 Task 12)

**Scope:** every owner-facing module, reviewed for authorization consistency and for bypasses.
**Method:** read every admin endpoint and its service path; confirm where the restaurant id originates;
confirm the ambient tenant filter is bound before the handler runs; confirm denials are logged.

## 1. Every owner module uses the shared authorization

PR-21 Task 12 requires that all modules use one authorization mechanism rather than local variants.

| Module | Endpoints | Policy | Restaurant id source | Cross-tenant answer |
|---|---|---|---|---|
| Restaurant profile, hours, images, design | `Modules/AdminRestaurantEndpoints.cs` | group `RequireAuthorization(OwnerPolicy)` | owner membership | 404 `*_not_found` |
| Special hours | same file | inherited | owner membership | 404 |
| Media assets | same file | inherited | owner membership | 404 `media_asset_not_found` |
| Publication status / retry | same file | inherited | owner membership, query scoped by `RestaurantId` | 404 |
| Menu and categories | `Modules/AdminMenuEndpoints.cs` | inherited | owner membership | 404 `menu_category_not_found` |
| Dishes | `Modules/AdminDishEndpoints.cs` | inherited | owner membership | 404 |
| Gallery | `Modules/AdminGalleryEndpoints.cs` | inherited | owner membership | 404 `gallery_image_not_found` |

There is exactly one policy definition, registered under two names (`RequireOwner` and `RestaurantOwner`)
that resolve to the same requirement set. **Two names, one rule — never two rules.**

- [x] No module defines its own ownership check.
- [x] No module reads a restaurant id from a route segment, body field, query string, or header.
- [x] Every mutating endpoint additionally carries CSRF validation and an `If-Match` draft-ETag gate.
- [x] The draft ETag embeds the restaurant id, so a stale tag from another tenant cannot validate.

## 2. Server never trusts a client-supplied restaurant id

PR-21 Task 6's central requirement.

- [x] Grep for a `{restaurantId}` route segment across `Modules/`: **no matches**.
- [x] No request DTO in `AdminRestaurantContracts.cs`, `MenuManagementContracts.cs`, or
      `GalleryManagementContracts.cs` carries a restaurant identifier.
- [x] The twelve endpoints that do accept a client-supplied *child-entity* GUID resolve it either against
      the tenant-scoped aggregate or with an explicit `&& RestaurantId ==` predicate.
- [x] Forging another tenant's child id yields 404, verified by existing tests in the menu, gallery, and
      restaurant suites.

## 3. Defence in depth — four independent layers

A bypass would have to defeat all four:

1. **Authorization.** `ActiveOwnerHandler` denies any caller without an active owner membership.
2. **Derivation.** The restaurant id comes from that membership, never from the request.
3. **ORM.** The ambient tenant filter is bound during authorization and constrains all 20 restaurant-owned
   entity types for the remainder of the request.
4. **Database.** Composite tenant-carrying foreign keys make a cross-tenant row reference physically
   impossible; a direct SQL attempt raises a constraint violation, which
   `MenuApiTests.PostgreSqlConstraintsAndAvailabilityDefaultProtectTenantData` asserts.

- [x] Layer 3 is bound *before* handler code executes, so a handler that omits its own predicate is still
      safe. Verified by `TenantIsolationApiTests.BoundTenantScopeFiltersEveryRestaurantOwnedSetAndSuppressionRestoresFullAccess`.
- [x] A request cannot straddle two tenants: re-binding to a different restaurant throws.

## 4. Tenant filter escape hatches — reviewed individually

`ITenantScope.Suppress()` lifts the filter. Every call site was reviewed; each is legitimately
cross-tenant and carries a comment saying so.

| Site | Why it must see other tenants |
|---|---|
| `RestaurantAccessGuard` | The membership row being checked is the row the filter would hide. Without suppression the guard is a convincing no-op that always answers "no". Its test asserts the scope was null *at query time* and restored afterwards, so a regression fails rather than silently denying. |

Paths that run unbound (and so need no suppression): the host resolver, the owner membership lookup, the
publication outbox worker's cross-tenant drain, the guarded seeder, EF migrations, and the provisioning
CLI.

- [x] No suppression is left open across an `await` that returns to request-handling code.
- [x] No suppression appears in an endpoint handler or a management service.

## 5. Information disclosure

- [x] Cross-tenant resource lookups answer **404**, not 403, so no endpoint is an existence oracle.
- [x] The ownership 403 has **no body and no problem code** — the detail lives only in the log.
- [x] Media answers 404 for another tenant's file, never 403.
- [x] Public cache keys and ETags embed the restaurant GUID; two tenants cannot collide.
- [x] `PublicMenuReader` verifies a deserialized snapshot's identity against its database row and throws
      on mismatch.
- [x] The frontend no longer falls back to a default tenant when `Host` is missing or malformed.
- [x] No tenant-facing surface displays the platform brand in place of an unresolved restaurant name.

## 6. Media

- [x] Media is served only for the restaurant the request host resolved to.
- [x] The path's restaurant segment must be exactly a 32-digit `N`-format GUID, rejecting `.` and `..`
      rather than relying on URL normalization.
- [x] The frontend media route rejects dot-only path segments (found and fixed during this phase).
- [x] `Vary: Host` is set, and the proxy's blanket `public, max-age=3600` fallback now applies only to
      2xx responses — previously a 404 or 503 was cached publicly for an hour.
- [x] Media responses are `private`, because the file belongs to one tenant and a shared cache keyed on
      path alone would not know that.

## 7. Logging

- [x] Every ownership denial is logged exactly once, with user, requested and actual restaurant,
      endpoint, remote address, and timestamp.
- [x] Admin bypasses are logged unsampled at Information.
- [x] No secret, password, cookie, CSRF token, or session identifier is logged.
- [x] The remote address is read from the connection, not from a forwarded header, because forwarded
      headers from untrusted proxies are stripped upstream in `Program.cs`.

## 8. Admin bypass

- [x] `PlatformRoles.PlatformAdmin` is enforced in exactly one place.
- [x] It is checked *before* membership resolution, because a platform administrator has no membership —
      and because binding the tenant scope to a restaurant they do not own would be wrong.
- [x] Nothing issues the role: no portal, endpoint, CLI flag, or provisioning path.
- [x] A bypassing principal succeeds the policy but has no membership, so `IOwnerRestaurantContext`
      returns null and the endpoints' existing `Forbid()` applies. **Safe by default.**

## 9. Regressions guarded by tests

- [x] `TenantIsolationApiTests` — filters across every restaurant-owned set, suppression and restoration,
      the two-tenant guard, all three resolution strategies, unknown-host 404s, owner isolation over
      HTTP, and anonymous denial.
- [x] `MenuApiTests.EverySeededMediaVariantResolvesFromConfiguredPublicPath` — another tenant's media
      blob is not readable from this host even with its exact URL.
- [x] `OwnerSecurityTests` — policy grant, denial logging, admin bypass, and the access guard's
      suppress-and-restore behaviour.
- [x] `MigrationTests` — the schema migrates cleanly from empty and the applied-migration count is exact.

## 10. Outcome

- [x] All owner modules reviewed.
- [x] Shared authorization used everywhere.
- [x] No known bypasses.
- [x] Checklist completed.

**Open items, recorded not fixed** — none blocks PR-21, and each is stated in `README.md` section 6:
one-user-one-restaurant; `/auth/session` returning all memberships; `audit_events` lacking a foreign key;
media authorization being host-derived rather than identity-derived, which leaves draft images as
reachable as published ones for anyone who knows the URL and the host.
