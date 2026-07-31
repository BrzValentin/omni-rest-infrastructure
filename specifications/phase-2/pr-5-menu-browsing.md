# PR-5 — Menu Browsing Technical Specification

**Status:** Proposed

**Depends on:** Phase 1

**Product source:** `requirments/Phase 2/Phase_2_PR-5_Menu_Browsing_Task_Breakdown.md`

## 1. Objective

Replace the `/menu` placeholder with a server-rendered digital menu containing ordered categories and dishes, prices, optional images, dietary/promotional badges, tax information, and complete loading/empty/error behavior.

## 2. Data model

### `menus`

- `id uuid` primary key;
- `restaurant_id uuid` required;
- `name varchar(100)` required;
- `is_active boolean` required;
- `created_at`, `updated_at`, and concurrency token;
- unique filtered rule permitting at most one active/published menu per restaurant in Phase 2.

### `menu_categories`

- `id uuid` primary key;
- `restaurant_id uuid` and `menu_id uuid` required;
- `name varchar(100)` required;
- `description varchar(300)` nullable;
- `display_order integer` required and non-negative;
- `is_active boolean` required;
- timestamps and concurrency token;
- unique `(menu_id, display_order)` and tenant-consistent foreign keys.

### `dishes`

- `id uuid` primary key;
- `restaurant_id`, `menu_id`, and `category_id` required;
- `name varchar(160)` required;
- `description varchar(1000)` nullable;
- `price numeric(12,2)` required and non-negative;
- `media_asset_id uuid` nullable;
- `availability_status varchar(20)` required, default `available`;
- `is_active boolean` required;
- `display_order integer` required and non-negative;
- timestamps, optional archive timestamp, and concurrency token;
- unique `(category_id, display_order)` and tenant-consistent foreign keys.

### Badges

Use a reference table with stable codes and a `dish_badges` join table. Required codes: `vegetarian`, `vegan`, `gluten_free`, `dairy_free`, `halal`, `spicy`, `contains_nuts`, `popular`, and `new`. The API never infers medical safety from a badge.

## 3. Public API

`GET /api/v1/public/menu`

The typed response contains menu ID/name/version, currency, tax-display mode, tax-notice key, ordered categories, ordered dishes, badges, media variants/alt text, and availability. It includes an ETag tied to restaurant publication version and supports conditional GET.

Unavailable dishes are returned. Inactive or archived dishes are excluded. Category behavior is finalized by PR-6.

## 4. Task specifications

### Task 1 — Menu Data Model

- Implement the schema above with EF Core configurations and migration.
- Enforce category/menu/restaurant consistency; a dish cannot reference a category from another menu or restaurant.
- Support future multiple menus while allowing one active menu now.
- Populate deterministic Phase 2 sample data through the controlled public-projection import.
- Verify clean migration, upgrade, constraints, cascade/archive behavior, and ordering.

### Task 2 — Dietary and Feature Badges

- Seed stable badge definitions idempotently.
- Permit zero or many distinct badges per dish.
- Reject unknown/duplicate badge assignments in write commands.
- Return localized label keys and semantic category (`dietary`, `allergen`, `promotional`, `heat`) rather than presentation icons from persistence.
- Include a visible disclaimer that badges are informational and do not replace allergen consultation.
- Test every code, multiple badges, duplicate rejection, and unknown values.

### Task 3 — Menu API

- Implement an anonymous typed Minimal API endpoint resolving restaurant by host.
- Query the published menu read model in a bounded number of database calls.
- Return categories/dishes in explicit display order with stable ID tie-breaking.
- Return unavailable dishes with status; exclude inactive/archived content.
- Return 404 for unknown host and a successful empty-menu representation when the restaurant exists without a published menu.
- Use Problem Details, OpenAPI, ETag, output caching, and restaurant/publication-aware cache keys.
- Integration-test ordering, tenant isolation, optional data, conditional GET, and query count.

### Task 4 — Menu State Management

- Render the initial menu through a Next.js Server Component.
- Do not add a global client-state library; category interaction uses local component state.
- Use route-level loading and error boundaries for navigation/revalidation.
- Hydrate category interaction from the server-provided menu without a duplicate browser API request.
- Retry performs one explicit revalidation request and prevents concurrent duplicates.
- Test initial, loading, empty, recoverable error, retry, and no-duplicate-request states.

### Task 5 — Menu Categories UI

- Render active categories in configured order.
- Delegate switching/empty-category behavior to PR-6.
- Provide stable category slugs/IDs for navigation without using names as identity.
- Keep category and dish headings semantically nested.
- Test ordering and long/localized names.

### Task 6 — Menu Item Card

- Implement one reusable `DishCard` receiving a public dish DTO.
- Render name, optional description, locale/currency-formatted price, optional image/placeholder, badges, and availability.
- Do not use `dangerouslySetInnerHTML`.
- Long content wraps; card height is content-driven.
- Accessible name/order remains meaningful without CSS.
- Component-test complete/minimal/long/unavailable variants.

### Task 7 — Badge Rendering

- Map stable badge codes to localized labels and optional decorative icons in one registry.
- Render text labels; icon/color alone never communicates meaning.
- Unknown codes are logged once for diagnostics and omitted safely from public rendering.
- `contains_nuts` is visually distinguishable as allergen information without claiming exhaustive allergen coverage.
- Test accessible labels, wrapping, multiple badges, unknown codes, and contrast.

### Task 8 — Menu Images

- Use approved Media variants and Next.js `Image` with explicit dimensions, `sizes`, and safe host allowlist.
- Lazy-load dish images below the initial viewport.
- Render an accessible, layout-stable placeholder when absent or failed.
- Alternative text comes from media metadata; decorative images use explicit empty alt.
- Test variant selection, missing/broken images, layout stability, and remote-host rejection.

### Task 9 — Price Presentation

- Format using `Intl.NumberFormat` with restaurant locale and currency; Phase 2 sample currency is CAD.
- Never perform floating-point arithmetic on prices.
- Public DTO transmits decimal price as an agreed precision-safe JSON representation.
- Missing price is invalid for published Phase 2 dishes; the UI fallback exists only for contract-error resilience and is logged.
- Zero-price wording is blocked on product approval; do not silently render `$0.00` as “Free.”
- Test rounding boundaries, locale formatting, zero, and invalid/missing contract fallback.

### Task 10 — Tax Information Notice

- Read tax-display mode from the restaurant public projection.
- When prices exclude tax, render one localized informational notice adjacent to the menu heading or footer.
- When prices include tax, omit the notice entirely.
- Do not calculate tax or modify displayed dish prices.
- Test both modes and accessibility association.

### Task 11 — Empty and Error States

- Distinguish unknown restaurant, no published menu, no active categories, empty active category, API failure, and image failure.
- Use friendly localized messages and a retry only for recoverable request failures.
- Preserve public shell, contact actions, and navigation during menu failures.
- Error details remain internal and correlated in logs.
- Browser-test every state.

### Task 12 — Performance Optimization

- Fetch the published menu once per server render.
- Project only public fields and avoid tracked EF entities.
- Use explicit indexes for restaurant/menu/category/status/order access.
- Use responsive images and avoid eagerly loading non-LCP dish media.
- Validate the 30-category/1,000-dish fixture against shared API and interaction targets.
- Record payload size, query count, server duration, render duration, and client bundle impact.

### Task 13 — Responsive Menu Experience

- Apply Phase 1 viewport, touch, typography, and overflow standards.
- Category navigation remains operable at 320 CSS pixels.
- Dish cards use one column on small widths and only add columns when content remains readable.
- No fixed card height or clipped description.
- Run the full Phase 1 viewport matrix and 200% zoom check.

### Task 14 — Accessibility

- Meet WCAG 2.2 AA.
- Use one page `h1`, category `h2`, and dish heading hierarchy.
- Category navigation, retry, badges, images, prices, and unavailable status are keyboard/screen-reader understandable.
- Do not announce decorative icons.
- Run automated scans plus keyboard and screen-reader smoke tests.

### Task 15 — Testing and Documentation

- Unit-test validation, price formatting inputs, badge mapping, and projection logic.
- PostgreSQL integration-test migrations, constraints, public query, ordering, and tenant isolation.
- Contract-test OpenAPI and representative JSON.
- Component-test cards/navigation/states.
- Playwright-test browsing, failure/retry, responsive behavior, and accessibility.
- Document schema, endpoint, sample data, and operational cache behavior.

## 5. Security and operations

- Public DTOs contain no draft, audit, or owner-only fields.
- Cache keys include restaurant and publication version.
- Media origins are allowlisted.
- Descriptions and badge labels are rendered as text.
- Menu API rate limits must tolerate normal page traffic and avoid turning cached public reads into an easy denial-of-service target.

## 6. Completion evidence

- schema/migration report;
- public API/OpenAPI snapshot;
- large-menu performance report;
- component/browser/accessibility results;
- cache and conditional-request tests;
- mapping of all 15 source tasks.

## 7. References

- [Phase 2 shared specification](README.md)
- [Application architecture](../architecture.md)
