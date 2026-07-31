# Phase 2 implementation evidence

**Task:** ORI-PHASE2-001
**Scope:** PR-5 through PR-7 only
**Environment:** local macOS, .NET SDK 10.0.302, Docker Engine 28.3.0, PostgreSQL 18

## Backend contract and data evidence

- `GET /api/v1/public/menu` is an anonymous typed Minimal API. It performs an exact normalized host lookup and a current-publication lookup; it accepts no restaurant identifier from the client.
- Public JSON is deserialized from an immutable versioned JSONB publication built by `PublicMenuProjectionBuilder`. EF entities, publication records, and API DTOs are distinct types.
- Strong ETags contain restaurant identity and publication version. Responses require revalidation; cache entries are keyed by restaurant plus version.
- The three migrations are intentionally staged: PR-5 creates the tenant-owned relational model with legacy-null availability, PR-6 adds and backfills persisted unique slugs, and PR-7 backfills availability before applying its default, non-null rule, and check constraint.
- Development/test seed commands are explicit and guarded. Production startup neither migrates nor seeds.

## Frontend delivery evidence

S2 implemented the public `/menu` route against the frozen S1 contract and completed the following local Developer checks. This records implementation evidence only; an independent Verifier has not yet reproduced or approved these results.

```sh
npm audit --audit-level=high
npm ci
npm run lint
npm run typecheck
npm run test
npm run test:coverage
npm run build
npm run test:e2e
npm run test:perf
```

- Dependency audit reported zero vulnerabilities; locked installation, lint, TypeScript, and the production build passed. Next.js reports `/menu` as dynamically server-rendered.
- Vitest passed 12 of 12 tests. V8 coverage was 89.26% statements, 82.03% branches, 91.83% functions, and 94.87% lines.
- Playwright passed 9 representative tests with 16 intentional duplicate project skips and zero failures across Chromium, Firefox, WebKit, 320 px, and 768 px projects. The suite exercises complete no-JavaScript server content, fragment/history navigation with zero category-switch refetches, tenant and empty states, 404 and recoverable retry behavior, axe checks, overflow and 200% text zoom, forced colors, and reduced motion.
- The 30-category/1,000-dish performance fixture passed with a 20.4 ms browser-side category switch, 452.08 ms local navigation, and 203,731 gzip bytes across the production JavaScript chunks.
- Route-level streamed loading was replaced with client navigation pending feedback. This preserves complete visible server-rendered content when JavaScript is unavailable while still announcing enhanced navigation progress.

All frontend timing and bundle figures above are local production-build observations. They are not staging, field, or business-availability evidence.

## 36-task traceability

Backend rows below are implemented and locally exercised by S1. Frontend rows now include the completed S2 Developer evidence above. Independent verification of the combined result remains pending; this document does not claim Verifier approval.

| Source task | Implementation or approved disposition | Automated evidence |
| --- | --- | --- |
| PR-5.1 Menu Data Model | EF entities/configuration, composite ownership FKs, ordering and archive fields, PR-5 migration | clean/staged migration and PostgreSQL constraint tests |
| PR-5.2 Dietary and Feature Badges | exact nine-code catalog, restaurant-owned rows, composite dish assignments, duplicate/unknown rejection | badge validation and API contract tests |
| PR-5.3 Menu API | typed host-resolved public read, Problem Details, ETag/304, version cache | API host/tenant/order/state/cache/OpenAPI tests |
| PR-5.4 Menu State Management | server-rendered frontend source, client navigation pending feedback, and retry boundary | S2 Developer: tenant-state and recoverable-retry Playwright coverage; no-JS content remains complete |
| PR-5.5 Menu Categories UI | ordered stable slug contract and responsive category browser | backend ordering contract plus S2 component and browser checks |
| PR-5.6 Menu Item Card | reusable frontend card over frozen DTO | S2 Developer: complete, media-fallback, badge, price, and unavailable component tests |
| PR-5.7 Badge Rendering | fixed frontend badge registry and informational disclaimer | backend catalog plus S2 registry/component and axe checks |
| PR-5.8 Menu Images | tenant-safe media model and validated relative/allowlisted HTTPS variants | media validator/API plus S2 accessible placeholder and failure-fallback checks |
| PR-5.9 Price Presentation | PostgreSQL numeric(12,2), canonical two-decimal JSON string, BigInt-safe frontend formatting | projection/API regex plus S2 formatter tests for zero, large values, and fallback behavior |
| PR-5.10 Tax Information Notice | locale/currency/tax settings in frozen response and conditional frontend notice | API fixtures plus S2 component/browser coverage |
| PR-5.11 Empty and Error States | distinct null menu, zero categories, active empty, unknown host, loading feedback, and retry | API state tests plus S2 host-driven Playwright state/recovery test |
| PR-5.12 Performance Optimization | two-query snapshot read and 30/1,000 fixture | backend local query/payload results plus S2 local-only 452.08 ms navigation, 20.4 ms switch, and 203,731 gzip-byte results |
| PR-5.13 Responsive Menu Experience | frontend CSS/design-system implementation | S2 Developer: Chromium/Firefox/WebKit and 320/768 viewport, overflow, and 200% zoom checks |
| PR-5.14 Accessibility | semantic frontend implementation | S2 Developer: axe with no serious/critical violations, no-JS, forced-colors, reduced-motion, target-size, and visible-state checks |
| PR-5.15 Testing and Documentation | backend and frontend tests, local tooling, OpenAPI and this evidence | S1 solution checks plus S2 audit/CI/lint/typecheck/unit/coverage/build/browser/performance commands recorded above |
| PR-6.1 Category Data Model | persisted slug, limits, nonnegative order, concurrency and ownership | PR-6 staged migration/slug unit tests |
| PR-6.2 Dish-to-Category Relationship | composite `(category, menu, restaurant)` FK and grouped index | adversarial cross-tenant PostgreSQL test |
| PR-6.3 Category Retrieval Logic | immutable snapshot includes active categories and active empty arrays only | API inactive/empty/order tests |
| PR-6.4 Menu Grouping Logic | projection validates ownership and rejects duplicate dish IDs | projection/API grouping tests |
| PR-6.5 Category Navigation UI | frontend stable-slug single-selection navigation | S2 Developer: component, axe, and browser checks |
| PR-6.6 Category Switching | local History API enhancement with no refetch | S2 Developer: fragment, back/forward history, and zero browser API-refetch Playwright evidence |
| PR-6.7 Default Category Behavior | fragment, first-category, and none fallbacks | S2 Developer: zero/one/many/invalid selection component tests |
| PR-6.8 Display Dishes Within Categories | all content server-rendered; public snapshot already filters visibility | backend visibility plus S2 complete visible no-JavaScript server-content test |
| PR-6.9 Empty Category Handling | active empty category is preserved as `dishes: []` | API plus S2 active-empty category component/browser evidence |
| PR-6.10 Responsive Category Navigation | frontend scroll strip, target and focus treatment | S2 Developer: 320/768 viewport, 200% zoom, target-size, forced-color, and reduced-motion checks |
| PR-6.11 Performance Requirements | one menu response and zero switching requests | backend large fixture plus S2 zero-refetch and local-only 20.4 ms large-menu switch evidence |
| PR-6.12 PR-6 Validation | API-through-UI ordered contract | combined S1 backend and S2 frontend Developer suites; independent reproduction pending |
| PR-7.1 Availability Data Model | PR-7 backfill/default/non-null/check, separate visibility/archive fields | staged migration/default/check tests |
| PR-7.2 Dashboard Availability Management | **Deferred to Phase 4 PR-14**; no admin/auth endpoint or UI exists | scope review confirms absence |
| PR-7.3 Backend API Support | frozen public `availability` string; no public mutation | API/OpenAPI/read-only tests |
| PR-7.4 Display Availability | visible, programmatically associated frontend text | S2 Developer: card, axe, and browser evidence for unavailable dishes remaining visible |
| PR-7.5 Visual Styling | frontend token, contrast and forced-colors treatment | S2 Developer: axe, forced-color, responsive, and visual inspection evidence |
| PR-7.6 Future Ordering Compatibility | reusable pure `CanBeOrdered` predicate only; no order/cart model | unit predicate and projection contract tests |
| PR-7.7 Real-Time Availability Updates | normal refresh/version replacement semantics, no SignalR | old-ETag/new-version API test |
| PR-7.8 Edge Case Handling | availability independent of active/archive; public projection filters visibility | API visibility plus database independence tests |
| PR-7.9 Testing | unit, PostgreSQL, API, contract, cache and frontend suites | recorded S1 and S2 Developer validation commands; independent verification pending |

## Performance and validation notes

The backend test fixture generates exactly 30 categories and 1,000 dishes, records JSON payload bytes and a ten-request local p95, and separately asserts the public read is two database queries. The frontend performance command uses that same reference shape and records a 20.4 ms category switch, 452.08 ms navigation, and 203,731 gzip bytes of production JavaScript. All of these are local engineering observations, not evidence for staging p95, field Core Web Vitals, or business availability because no staging load profile or hardware was supplied.

No Phase 3 authentication/admin feature, Phase 4 mutation endpoint, order/cart behavior, CI workflow, deployment, or infrastructure-as-code change is part of this implementation.
