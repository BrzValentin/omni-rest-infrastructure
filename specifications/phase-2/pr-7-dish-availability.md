# PR-7 — Dish Availability Technical Specification

**Status:** Proposed

**Depends on:** PR-5, PR-6

**Deferred dependency:** PR-8, PR-12, and PR-14 for owner management

**Product source:** `requirments/Phase 2/Phase_2_PR-7_Availability.md`

## 1. Objective

Persist dish availability and clearly communicate unavailable dishes to public visitors. Phase 2 delivers the model, public API status, accessible visual treatment, cache correctness, and tests. Owner mutation is deferred to Phase 4 PR-14.

## 2. Phase 2 behavior

- `available` and `unavailable` are the only statuses.
- New/existing Phase 2 dishes default to `available`.
- Availability is independent of active/archive state.
- Unavailable public dishes remain visible with an explicit text indicator.
- Phase 2 has no ordering feature; the status is included so future ordering validation can reject unavailable dishes.
- Public cache/version behavior prevents stale status after a published change.

## 3. Task specifications

### Task 1 — Design Dish Availability Data Model

- Use the required `dishes.availability_status varchar(20)` field introduced by PR-5.
- Add database check constraint for `available|unavailable` and default `available`.
- Keep `is_active`, `archived_at`, and availability separate.
- Migration backfills existing null/missing values before adding non-null constraint.
- Test defaults, backfill, accepted/rejected values, and state independence.

### Task 2 — Restaurant Dashboard Availability Management

#### Status

Deferred to Phase 4 PR-14 because Phase 2 has no authenticated dish editor.

#### Deferred requirements

- Add an accessible availability control to the authenticated dish editor/list.
- Update only availability with optimistic concurrency and restaurant-owner authorization.
- Save to draft and publish according to the approved publication behavior.
- Show persisted/draft/published status distinctly when those differ.
- Component, API, authorization, concurrency, and end-to-end tests are mandatory before activation.

### Task 3 — Backend API Support

#### Phase 2 requirements

- Include availability in each public dish DTO.
- Include it in the published menu snapshot/version.
- Do not expose a public mutation endpoint.
- Reserve an admin command contract for Phase 4 without mapping it anonymously.
- Document the public field in OpenAPI and contract tests.

#### Deferred admin endpoint

`PATCH /api/v1/admin/dishes/{id}/availability` with `{ "status": "available|unavailable", "version": "..." }`, protected by owner policy and tenant-derived restaurant context.

### Task 4 — Display Availability in Digital Menu

- Render visible text “Unavailable” next to or over the dish presentation.
- Keep name, description, price, badges, and allergen information readable.
- Provide programmatic status text associated with the dish heading.
- Do not use disabled form semantics because a public dish card is not an order control.
- Component/browser tests cover multiple cards and all viewports.

### Task 5 — Visual Styling

- Use design-system status tokens; color alone cannot communicate availability.
- Reduced emphasis must retain WCAG 2.2 AA contrast for essential content.
- Do not strike through content in a way that harms readability.
- Use one consistent treatment across active category panels and JavaScript-disabled fallback.
- Verify contrast, forced-colors/high-contrast behavior, and screen-reader output.

### Task 6 — Future Ordering Compatibility

- Keep availability in the domain/public/admin contracts consumed by future order validation.
- Define a reusable domain predicate indicating whether a dish can be ordered, but do not create cart/order entities.
- Future ordering must revalidate availability server-side at submission time; browser state is never authoritative.
- Add an architecture/contract test proving status is not discarded by menu projection.

### Task 7 — Real-Time Availability Updates

- “Real-time” in Phase 2 means correct after a normal refresh/revalidation, not SignalR push.
- Published availability changes increment the publication version and invalidate API/web/edge caches.
- Conditional requests with an old ETag receive current content after publication.
- A refreshed page must not reuse a stale session-only menu cache.
- Phase 4 publication tests own mutation-to-public propagation; Phase 2 tests simulate a new published version.

### Task 8 — Edge Case Handling

- Archived dishes remain archived regardless of availability.
- Restoring a dish preserves its prior availability unless product rules later specify otherwise.
- Duplicating a dish defaults the new dish to `available` unless the future duplicate command explicitly documents a different choice.
- Hiding a category hides all its dishes publicly without changing availability.
- Import/export/synchronization are out of Phase 2 scope; any future implementation must preserve/validate the status.
- Test archive/restore/duplicate projection/category-hidden scenarios without implementing nonexistent bulk features.

### Task 9 — Testing

- Unit-test status validation and future order predicate.
- PostgreSQL integration-test default, constraint, migration/backfill, and independence from visibility.
- Contract-test public API availability.
- Component/browser-test indicator, styling, category switching, responsiveness, and accessibility.
- Test cache/version refresh with two publication versions.
- Record dashboard/admin scenarios as deferred Phase 4 acceptance requirements.

## 4. Product conflict note

Phase 4 PR-14 currently says unavailable dishes are hidden, which conflicts with the main PRD and this Phase 2 specification. PR-14 must be product-corrected or explicitly supersede Phase 2 before Phase 4 implementation. The architecture supports either query policy; this specification does not silently change the Phase 2 visitor experience.

## 5. Completion evidence

- migration/backfill results;
- API contract snapshot;
- indicator component and accessibility results;
- publication-version cache test;
- edge-case report;
- explicit deferred owner-management checklist;
- mapping of all nine source tasks.

## 6. References

- [Phase 2 shared specification](README.md)
- [PR-5 Menu Browsing](pr-5-menu-browsing.md)
- [PR-6 Menu Categories](pr-6-menu-categories.md)
