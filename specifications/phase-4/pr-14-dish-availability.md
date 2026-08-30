# PR-14 — Dish Availability

**Status:** Implemented, with two documented adaptations

Source: `requirments/Phase 4/Phase_4_PR-14_Dish_Availability.md` (9 tasks)

## 1. Adaptations

Two PR-14 statements contradict already-shipped phases. Following the product ruling that Phase 4 adapts to the
earlier phases, both are resolved in favour of the shipped behaviour:

| PR-14 says | Shipped behaviour that wins | Where |
| --- | --- | --- |
| Saving availability must not publish; a separate publish step moves it live (Tasks 3–5) | Every owner save writes the draft and dispatches the shared publication pipeline | Phase 3 automatic publication |
| Unavailable dishes are hidden from the public menu (Task 6) | Unavailable dishes stay visible with an explicit indicator | PRD and `specifications/phase-2/pr-7-dish-availability.md` |

The Phase 2 specification had already flagged the second conflict and required a product decision before Phase 4
implementation; this is that decision recorded. The practical difference: an owner who wants a dish *gone* from the
public menu deletes it (PR-12 soft delete); an owner who wants it *shown as sold out* marks it unavailable.

## 2. Model and API (Tasks 1, 7, 8)

`dishes.availability_status` shipped in the Phase 2 `Pr7DishAvailability` migration: `varchar(20)`, `NOT NULL`,
default `available`, constrained by `ck_dishes_availability` to `available | unavailable`. Existing rows were
backfilled to `available` by that migration. **No new migration was required.**

- `PATCH /api/v1/admin/menu/dishes/{id}/availability` with `{ "status": "available" | "unavailable" }`.
- The full dish update route also accepts `availability`; omitting it leaves the current status alone.
- `GET /api/v1/admin/menu` returns every live dish with its status, regardless of availability.
- The public menu returns published dishes with their `availability` field, so each design can render the indicator.

Business rules (Task 8): the status is required and always exactly one of the two values — enforced by request
validation, the EF default, and the database check constraint. The availability route touches nothing but the status
and the audit trail: price, category, media, description, flags, and display order are all left as they were.

## 3. Draft, preview, and published (Tasks 4, 5)

- The owner draft is the `dishes` table; the admin menu reads it directly.
- `GET /api/v1/admin/website-designs/{designId}/preview` projects that draft, so an availability change appears in
  preview immediately.
- The public menu is served from the current publication snapshot. Because saves publish automatically, the visitor
  view follows within the Phase 3 publication target rather than waiting for a separate action.

## 4. Owner UI (Tasks 2, 3)

`/admin/menu/dishes` shows a colour-and-text status badge (`Available` / `Unavailable`) on every dish row, so the
status is readable without opening the dish. Colour is never the only signal. Owners change the status two ways:

- a one-click `Mark unavailable` / `Mark available` button on each row, whose accessible name includes the dish name;
- an `Availability` select inside the dish editor, alongside the other editable fields.

Neither path deletes anything, and the delete confirmation explicitly points owners to "Unavailable" as the
reversible alternative.

## 5. Tests (Task 9)

Backend `Integration/DishAvailabilityApiTests`:

- `NewDishesDefaultToAvailableAndTheDatabaseRefusesOtherStatuses` — the default, every seeded row, and a direct SQL
  attempt to write `sold_out` that the check constraint rejects.
- `OwnerCanHideAndRestoreADishAcrossDraftPreviewAndPublishedMenus` — hide, then assert the admin list, the design
  preview, and the published public menu, then restore and assert the round trip.
- `AvailabilityNeverChangesTheRestOfTheDishAndCategoriesKeepWorking` — field-by-field comparison plus category counts.
- `AvailabilityUpdatesRejectUnsupportedStatusesAndForeignDishes` — invalid payloads and cross-restaurant isolation.
- `DeletedDishesLeaveThePublicMenuWhileUnavailableOnesRemainListed` — the visibility difference between an
  unavailable dish and a deleted one.

`Unit/DishValidationTests` covers the status rule. Frontend `components/admin/DishManager.test.tsx` covers the
badges, both toggle directions, the editor select, and badge rendering across a 40-dish list.
