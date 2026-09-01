# Phase 7 — Independent Restaurants and Independent Management

**Status:** Complete. Implemented and verified — see `implementation-evidence.md`. The backend suite passes
**242/242 on Linux**; the frontend passes **244 vitest tests across 29 files** with lint and typecheck clean.

**Version:** 0.1

**Architecture dependency:** `specifications/architecture.md`, sections 6.2, 8, and 9

**Product scope:** PR-20 (Independent Restaurants), PR-21 (Independent Management)

## 1. Purpose

This package converts the Phase 7 product requirements into technical specifications for multi-tenancy:
resolving which restaurant serves a request, isolating every restaurant's data from every other one, and
restricting each owner to the restaurant they own.

- `security-checklist.md` — the PR-21 Task 12 deliverable
- `implementation-evidence.md`

Architecture section 8 already committed to these rules before any code was written:

> - Every restaurant-owned record has a non-null `restaurant_id`.
> - Uniqueness constraints include `restaurant_id` when uniqueness is restaurant-local.
> - Administrative endpoints derive accessible restaurant IDs from the authenticated membership; they do
>   not trust an arbitrary client-supplied restaurant ID.
> - Public restaurant resolution is encapsulated behind a resolver.
> - Cross-restaurant authorization is covered by integration tests for every management module.

and concluded that "this makes Phase 7 an expansion of routing, provisioning, and operations rather than a
full data-model rewrite." That prediction held. The audit below records what was already true, so the
specification is not mistaken for a description of new work.

## 2. Scope normalization

Phases 1–6 built a single-tenant product on a tenant-shaped schema. Phase 7 therefore inherits a large
head start and a small number of genuine holes. Following the Phase 4–6 precedent — **a later phase adapts
to the shipped architecture, it does not fork it** — the following rulings apply.

1. **PR-20 Task 10 (Restaurant Administration) was removed from the requirements at the product owner's
   direction** and is not implemented. Its section and summary-table row were deleted from
   `requirments/Phase 7/Phase_7_PR-20_Independent_Restaurants.md`. The numbering gap this leaves is
   deliberate: renumbering Task 11 would silently rewrite an unrelated requirement's identity.
   A consequence worth stating plainly: because "Disable restaurants" lived only in Task 10, **no
   restaurant status or disabled column was added**. Nothing else in Phase 7 needs one.

2. **PR-20 Task 11 (Multi-Restaurant Validation) is out of scope** at the product owner's direction. The
   isolation testing that did ship is PR-21 Task 11's, in `TenantIsolationApiTests`.

3. **One admin portal serves exactly one restaurant.** There is no platform-admin portal, no restaurant
   switcher, and no cross-restaurant administration UI. PR-21 Task 3 requires an "admin bypass", so
   `PlatformRoles.PlatformAdmin` is defined, enforced in the policy handler, and audited on every use —
   but it is never issued: no portal, endpoint, CLI flag, or provisioning path grants it. It exists so
   that the bypass is already defined, audited, and in one place rather than invented under pressure.

4. **Cross-tenant resource access answers 404, not 403.** PR-21 Tasks 9 and 10 say "Forbidden" and
   "generic 403". Taken literally across the whole surface, that turns every admin endpoint into an
   existence oracle for other tenants' identifiers. The resolution splits by layer:
   - **403**, with no body and no problem code, when an *authenticated* caller fails the ownership or
     role policy. This is `ActiveOwnerHandler`, and it satisfies the requirement's intent.
   - **404**, with the endpoint's existing `*_not_found` code, for a cross-tenant *resource* lookup, so
     one tenant cannot learn which of another's GUIDs exist.

   This preserves the convention already asserted by roughly eight tests across the menu, gallery, and
   restaurant modules, and is the stricter of the two readings.

5. **PR-21 Task 7's named repository methods are satisfied by the query filters, not by a new layer.**
   The task asks for `GetRestaurantForOwner()`, `GetMenusForRestaurant()`, `GetGalleryForRestaurant()`.
   The ambient tenant filter makes cross-restaurant queries *impossible* rather than merely inconvenient,
   which is strictly stronger than a naming convention, and the methods already exist under other names:

   | Required method | Shipped implementation |
   |---|---|
   | `GetRestaurantForOwner()` | `RestaurantManagementService.LoadAggregateAsync(access.RestaurantId, …)` |
   | `GetMenusForRestaurant()` | the `Menus`/`Categories`/`Dishes` graph on that aggregate |
   | `GetGalleryForRestaurant()` | `restaurant.GalleryImages` on that aggregate, capped by the scoped count at `GalleryManagementService` |
   | *(new)* consolidated configuration | `IRestaurantConfigurationService.GetCurrentAsync` |

   Adding a renaming shim over these would be dead code. The acceptance criteria — "owner repositories
   scoped", "cross-restaurant queries impossible" — are met and tested.

## 3. What was already true before Phase 7

Recorded so the specification is honest about the size of the change:

- Every restaurant-owned table already carried a non-null `restaurant_id`, and composite
  tenant-carrying foreign keys — `(media_asset_id, restaurant_id) → (id, restaurant_id)` and similar —
  already made a cross-tenant row reference *physically* impossible at the database level.
- All 31 admin endpoints already derived their restaurant from the authenticated owner's membership.
  No route segment, body field, query parameter, or header accepted a client-supplied restaurant id,
  and none was added.
- Public cache keys and ETags already embedded the full restaurant GUID.
- The sample seeder already provisioned five restaurants on five distinct hosts.

PR-20 Task 1 was therefore largely satisfied on arrival; the only schema change Phase 7 required was the
slug column.

## 4. The five real gaps, and how they were closed

### 4.1 No automatic filtering (PR-20 Task 4)

`HasQueryFilter` appeared nowhere in the solution. Isolation was correct but entirely manual: every query
had to remember its own `RestaurantId` predicate.

`ITenantScope` (`Infrastructure/TenantScope.cs`) holds the restaurant a request acts for.
`MenuDbContext.TenantRestaurantId` exposes it as a context property, which EF Core rewrites into a
per-query parameter against the executing context rather than baking one request's tenant into the cached
model. `Data/Phase7Model.cs` applies the filter to all 20 restaurant-owned entity types.

The scope is **unbound by default, and inert while unbound**. This is a deliberate design choice, not a
weakness: the host resolver, the owner membership lookup, the publication outbox worker, the guarded
seeder, EF migrations, and the provisioning CLI all run before or outside any tenant and must see the
whole table. The membership query is the clearest case — it is the query that *decides* which restaurant
the caller may act for, so it cannot itself be filtered by that answer.

Binding happens at exactly two points, both of which are the moment the tenant becomes known:

- `PublicMenuReader.ReadAsync` → `IRestaurantContext.ResolveFromHostAsync`, for public requests.
- `OwnerRestaurantContext.ResolveAsync`, called from `ActiveOwnerHandler` during **authorization** — so
  the filter is active before any endpoint code runs, and a handler that forgets its own predicate still
  cannot read another tenant's rows.

`ITenantScope.Suppress()` is the one escape hatch, restoring the previous binding on dispose. Every use
must carry a comment explaining why it is allowed to see other tenants' rows.

Re-binding to the same restaurant is a no-op; re-binding to a *different* one throws, because a request
that resolved one tenant and then bound another means resolution disagreed with authorization. Failing
loudly there turns a would-be data leak into a 500 that the tests catch.

### 4.2 No restaurant context (PR-20 Task 3)

Resolution happened inside endpoint handlers, nothing was stashed, and the resolver would re-query if
called twice. `IRestaurantContext` (`Infrastructure/RestaurantContext.cs`) is scoped, memoizes both the
resolution and the loaded entity, and binds the tenant scope. `OwnerRestaurantContext` memoizes too.
The "context is created once per request" and "no duplicate restaurant resolution" criteria now hold by
construction rather than by discipline.

### 4.3 Resolution by host only (PR-20 Task 2)

`RestaurantResolver` matched `restaurant_domains.host` exactly, with a Development-only loopback
fallback. It is now a three-strategy chain, tried in priority order and recording which strategy admitted
the request as `RestaurantResolutionSource`:

1. **Domain** — an exact `restaurant_domains.host` match, the pre-existing behaviour.
2. **Subdomain** — a single slug label beneath a configured platform base domain, so
   `prairie-table.example.app` resolves without a dedicated domain row. Only the *immediate* label is
   considered: `a.b.example.app` is not a tenant, because treating it as one would let a wildcard
   certificate holder invent tenants.
3. **Configuration** — the configured fallback, still restricted to Development on a loopback host so a
   misconfigured production deployment can never quietly serve one tenant for every unknown name.

`PublicMenu:PlatformBaseDomains` is empty by default: subdomain resolution is off until a deployment opts
in. An unresolved host yields `null`, which every public endpoint turns into a 404.

The new nullable `restaurants.slug` column carries the label. It is uniquely indexed *where present*, so
a restaurant reachable only through a custom domain needs no slug while every slug that exists identifies
exactly one tenant.

### 4.4 Media served without a tenant check (PR-20 Task 8)

The whole media root was mounted with `UseStaticFiles` **before** `UseAuthentication`, so every file —
including unpublished drafts — was readable by anyone from any host. The GUIDs are unguessable, but that
is obscurity, not access control, and the requirement is that another restaurant's images are
*inaccessible*.

`TenantMediaMiddleware` reads the owning restaurant from the leading path segment, requires it to match
the restaurant the host resolved to, and answers 404 otherwise — 404 rather than 403, because whether
another tenant's asset exists is itself information a caller should not obtain. The segment must be
exactly a 32-digit `N`-format GUID, which rejects `.`, `..`, and any other traversal attempt outright
instead of relying on later normalization.

The sample seeder previously wrote fixture blobs to a shared `seed/` directory. It now uses the real
per-restaurant layout, so the tenant check applies to seeded media exactly as it does to uploads — the
sample data is no longer the one thing the check cannot express.

### 4.5 No security logging (PR-21 Task 10)

Nothing logged authorization failures. A tenant probing another tenant's GUIDs left no trace anywhere:
`ActiveOwnerHandler` returned silently, `OwnerRestaurantContext` returned `null`, and seventeen handler
call sites turned that into a bare `Forbid()`.

`ISecurityAuditLog` emits one warning per denial decision — never two for the same event — carrying
`Reason`, `UserId`, `RequestedRestaurantId`, `ActualRestaurantId`, `Endpoint`, `RemoteIpAddress`, and
`OccurredAt`, with unknown values rendered `(unavailable)` rather than omitted. The remote address comes
from `HttpContext.Connection.RemoteIpAddress`, because `Program.cs` already strips forwarded headers
arriving from untrusted proxies. Admin bypasses are logged at Information, unsampled.

## 5. Frontend rulings

1. **The frontend must never substitute a default host.** Three surfaces silently resolved a missing or
   malformed `Host` to one specific tenant. All host-forwarding surfaces now share one fail-closed rule
   set (`lib/tenant-host.ts`) and answer 404 without contacting the API. The backend keeps its
   Development-only loopback fallback; the frontend deliberately has none, which is what lets the
   loopback-addressed test project keep working without giving production a way to guess a tenant.

2. **`<html lang>` follows the tenant on public pages and stays `en-CA` in the owner portal.** `lang`
   declares the language of the text in the document. Every string in the portal chrome is English, so
   announcing a French restaurant's `fr-CA` over English chrome would tell a screen reader to pronounce
   English with French phonetics.

3. **`next/image` optimization is kept on public pages.** Its cache key is `(src, width, quality)`, which
   omits the host — but every media URL already embeds the owning restaurant's GUID and each upload gets
   a fresh asset GUID, so the key is tenant-unique and draft-unique in practice. Disabling optimization
   platform-wide would cost every tenant real LCP to defend against a collision that would require the
   backend to reuse a GUID across restaurants. `RestaurantPreview` — the one owner-only surface rendering
   unpublished media — was made `unoptimized` for consistency with the editor and gallery precedent.

4. **The owner portal names the restaurant it manages.** The nav is scoped to owned resources and the
   restaurant's name appears in the header, document title, and dashboard heading. It is shown only for
   a restaurant the session holds a membership for, so the chrome can never label the portal with a
   restaurant the owner has no claim to. The backend remains the authority on access.

## 6. Known limitations

1. **One user, one restaurant.** `OwnerRestaurantContext` selects the oldest active owner membership and
   there is no mechanism to choose among several. This predates Phase 7 and is consistent with PR-21
   Task 1's "Each Restaurant has exactly one Owner (Phase 1)".

2. **`GET /api/v1/auth/session` returns all of a user's active memberships**, not only the one in scope.
   Harmless while every user has exactly one, but it is the single endpoint that would expose a second
   restaurant's identifier if multi-membership is ever introduced. Recorded rather than changed, because
   nothing in Phase 7 requires it.

3. **`audit_events.restaurant_id` has no foreign key** to `restaurants`, so nothing at the database level
   prevents writing an audit row against an arbitrary restaurant id. Pre-existing; the tenant filter now
   scopes reads of that table.

4. **Media authorization is host-derived, not identity-derived.** A viewer who knows a published media URL
   and sends the owning restaurant's `Host` can fetch it — which is correct for published images, since
   they are public by definition. Draft images share that property. Tightening drafts specifically would
   require an authenticated media path and is not something Phase 7 requires.
