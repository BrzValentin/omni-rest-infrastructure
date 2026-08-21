# Website Design Selection — Implementation Steps

**Status:** Proposed

**Product source:** `requirments/Phase 3/Phase_3_Website_Design_Selection.md`

**Phase:** Phase 3 — Restaurant Management

## 1. Establish the design contract

1. Define a stable, versioned design identifier for every supported design.
2. Define the shared restaurant, menu, action, accessibility, and empty-state inputs that every design must support.
3. Define optional design capabilities separately from the required contract.
4. Establish a safe default design and the behavior for an unknown, unavailable, or deprecated identifier.
5. Add a design manifest containing owner-facing name, preview image, version, availability status, and supported contract version.

## 2. Add design selection to restaurant state

1. Add the selected design identifier to restaurant settings.
2. Preserve existing restaurants by assigning or resolving a default design.
3. Include the selected design in the editable restaurant response.
4. Include the selected design in draft preview data and immutable published snapshots.
5. Validate selections against the server-supported design catalog.
6. Record design changes through the existing concurrency, audit, and publication controls.

## 3. Extend restaurant management

1. Add an authenticated owner operation for changing the selected design.
2. Require the current draft version for the change.
3. Reuse the established mutation and publication workflow.
4. Return the updated restaurant draft and publication status.
5. Ensure a failed publication never replaces the last successful public snapshot.
6. Add stable validation and recovery responses for unavailable designs, stale drafts, and publication failures.

## 4. Create the frontend design framework

1. Create a design registry that maps supported design identifiers to lazy-loaded design packages.
2. Define shared Home, Menu, shell, and design metadata interfaces.
3. Keep data access, tenant resolution, price formatting, restaurant status, category selection, availability, badges, and customer-action behavior outside individual design packages.
4. Extract visual-independent menu behavior from components that currently combine interaction and styling.
5. Load only the selected public design and its required assets.
6. Keep the management area visually independent from public website designs.

## 5. Convert the approved designs

1. Convert Quiet Elegance into production Home, Menu, desktop, and mobile components.
2. Convert Nightfall into production Home, Menu, desktop, and mobile components.
3. Convert Broadsheet into production Home, Menu, desktop, and mobile components.
4. Convert Sunroom into production Home, Menu, desktop, and mobile components.
5. Replace prototype sample content and placeholder actions with shared restaurant data and supported customer actions.
6. Provide safe omission and fallback behavior for missing optional content and images.
7. Package each design's styles, fonts, images, and responsive rules within its design boundary.

## 6. Build the admin Design section

1. Add Design to authenticated owner navigation.
2. Present available designs as catalog cards with names, preview images, and current/published status.
3. Support selecting a design without saving it.
4. Render a live draft preview isolated from management-area styles.
5. Add desktop and mobile preview controls.
6. Clearly label previewed, selected, publishing, and published states.
7. Add Cancel and Apply and publish actions.
8. Require confirmation when the selected design differs from the published design.
9. Show publication progress, success, failure, retry, and View website actions.

## 7. Update public rendering

1. Resolve the design from the current published restaurant snapshot.
2. Render both the public home page and menu page through the same selected design package.
3. Use the safe default when a restaurant has no explicit selection.
4. Preserve direct menu URLs, server rendering, metadata, accessibility, and publication-version behavior.
5. Ensure a missing or unavailable design never makes the public site inaccessible.

## 8. Add design version and lifecycle controls

1. Treat design identifiers as immutable versioned selections.
2. Allow new versions to coexist with earlier supported versions.
3. Prevent a release from silently moving restaurants to a different design version.
4. Support active, unavailable-for-new-selection, and deprecated lifecycle states.
5. Define a supported migration or owner opt-in path before removing an in-use design version.

## 9. Verification

1. Add contract tests that run against every registered design.
2. Verify Home and Menu with complete, minimal, missing, empty, and long content.
3. Verify category selection, prices, badges, unavailable dishes, notices, Call, and Directions behavior in every design.
4. Verify desktop, tablet, mobile, text resizing, keyboard operation, screen-reader structure, reduced motion, and forced colors.
5. Add visual regression coverage for representative Home and Menu states in every design.
6. Verify admin preview isolation and parity with the public renderer.
7. Verify preview does not publish, Cancel preserves the current design, and confirmation publishes the selected design.
8. Verify concurrency conflict, authorization, cross-restaurant isolation, publication failure, retry, and last-good-design preservation.
9. Verify an unknown or unavailable design uses the safe fallback without exposing an error page.
10. Verify only the selected public design's assets are loaded.

## 10. Recommended delivery sequence

1. Introduce the design contract, catalog, persistence, and fallback while preserving the current appearance as the default design.
2. Add the admin Design section and preview workflow against the default design.
3. Convert and validate Sunroom as the first new design to prove the complete selection and publication path.
4. Convert Quiet Elegance, Nightfall, and Broadsheet using the proven contract.
5. Complete cross-design contract, accessibility, responsive, publication, and visual-regression verification.
6. Release the four-design catalog for owner selection.

## Completion gate

The capability is complete when an authenticated owner can preview any available design with their own draft data, publish the selected design through the existing controlled publication workflow, retain the previous public design after any failure, and verify the resulting Home and Menu experience without developer involvement.
