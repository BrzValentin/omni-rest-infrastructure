# PR-11 — Category Management

**Status:** Implemented

Source: `requirments/Phase 4/Phase_4_PR-11_Category_Management.md` (12 tasks)

## 1. Data model (Tasks 1–2)

`menu_categories` already exists from the Phase 2 `Pr5MenuBrowsing` and `Pr6MenuCategorySlugs` migrations and satisfies
the required fields:

| Requirement field | Column | Notes |
| --- | --- | --- |
| `id` | `id` | uuid primary key |
| `restaurant_id` | `restaurant_id` | part of the tenant-scoped composite keys |
| `name` | `name` | `varchar(100)`, `ck_menu_categories_name` rejects blank names |
| `display_order` | `display_order` | `ck_menu_categories_display_order >= 0`, unique per `menu_id` |
| `created_at` / `updated_at` | `created_at` / `updated_at` | maintained by the management service |

Additional shipped columns that Phase 4 preserves: `menu_id`, `slug` (public URL identity), `description`,
`is_active` (Phase 2 category hiding), and `concurrency_version`. Cascade delete from the restaurant is already
configured, so deleting a restaurant deletes its categories. **No new migration is required.**

## 2. Routes (Tasks 3–6)

| Route | Purpose |
| --- | --- |
| `GET /api/v1/admin/menu` | Draft menu with every category, its `display_order`, `is_active`, and dish count |
| `POST /api/v1/admin/menu/categories` | Create; `display_order` is assigned automatically as `max + 1` |
| `PATCH /api/v1/admin/menu/categories/{id}` | Rename and re-describe; `slug` and `display_order` are untouched |
| `DELETE /api/v1/admin/menu/categories/{id}` | Delete; refused while the category holds dishes |
| `PATCH /api/v1/admin/menu/categories/reorder` | Rewrite the whole order in one transaction |

Design decisions:

- **Slug stability.** Renaming does not regenerate the slug, so published category URLs stay valid. The slug is derived
  once at creation with the existing `MenuValidation.CreateSlug` collision handling.
- **Reorder is all-or-nothing.** The payload must name every category in the active menu. A partial or unknown list is
  rejected with `category_reorder_incomplete` and changes nothing, which also prevents a foreign category id from
  revealing another restaurant's data.
- **Two-phase ordering write.** `(menu_id, display_order)` is a unique index enforced per row, so the requested order is
  first staged above the current maximum, flushed, and then rewritten as `0..n-1` inside the same transaction.
- **Delete guard.** Deletion is refused with `409 category_contains_dishes` while any non-archived dish remains.
  Archived (soft-deleted) dishes do not block deletion.
- **Order gaps are legitimate.** Deleting a category leaves a gap in `display_order`; ordering is relative, and the
  reorder route rewrites the sequence when the owner cares.

## 3. Authorization and validation (Tasks 7–9)

- The `/api/v1/admin` group requires the owner policy; every mutation adds the antiforgery filter.
- The restaurant comes from membership, so no request can name another restaurant.
- Category lookups are scoped to the owner's active menu; a foreign or missing id both return
  `404 menu_category_not_found`.
- `name` is required, trimmed, 1–100 characters, and may not be blank or contain control characters.
  `description` is optional and limited to 300 characters.
- Error codes: `menu_category_not_found` (404), `category_contains_dishes` (409), `concurrency_conflict` (409),
  `data_conflict` (409), `menu_not_found` (404), and `admin_validation` (400) with per-field codes.

## 4. Owner UI (Task 11)

`/admin/menu` renders `CategoryManager`:

- category list with name, dish count, description, and a `Hidden` badge for inactive categories;
- inline rename form, create form, and a focus-trapped `alertdialog` delete confirmation;
- reordering by native drag and drop **and** by `Move up` / `Move down` buttons, so the feature is operable by
  keyboard as WCAG 2.2 requires;
- a polite live region announcing the saved position, publication status, and validation or conflict messages;
- all updates applied from the mutation response without a page reload.

## 5. Tests (Tasks 10, 12)

Backend:

- `Unit/MenuManagementValidationTests` — name, description, and reorder rules.
- `Integration/AdminMenuCategoryApiTests`
  - `OwnerCanCreateRenameReorderAndDeleteCategoriesAndSeeThemPublished` covers the full Task 12 walkthrough:
    create, create again, rename, reorder, reload, blocked delete, successful delete, and the published public menu.
  - `CategoryEndpointsEnforceAuthenticationCsrfConcurrencyAndTenantIsolation` covers anonymous access, bad CSRF,
    stale `If-Match`, and cross-restaurant ids.
  - `CategoryValidationRejectsInvalidNamesAndPartialReorders` covers rejected payloads and proves nothing changed.

Frontend: `components/admin/CategoryManager.test.tsx` covers listing, create, rename, keyboard reorder, delete
confirmation and its conflict message, validation display, concurrency recovery, the empty-menu state, and an
`axe-core` scan.
