# PR-3 — Special Operating Hours Technical Specification

**Status:** Proposed

**Depends on:** Phase 0, PR-2

**Deferred dependency:** PR-8 authentication and PR-9 management for owner CRUD UI

**Product source:** `requirments/Phase 1/Phase_1_PR-3_Special_Operating_Hours.md`

## 1. Objective

Support date-specific restaurant closures and operating intervals that override the regular weekly schedule. Phase 1 delivers persistence, validation, public read behavior, override calculation, and tests. Authenticated owner-management endpoints and UI are activated in Phase 3 after secure identity and restaurant ownership exist.

## 2. Scope split

### Phase 1 delivery

- special-date data model and migration;
- domain commands/services usable by later administration endpoints;
- override calculation;
- integration into the public restaurant API and UI;
- deterministic validation and automated tests;
- controlled sample/seed data for non-production environments.

### Deferred to Phase 3

- externally reachable create/update/delete administration endpoints;
- owner management screen;
- authorization and ownership workflows;
- production content-entry workflow.

This split follows the product roadmap: Phase 1 is public and Phase 3 introduces owner management. The deferred tasks remain specified below so they can be implemented without redesign.

## 3. Data model

### 3.1 `special_hour_dates`

| Field | PostgreSQL type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `restaurant_id` | `uuid` | Required foreign key. |
| `local_date` | `date` | Required restaurant-local calendar date. |
| `is_closed` | `boolean` | Required. |
| `note` | `varchar(200)` | Nullable public-safe note. |
| `created_at` | `timestamptz` | Required. |
| `updated_at` | `timestamptz` | Required. |
| concurrency token | provider-supported | Required. |

Unique constraint: `(restaurant_id, local_date)`.

### 3.2 `special_hour_intervals`

| Field | PostgreSQL type | Rule |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `special_hour_date_id` | `uuid` | Required foreign key with cascade delete. |
| `opens_at` | `time` | Required. |
| `closes_at` | `time` | Required. |
| `closes_next_day` | `boolean` | Required. |
| `display_order` | `smallint` | Required. |

Rules:

- closed dates have zero intervals;
- open dates have one or more valid, non-overlapping intervals;
- interval ordering is deterministic;
- the model supports split and overnight service;
- special hours never mutate regular weekly hours.

## 4. Public contract changes

PR-3 extends `GET /api/v1/public/restaurant` with:

```json
{
  "specialHours": [
    {
      "date": "2026-12-25",
      "isClosed": true,
      "note": "Christmas Day",
      "intervals": []
    }
  ],
  "status": {
    "state": "closed",
    "label": "Closed",
    "nextChangeAt": "2026-12-26T17:00:00Z",
    "source": "specialHours"
  }
}
```

The API returns a bounded public window of special dates rather than an unbounded history. Default window: 30 days before through 365 days after the restaurant-local current date. A technical specification may adjust the window if product presentation requires it.

The `source` value is `regularHours` or `specialHours`, enabling correct presentation and diagnostics without exposing internal records.

## 5. Deferred administration contract

These endpoints are reserved for Phase 3 and must not be anonymously exposed in Phase 1:

- `GET /api/v1/admin/special-hours?from=<date>&to=<date>`
- `POST /api/v1/admin/special-hours`
- `PUT /api/v1/admin/special-hours/{id}`
- `DELETE /api/v1/admin/special-hours/{id}`

The authenticated restaurant is derived from membership context. Request bodies do not select an arbitrary restaurant. Create returns 201; update returns 200; successful delete returns 204. Validation and concurrency failures use the shared Problem Details format.

## 6. Task specifications

### Task 1 — Design the Data Model for Special Operating Hours

#### Technical requirements

- Implement the date and interval entities in section 3.
- Add EF Core configurations, relationships, indexes, unique constraint, and database check constraints.
- Use restaurant-local `date` and `time` values, not UTC timestamps, for schedule definitions.
- Keep create/update timestamps as UTC instants.
- Add a concurrency token for future owner edits.
- Document cascade behavior and restore/backup implications.

#### Verification

- Migration applies to a clean PostgreSQL database and upgrades a PR-2 database.
- Database tests reject duplicate restaurant/date pairs and closed dates with intervals.
- Entity mapping tests preserve date, interval, and overnight semantics.

### Task 2 — Implement CRUD API for Special Operating Hours

#### Phase 1 technical requirements

- Implement application commands and query services for create, replace/update, delete, get-by-date, and get-range.
- Keep these operations internal to the API assembly; do not map admin HTTP endpoints yet.
- Commands accept an explicit trusted restaurant context and enforce aggregate invariants.
- Range queries require both bounds, enforce `from <= to`, and enforce a configured maximum range.
- Duplicate dates return a stable conflict result.

#### Deferred Phase 3 technical requirements

- Map the reserved endpoints in section 5 behind authentication and restaurant-owner policy.
- Use typed results and OpenAPI.
- Return 400 for malformed validation, 404 for unavailable resources within the authorized tenant, 409 for duplicate/concurrency conflicts, and appropriate authentication/authorization responses.

#### Verification

- Phase 1 integration tests exercise commands directly with PostgreSQL.
- Phase 3 endpoint tests must cover every status and cross-restaurant access before endpoints are enabled.

### Task 3 — Build Owner UI for Managing Special Hours

#### Status

Deferred to PR-9 because Phase 1 has no authenticated owner area.

#### Deferred technical requirements

- Create an owner calendar/list view with chronological date ordering.
- Support add, edit, delete, closed-date toggle, interval add/remove, and overnight selection.
- Hide interval inputs when closed and preserve no stale interval data on submission.
- Display field-level validation and concurrency conflict recovery.
- Use accessible native date/time controls where supported with a tested fallback.
- Require confirmation for deletion.
- Use the authenticated admin API; never write database data from Next.js directly.

#### Verification required before activation

- Component tests for closed/open transitions and interval editing.
- Browser tests for CRUD, validation, keyboard operation, and concurrent update recovery.
- Authorization tests prove owners cannot observe or mutate another restaurant's dates.

### Task 4 — Apply Override Logic to Restaurant Schedule

#### Technical requirements

- Implement one `RestaurantScheduleService` as the authoritative calculation boundary.
- For a requested restaurant-local date:
  1. load the special-date record;
  2. when closed, return no intervals;
  3. when open, return special intervals;
  4. when absent, return regular weekday intervals.
- The service returns intervals plus provenance.
- Open/closed calculation, next-transition calculation, public API, and future ordering logic consume this service rather than duplicating precedence rules.
- Execute the required reads in a bounded number of database queries.

#### Verification

- Unit tests cover absent override, closed override, open override, split intervals, overnight intervals, and timezone/date boundaries.
- Mutation-oriented tests would fail if precedence order were reversed or regular intervals were accidentally merged with special intervals.

### Task 5 — Update Public Restaurant Availability

#### Technical requirements

- Extend the public DTO and status source as shown in section 4.
- Display upcoming special hours in the public hours section when they fall in the presentation window.
- Display “Closed” for closed override dates and all special intervals for open override dates.
- Current status and today display must come from the same schedule-service result.
- Keep ordinary weekly hours visible unless the approved design replaces them for the current special date.
- Render notes as plain text.

#### Verification

- API and component contract tests use the same fixtures and assert identical effective intervals.
- Browser tests verify a closed date and modified-hours date.
- No UI/API disagreement exists for the restaurant-local current date.

### Task 6 — Validation and Business Rules

#### Technical requirements

- Enforce one record per restaurant/date.
- Reject impossible calendar dates at contract parsing.
- Reject intervals missing either endpoint.
- Reject intervals on closed dates.
- Require at least one interval on open dates.
- Reject overlap and duplicate display order.
- Permit an earlier-looking close time only when `closesNextDay` is true.
- Reject intervals whose effective duration is zero or exceeds the configured maximum.
- Normalize notes by trimming; blank notes become null.
- Return stable validation codes suitable for localized UI messages.

#### Verification

- Boundary-value unit tests cover every rule.
- PostgreSQL tests prove unique/check constraints protect the model independently of application validation.

### Task 7 — Automated Testing

#### Technical requirements

- Unit-test schedule and validation services with an injected clock.
- Integration-test EF Core mappings, migrations, constraints, commands, range queries, and public endpoint projection using PostgreSQL.
- Component-test regular/special-hours presentation.
- Browser-test the public effective schedule at mobile and desktop viewports.
- Add a regression test proving regular-hour behavior remains unchanged when no special record exists.
- Defer owner UI/endpoints tests with traceable identifiers; they become mandatory before Phase 3 activation.

#### Verification

- All Phase 1 tests pass and deferred tests are explicitly listed rather than silently omitted.
- Coverage includes precedence, not only CRUD success cases.

## 7. Seed and production-data boundary

Development and automated tests may load deterministic special-hour fixtures. Production special hours must not be changed through ad hoc startup seeding after initial launch. Until Phase 3 management is available, production onboarding uses a reviewed, idempotent import or migration process defined by operations; direct manual database editing is not an accepted workflow.

## 8. Security and privacy

- Only bounded, public-safe future schedule data is exposed anonymously.
- Internal record identifiers are unnecessary in the public DTO.
- Deferred admin endpoints remain unmapped until authentication and membership authorization tests pass.
- Notes are treated as untrusted plain text.
- Range bounds prevent unbounded public or administrative queries.

## 9. PR-3 completion evidence

- migration and constraint report;
- command/query integration tests;
- schedule precedence and boundary test report;
- public API contract diff;
- public UI tests for closed and modified dates;
- explicit deferred-management checklist linked to PR-8/PR-9.

## 10. References

- [Phase 1 shared specification](README.md)
- [PR-2 Restaurant Information](pr-2-restaurant-information.md)
- [Application architecture](../architecture.md)
