# Phase 4 — Implementation evidence

## 1. What was added

### Backend (`src/backend/OmniRest.Api`)

| File | Purpose |
| --- | --- |
| `Menus/MenuManagementContracts.cs` | Admin category, dish, and menu request/response records |
| `Menus/MenuManagementValidation.cs` | Category name, description, and reorder rules |
| `Menus/DishValidation.cs` | Dish, price, availability, flag, and reorder rules |
| `Restaurants/MenuManagementService.cs` | `IMenuManagementService`, category operations, admin menu projection |
| `Restaurants/DishManagementService.cs` | Dish create/update/price/availability/delete/reorder |
| `Modules/AdminMenuEndpoints.cs` | `/api/v1/admin/menu` category routes |
| `Modules/AdminDishEndpoints.cs` | `/api/v1/admin/menu/dishes` routes |
| `Data/Migrations/20260826120000_Phase4DishAuditEntityId.cs` | Adds `audit_events.entity_id` |

Changed: `Restaurants/RestaurantManagementService.cs` (the mutation pipeline was split into `MutateCoreAsync` so the
menu services reuse the same transaction, publication outbox, audit, and concurrency handling), `Data/Phase3Model.cs`
(audit `EntityId`), `Modules/ApiV1Endpoints.cs`, `Program.cs`, and the model snapshot.

### Frontend (`src/frontend`)

| File | Purpose |
| --- | --- |
| `lib/menu-admin-contract.ts` | Admin menu types, error/label maps, ordering and price helpers |
| `components/admin/useMenuDraft.ts` | Shared draft ETag, save, notice, conflict, and field-error handling |
| `components/admin/CategoryManager.tsx` | Category list, create, rename, delete, drag-and-drop plus keyboard reorder |
| `components/admin/DishManager.tsx` | Dish list, editor, image handling, flags, availability, reorder |
| `app/admin/(protected)/menu/page.tsx` | Categories page |
| `app/admin/(protected)/menu/dishes/page.tsx` | Dishes page |

Changed: `lib/browser-api.ts` (allows `PATCH`), `app/api/v1/[...path]/route.ts` (exports a `PATCH` handler — without it Next.js answered 405 before any PATCH reached the API, found by running the app), `lib/server-api.ts` (`getAdminMenu`),
`app/admin/(protected)/layout.tsx` (Menu and Dishes navigation), `app/admin/admin.module.css`.

## 2. Test results

Backend, run against PostgreSQL 18:

```
Failed: 9, Passed: 159, Total: 168
```

All nine failures are `MediaStorageTests` and the media-upload integration test that depends on them. They fail with
`PlatformNotSupportedException: Hardened local media storage requires Linux or macOS directory-descriptor APIs` and a
symlink privilege error. This is the **pre-existing** Windows baseline: the same nine failed before any Phase 4 change
(verified by stashing the working tree). No Phase 4 test fails.

Frontend:

```
Tests: 126 passed, 3 failed (129); Files: 19 passed, 1 failed (20)
```

The failures are all in `components/admin/RestaurantEditor.test.tsx`, which fails identically (2 of 8 in isolation)
with every Phase 4 change stashed — also pre-existing. `npm run lint` and `npm run typecheck` are clean.

New tests added by Phase 4:

| Suite | Coverage |
| --- | --- |
| `Unit/MenuManagementValidationTests` | Category name, description, reorder rules |
| `Unit/DishValidationTests` | Dish fields, the price rule table, flags, availability, reorder |
| `Integration/AdminMenuCategoryApiTests` | Category workflow, authorization, validation |
| `Integration/AdminDishApiTests` | Dish workflow, audit identity, rejected payloads and foreign resources |
| `Integration/PriceManagementApiTests` | Price publish round trip, public tax contract, invalid amounts |
| `Integration/DishAvailabilityApiTests` | Default status, DB constraint, draft/preview/published, isolation |
| `components/admin/CategoryManager.test.tsx` | Category UI, keyboard reorder, dialogs, errors, `axe-core` |
| `components/admin/DishManager.test.tsx` | Dish UI, editor, images, flags, availability, `axe-core` |
| `components/designs/TaxDisplay.test.tsx` | Price and tax-notice rendering across all five designs |

## 3. Test-environment notes

`Integration/PostgresFixture.cs` now creates its Testcontainers container lazily and accepts an
`OMNI_TEST_POSTGRES` connection string. This was needed because Windows Application Control blocks loading the
unsigned `Docker.DotNet.dll`, which made every Testcontainers test fail at fixture construction on the development
machine — including tests unrelated to Phase 4. With the variable set, the suite runs against any PostgreSQL 18
server. **Every test recreates the target database, so the variable must point at a disposable database.** Unset,
the behaviour is unchanged and Testcontainers is used exactly as before.

```sh
OMNI_TEST_POSTGRES="Host=localhost;Port=55432;Database=omni_rest_phase4_tests;Username=omni_rest;Password=local_dev_only" \
  dotnet test src/backend/OmniRest.sln
```

## 4. Open items for product

1. **PR-13 Task 7** expects changing the restaurant tax display mode to update the public site. Rendering is
   implemented and tested, but no owner-facing endpoint or control exists for `tax_display_mode`; PR-9 does not
   expose it either. This needs an owner for the setting itself.
2. **PR-14 Task 6** (hide unavailable dishes) is deliberately not implemented; see
   `pr-14-dish-availability.md` §1. If product later prefers hiding, the change is one filter in
   `PublicMenuProjectionBuilder.BuildMenu` plus the Phase 2 visitor tests.
3. **Category deletion** is refused while any live dish remains. PR-12 provides the escape hatch by letting owners
   move a dish to another category or delete it, but there is no bulk "move all dishes" action yet.
