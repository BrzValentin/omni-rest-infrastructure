# PR-13 — Price Management

**Status:** Implemented

Source: `requirments/Phase 4/Phase_4_PR-13_Price_Management_Task_Breakdown.md` (10 tasks)

## 1. Price data model (Task 1)

`dishes.price` is `numeric(12, 2)` with `ck_dishes_price >= 0`, mapped to a .NET `decimal` with
`HasPrecision(12, 2)` — no floating point anywhere on the path. Currency is a restaurant setting
(`restaurant_settings.currency`), never a dish field. The column shipped with the Phase 2 `Pr5MenuBrowsing`
migration and every existing dish already carries a valid value, so **no migration was required**.

## 2. Update API and validation (Tasks 2, 3, 9)

`PATCH /api/v1/admin/menu/dishes/{id}/price` with `{ "price": 15.00 }` updates one dish's price and returns the
whole draft menu, including the new price. The full dish update route accepts a price too; both share one rule set.

The reusable rule (`MenuManagementValidation.ValidatePrice`) rejects:

| Case | Code |
| --- | --- |
| Negative amounts | `price_negative` |
| More than two decimal places | `price_scale_invalid` |
| Amounts beyond `numeric(12,2)` | `price_too_large` |
| Missing body | `request_required` |

`NaN` and `Infinity` cannot reach the rule: the price binds to `decimal`, so a non-numeric or non-finite JSON
value fails model binding and is rejected before the handler runs.

Authorization is the shared owner boundary: owner policy, antiforgery, restaurant-from-membership, and the draft
`If-Match`. A dish belonging to another restaurant returns `404 dish_not_found`, so a manipulated resource id
cannot confirm that the dish exists.

## 3. Owner UI (Task 4)

The dish editor at `/admin/menu/dishes` exposes price as a numeric input (`type="number"`, `min="0"`,
`step="0.01"`, `inputMode="decimal"`) beside the restaurant currency. Client-side constraints catch obvious
mistakes; server-side codes render next to the field, without a page reload, and the updated price appears in the
dish list as soon as the save returns.

## 4. Publishing and public display (Tasks 5, 6, 7, 8)

Per the Phase 4 publication ruling, saving a price writes the draft and dispatches the shared publication pipeline,
so no manual cache clearing is involved. The public menu is served from the current publication snapshot, which is
replaced atomically, so visitors move from the old price to the new one with no intermediate state.

The public contract already carried everything the frontend needs, so Task 8 required no change:

```json
{ "currency": "CAD", "locale": "en-CA", "taxDisplayMode": "exclusive", "taxNoticeKey": "menu.tax.exclusive",
  "menu": { "categories": [ { "dishes": [ { "price": "12.50" } ] } ] } }
```

Prices are canonical two-decimal strings; the API never computes or adjusts tax. `formatPrice` renders them with
`Intl.NumberFormat` for the restaurant locale and currency, and falls back to a "Price unavailable" label rather
than printing a malformed amount. All five website designs render the localized notice when
`taxDisplayMode` is `exclusive` and render nothing when it is `inclusive`.

**Scope note.** Task 7 says changing the restaurant tax setting must immediately update the public display. The
rendering side of that is implemented and tested, but Phase 4 adds no endpoint for editing `tax_display_mode`;
PR-9 does not expose it either. Changing the setting today is a data-level operation, and the published site
follows it on the next publication. An owner-facing tax-mode control is left for the phase that owns that setting.

## 5. Tests (Task 10)

Backend `Integration/PriceManagementApiTests`:

- `OwnerPriceChangeIsPublishedAndReplacesThePreviousPublicPrice` — the owner → publish → visitor round trip,
  asserting the old price is gone and the publication version advanced.
- `PublicMenuCarriesPriceCurrencyAndTaxDisplayWithoutCalculatingTax` — exclusive and inclusive restaurants.
- `PriceUpdatesRejectInvalidAmountsAndForeignDishes` — every invalid amount, zero accepted, cross-restaurant
  isolation, and anonymous rejection.

`Unit/DishValidationTests` covers the rule table directly, including the boundary at the stored precision.

Frontend `components/designs/TaxDisplay.test.tsx` asserts, for all five designs, that the notice appears only for
exclusive pricing and that prices render with the restaurant currency and two decimals, plus the malformed-price
fallback. `components/admin/DishManager.test.tsx` covers price entry, the server validation message, and the
updated price in the list.
