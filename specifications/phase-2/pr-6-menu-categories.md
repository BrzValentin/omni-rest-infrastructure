# PR-6 — Menu Categories Technical Specification

**Status:** Proposed

**Depends on:** PR-5

**Product source:** `requirments/Phase 2/Phase_2_PR-6_Menu_Categories_Tasks.md`

## 1. Objective

Provide deterministic, accessible category browsing without reloading or refetching the menu. PR-6 extends the PR-5 category model and owns category-specific behavior.

## 2. Approved Phase 2 behavior

- Only active categories are public.
- Active empty categories remain visible and show an empty message.
- One category is active at a time.
- The first active category is selected by default when no valid URL selection exists.
- Category switching is client-side over the already loaded menu.
- The URL fragment records the selected category slug so direct links and back/forward navigation work.

## 3. Task specifications

### Task 1 — Category Data Model

- Reuse `menu_categories` from PR-5; do not add a second model.
- Confirm UUID, restaurant/menu ownership, required name, optional description, display order, active state, timestamps, and concurrency token.
- Generate a stable URL slug unique within the menu; identity remains UUID.
- Enforce nonblank 100-character name, 300-character description, non-negative order, and tenant-consistent foreign keys.
- Test uniqueness, normalization, ordering, and inactive records.

### Task 2 — Dish-to-Category Relationship

- Reuse the required PR-5 `category_id` relation.
- Enforce that dish, category, menu, and restaurant belong to the same aggregate.
- Index category/public-status/display-order access.
- A published dish cannot be uncategorized.
- Integration-test cross-menu/cross-restaurant rejection and efficient grouped retrieval.

### Task 3 — Category Retrieval Logic

- Public projection returns active categories only in `display_order`, then stable ID order.
- Return active empty categories.
- Never return categories from another restaurant or menu.
- Return dish counts only if the public UI needs them; counts exclude inactive/archived dishes but include unavailable visible dishes.
- Test inactive exclusion, empty inclusion, ordering, and tenant isolation.

### Task 4 — Menu Grouping Logic

- Group each public dish under exactly one category.
- Sort dishes independently by dish display order and stable ID.
- Preserve empty category arrays.
- Projection construction rejects duplicate dish IDs or a dish assigned to multiple public groups.
- Unit/integration tests cover deterministic grouping and corrupt-input protection.

### Task 5 — Category Navigation UI

- Implement `CategoryNavigation` as an accessible single-selection control.
- Use buttons linked to labelled dish panels; follow ARIA tabs only if the full keyboard tab pattern is implemented correctly.
- Display all active categories in configured order and visually distinguish selection beyond color.
- Use stable slug/ID values, not array indexes, for keys and selection.
- Support at least the 30-category reference fixture.
- Component-test accessible names, selected state, ordering, and long labels.

### Task 6 — Category Switching

- Switch visible panel locally without a full-page navigation or API request.
- Update URL fragment through History API without losing scroll unexpectedly.
- Restore selection on browser back/forward.
- Move focus only when initiated by an interaction pattern requiring it; do not steal focus on ordinary pointer selection.
- Preserve scroll visibility of the selected category control.
- Test pointer, keyboard, history, invalid fragment, and no-refetch behavior.

### Task 7 — Default Category Behavior

- Resolve initial selection in order: valid URL fragment, first active category, no selection for empty menu.
- A single category selects automatically and may omit visually redundant navigation while retaining its heading.
- Invalid/inactive fragments fall back predictably and normalize the URL without error.
- Test zero, one, many, invalid, and inactive cases.

### Task 8 — Display Dishes Within Categories

- Render only the active category's dish panel in the interactive experience.
- The server response includes indexable menu content according to the SEO strategy; client enhancement must not make essential menu content inaccessible without JavaScript.
- Use PR-5 `DishCard` and preserve dish order.
- Exclude inactive/archived dishes; include unavailable dishes with PR-7 treatment.
- Test association, ordering, progressive fallback, and availability compatibility.

### Task 9 — Empty Category Handling

- Keep the selected empty category in navigation.
- Render a localized “No dishes in this category” panel, not a blank region.
- Do not treat an empty category as an API or application error.
- Navigation remains fully functional before and after selecting it.
- Test screen-reader announcement and category transitions.

### Task 10 — Responsive Category Navigation

- Use a horizontally scrollable single-line category strip at small widths unless measured design review approves wrapping.
- Provide visible overflow affordance without hiding native scrolling.
- Keep the selected item visible with `scrollIntoView` using reduced-motion preferences.
- Preserve 44×44 CSS-pixel targets, focus visibility, and no page-level horizontal overflow.
- Test Phase 1 viewports, touch, keyboard, RTL readiness, and 200% zoom.

### Task 11 — Performance Requirements

- Load categories and dishes in one public menu response.
- Switching performs zero backend requests.
- Avoid remounting unchanged navigation and unrelated dish panels unnecessarily.
- Validate ordinary and 30-category/1,000-dish fixtures against the shared 100 ms interaction target.
- If measurement proves full rendering too costly, use accessible panel virtualization only through a reviewed follow-up decision.
- Store performance traces as CI artifacts.

### Task 12 — PR-6 Validation

- Browser-test browse, direct fragment, switch, back/forward, empty, one category, many categories, responsive navigation, unavailable dish, and JavaScript-disabled fallback.
- Verify selected state visually and programmatically.
- Verify category/dish ordering from API through UI.
- Run accessibility scans and manual keyboard/screen-reader smoke checks.
- Map evidence to all PR-6 acceptance criteria.

## 4. Security and failure behavior

- Category slugs/fragments are untrusted input; resolve only against the loaded public collection.
- Invalid fragments never become database query text or HTML.
- Unknown categories return a safe fallback, not internal details.
- Client selection does not authorize access; the API already excludes nonpublic content.

## 5. Completion evidence

- schema reuse/constraint review;
- grouped API fixtures;
- component and history/navigation tests;
- large-menu interaction results;
- responsive/accessibility reports;
- mapping of all 12 source tasks.

## 6. References

- [Phase 2 shared specification](README.md)
- [PR-5 Menu Browsing](pr-5-menu-browsing.md)
