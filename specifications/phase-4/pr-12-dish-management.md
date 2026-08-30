# PR-12 — Dish Management

**Status:** Implemented

Source: `requirments/Phase 4/Phase_4_PR-12_Dish_Management_Task_Breakdown.md` (15 tasks)

## 1. Data model (PR12-1, PR12-8, PR12-11)

The `dishes` table from Phase 2 already carries every required field, so no dish migration was needed:

| Requirement | Column | Notes |
| --- | --- | --- |
| Dish ID | `id` | uuid |
| Restaurant ID / Category ID | `restaurant_id`, `menu_id`, `category_id` | tenant-scoped composite foreign key |
| Name / Description | `name` (160), `description` (1000) | description optional and multi-line |
| Price | `price numeric(12,2)` | `ck_dishes_price >= 0` |
| Image URL | `media_asset_id` | first-party media assets and their variants, not raw URLs |
| Availability | `availability_status` | `ck_dishes_availability` |
| Sort order | `display_order` | unique per category |
| Soft delete | `archived_at`, `is_active` | row is retained |

Dietary flags (PR12-11) reuse the Phase 2 badge catalog, which already defines exactly the nine required flags:
`vegetarian`, `vegan`, `gluten_free`, `dairy_free`, `halal`, `spicy`, `contains_nuts`, `popular`, `new`. Missing
per-restaurant badge rows are created on demand when an owner first assigns a flag.

**One migration was required:** `20260826120000_Phase4DishAuditEntityId` adds a nullable `audit_events.entity_id`
so PR12-15 can record which dish changed.

## 2. Routes

| Route | Purpose |
| --- | --- |
| `POST /api/v1/admin/menu/dishes` | Create (PR12-2) |
| `PATCH /api/v1/admin/menu/dishes/{id}` | Update every editable field, including the category (PR12-4) |
| `PATCH /api/v1/admin/menu/dishes/{id}/price` | Price-only update (PR-13 Task 2) |
| `PATCH /api/v1/admin/menu/dishes/{id}/availability` | Availability-only update (PR-14 Task 3) |
| `PATCH /api/v1/admin/menu/dishes/reorder` | Rewrite the dish order inside one category |
| `DELETE /api/v1/admin/menu/dishes/{id}` | Soft delete (PR12-6) |

`GET /api/v1/admin/menu` returns every category with its live dishes, the restaurant locale, currency, tax display
mode, and the badge catalog, so the owner UI needs one request.

Design decisions:

- **Soft delete restacks the category.** Archiving sets `archived_at` and `is_active = false`, then rewrites the whole
  category order so live dishes stay contiguous and archived rows sit above them. This keeps the
  `(category_id, display_order)` unique index valid without leaving archived rows in the middle of the live range.
- **Moving a dish appends it** to the end of the target category rather than guessing a position.
- **Images are asset references, not URLs.** A dish can only reference a media asset that belongs to the same
  restaurant and whose processing status is `ready` (`media_asset_not_found` / `media_asset_not_ready`), which keeps
  the public projection's media-safety rules satisfiable. Upload, replace, and remove all work through the existing
  Phase 3 media endpoints and their JPG/PNG/WebP and size validation (PR12-9).
- **Price floor is zero, not one cent.** PR12-2 says "Price > 0" while PR-13 Task 1 and the shipped check constraint
  say "greater than or equal to zero". The later, more specific price specification wins, so free items are allowed.

## 3. Validation, authorization, and audit (PR12-13, PR12-14, PR12-15)

- Name 1–160 characters, non-blank, no control characters; description optional up to 1000.
- Price: required, `>= 0`, at most two decimals, at most `9999999999.99` (the stored precision).
- Category must belong to the owner's active menu; flags must be catalog codes, unique, at most nine.
- Availability must be `available` or `unavailable`.
- Owner policy, antiforgery, and the restaurant draft `If-Match` apply to every mutation. Foreign dish, category, and
  media identifiers return `404` (`dish_not_found`, `menu_category_not_found`, `media_asset_not_found`).
- Every dish mutation writes an audit event carrying the action, actor user id, restaurant id, dish id, draft version,
  publication operation id, and timestamp. Actions: `menu.dish.created`, `menu.dish.updated`,
  `menu.dish.price_changed`, `menu.dish.availability_changed`, `menu.dish.deleted`.

## 4. Owner UI (PR12-3, PR12-5, PR12-7, PR12-10, PR12-12)

`/admin/menu/dishes` renders `DishManager`:

- category filter, then a dish list showing image thumbnail, name, formatted price, availability badge, and flags;
- one create/edit form covering name, category, price, availability, description, image, and the nine flags, with
  validation errors rendered next to each field;
- image upload, replace via the asset list, remove, and a live preview;
- focus-trapped delete confirmation naming the dish and pointing to "Unavailable" as the reversible alternative;
- per-dish availability toggle and keyboard-operable `Move up` / `Move down` ordering.

Both menu surfaces share `useMenuDraft`, which owns the draft ETag, publication notice, conflict recovery, and
field-error mapping.

## 5. Tests

Backend: `Unit/DishValidationTests` (price, name, description, flags, availability, reorder) and
`Integration/AdminDishApiTests` (create/edit/move/reorder/soft-delete round trip with a database assertion that the
archived row survives; audit identity; rejected payloads, foreign resources, CSRF, and stale ETag; deleting a category
after its dishes are gone).

Frontend: `components/admin/DishManager.test.tsx` covers the list, create, pre-filled edit, cancel, category move,
delete confirmation, availability toggle, reorder, image upload success and failure, API field errors, the
no-category state, and an `axe-core` scan.
