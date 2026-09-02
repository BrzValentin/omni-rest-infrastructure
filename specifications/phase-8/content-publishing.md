# Phase 8 — Content Publishing

**Requirement:** PR-25 Task 1. **Status:** Implemented. Five of ten tasks were already complete before
Phase 8; nothing was rebuilt.

## 1. The finding that shapes this document

A cold reading of PR-25's ten tasks — "create a queue", "implement a background publisher", "content
status management" — describes almost exactly what **Phase 3 already shipped**. The identified risk was
over-implementation: taking the tasks at face value would have produced per-entity status columns on
`dishes`, `menu_categories` and `gallery_images`, and a second pipeline running beside the first.

Per `specifications/phase-7/README.md` §2 — *a later phase adapts to the shipped architecture, it does not
fork it* — nothing was rebuilt. This document records what holds, then the narrow gaps Phase 8 closed.

## 2. Lifecycle

```
owner edit
   │
   ├─ 1. draft tables updated, restaurant.draft_version bumped   ┐
   ├─ 2. full public projection serialized into publication_outbox │ ONE transaction
   ├─ 3. audit event written, sharing the operation id            ┘
   │
   ├─ 4. dispatch  ── inline immediately (PublicationDelay = Immediate, the default)
   │                └ or left to the background worker (PublicationDelay > 0)
   │
   └─ 5. publish: FOR UPDATE lock → supersession check → flip is_current → insert publication
                  → mark outbox succeeded                          ← ONE transaction
                  → evict the old version's cache key
```

**Draft store** — the ordinary domain tables. `restaurants.draft_version` is the monotonic counter for the
whole aggregate and is mapped as a concurrency token.

**Queue** — `publication_outbox`, carrying `OperationId`, `RestaurantId`, `DraftVersion`, an immutable
`DraftSnapshotJson`, `Status`, `AttemptCount`, `ErrorCode`, and created/updated/completed timestamps.

**Published store** — `publications`, with a `snapshot` jsonb and an `is_current` flag.

**Public read** — reads *only* the current publication snapshot. No public endpoint reads a draft table
for content.

## 3. Status model

PR-25 asks for Draft / Published / Pending Publication / Archived. The shipped model already expresses all
four; it names them differently. **No schema change was needed.**

| PR-25 vocabulary | Shipped representation |
|---|---|
| Draft | The domain tables plus `restaurants.draft_version` |
| Pending Publication | `publication_outbox.status` ∈ {`pending`, `processing`} |
| Published | `publications.is_current = true` |
| Archived | Superseded `publications` rows, retained with `is_current = false` |

Three database-level guarantees underwrite this, and they are worth naming because they make whole classes
of bug unrepresentable rather than merely untested:

- **Unique `(restaurant_id, draft_version)` on the outbox** — a genuine duplicate queue entry cannot exist.
- **Unique `operation_id` on publications, filtered non-null** — double dispatch is idempotent, not
  double-published.
- **Unique `restaurant_id` filtered on `is_current`** — exactly one publication is live per restaurant, by
  constraint rather than by convention.

## 4. Entity coverage — every editable entity participates

This was the crux question, and the answer is architectural rather than incidental.
`IRestaurantManagementService`, `IMenuManagementService` and `IGalleryManagementService` are **three
interfaces on one partial class**, registered as a single scoped instance. Every mutation therefore funnels
through the same `MutateCoreAsync`:

| Entity | Path |
|---|---|
| Profile, address, hours, special hours, social links, website, images, design | `MutateAsync` → `MutateCoreAsync` |
| Menu categories | `MutateMenuAsync` → `MutateCoreAsync` |
| Dishes, incl. price and availability | `MutateMenuAsync` → `MutateCoreAsync` |
| Gallery | `MutateGalleryAsync` → `MutateCoreAsync` |

The snapshot is the **whole aggregate**, not a per-entity delta, so publication versioning is per
restaurant: a menu edit and a profile edit contend on one counter and supersede each other correctly.

**Audited exceptions**, none of which is a bypass:
- Sample-data seeding writes its own publication row.
- Media *upload* writes a `media_assets` row outside the funnel. This is not a bypass: an uploaded asset is
  invisible publicly until an owner *selects* it, and selection goes through `MutateCoreAsync`. Worth
  stating precisely: "unpublished" applies to the **reference**, not to the bytes — the blob is fetchable
  at its GUID URL from upload.
- An intermediate flush inside the two-pass reorder is within the mutation transaction, not a separate
  commit.

One artefact to watch: `RestaurantConfigurationService.GetCurrentAsync` reads live draft rows. It is
registered but mapped to no endpoint. **It must not be wired to a public route** without first moving it
onto the published snapshot.

## 5. Timing — the PR-24 / PR-25 resolution

See `README.md` Ruling 3 for the reasoning. In short: `PublicationDelay` defaults to `Immediate`, which
satisfies PR-24 Task 11; the knob's existence satisfies PR-25 Task 5's "no hardcoded timing values".

`PublicationDispatcher` in `appsettings.json`, all previously code-only defaults:

| Setting | Default | Meaning |
|---|---|---|
| `Enabled` | `true` | Runs the background worker |
| `PollInterval` | 2 s | Recovery scan cadence |
| `ClaimLease` | 30 s | After this, a stranded `processing` row is reclaimable |
| `BatchSize` | 20 | FIFO by `(CreatedAt, OperationId)` |
| `PublicationDelay` | `00:00:00` | Non-zero defers publication to the worker and **knowingly relaxes PR-24 Task 11** |
| `MaxAttempts` | 5 | Attempt budget before a terminal state |
| `RetryBackoff` | 30 s | Rest period before a failed row is reclaimable |

Startup range validation rejects absurd values rather than misbehaving silently.

## 6. Failure handling

**Atomicity.** Publication happens in one transaction spanning the `FOR UPDATE` lock, the supersession
check, the `is_current` flip, the insert, and the outbox status write. A failure disposes it uncommitted,
so the previous publication stays live. Verified by a pre-existing test that injects a failure, confirms
the public site still serves the old content, then retries to success.

**Supersession.** An operation whose restaurant draft version or current publication version has moved past
it is dropped as `publication_superseded`. This is what stops a stale retry rolling the public site
backwards.

**Automatic retry — the gap Phase 8 closed.** Before Phase 8, `failed` was *terminal to the worker*: only
an owner clicking Retry could recover it. The worker now also reclaims `failed` rows that are inside the
attempt budget and past the backoff. `publication_superseded` and `publication_retry_exhausted` are
excluded and remain terminal — re-claiming them would only burn the attempt budget.

Two safety notes:

- **Auto-retry does not bypass the lock or the supersession check.** A stale retry marks itself superseded
  rather than publishing an old snapshot. This is asserted by a test that pins the injected failure to the
  stale operation id so the worker cannot win the race, then verifies the newer publication is still
  `is_current`.
- **The guards are enforced twice** — in the worker's `SELECT` predicate and again in the dispatcher's
  claim `UPDATE`, which is authoritative. Good defence in depth, but a regression at a single site is
  invisible to black-box testing. Change both, or neither.

**Cancellation.** `OperationCanceledException` is rethrown before the failure handler, so a host crash
leaves the row `processing` for lease-based reclaim rather than falsely marking it failed.

## 7. Cache refresh

Public freshness is guaranteed structurally rather than by invalidation messaging:

- The server cache key contains the publication version, so a new publication is a new key; the old key is
  additionally evicted after commit.
- Public responses carry an ETag and `Cache-Control: public, max-age=0, must-revalidate`.
- Every public page is `force-dynamic`, and the server readers use raw `node:http` rather than `fetch`, so
  the Next.js Data Cache never applies.

**There is deliberately no `revalidatePath` / `revalidateTag` anywhere.** Adding one would imply a cache
that does not exist. This is recorded as a decision, not an omission — and as a fragility: **if a future
refactor moves the readers to `fetch` or drops `force-dynamic`, this guarantee regresses silently with no
failing test.** On a `Host`-resolved multi-tenant app that regression is also a tenant-isolation risk. A
guard test is recommended and remains outstanding.

## 8. Logging

Phase 8 added start and success logs with operation id, restaurant id, draft version, attempt number and
elapsed milliseconds, and fixed a `LogWarning` that discarded the exception object — which had made
`publication_dispatch_failed` undebuggable.

The *durable* record PR-25 Task 8 asks for already existed in `audit_events` plus the outbox timestamps.
The gap was observability in logs, not durability; no `publication_log` table was added.

## 9. Verification

`PublicationRetryApiTests` (new, worker enabled, each test scoping its own options):

1. The worker — never a manual retry — republishes a failed operation once the fault clears.
2. **A stale failed publication retires as superseded and never rolls back the newer publication.**
3. Permanent failures stop being reclaimed once the attempt budget is exhausted.
4. A freshly failed publication is not reclaimed until the backoff elapses.
5. A non-zero `PublicationDelay` leaves the save `pending` and the public site on the old content.

Tests 2, 3 and 4 were **mutation-tested**: with `IsSuperseded` forced false, with the backoff gates
removed, and with the attempt-budget gates removed, the corresponding test fails. They assert behaviour,
not merely coverage.

These live in their own file because they enable the worker, while `PostgresFixture` must keep it disabled
for the exact-`AttemptCount` assertions elsewhere.

## 10. Known traps

- **`AttemptCount` counts dispatch claims**, and existing tests assert exact values. They are safe only
  because the fixture disables the worker. Enabling it globally would make them nondeterministic.
- **A save's reported status is nondeterministic when the worker is enabled** — see `README.md` §5. The
  owner UI already tolerates `processing`.
- **`SpecialDateDuplicate()` declares status 409, which is dead code** — any failure carrying `Errors` is
  routed through validation, which hardcodes 400. The observable contract is the 400; the literal is
  misleading and was left rather than changed mid-phase.
- **Nothing prunes the outbox or superseded publications.** One outbox row accrues per edit, forever. No
  retention policy was committed to in this phase; it is recorded as outstanding.
- **A never-published restaurant exposes its draft name and locale** through the pre-first-publication
  fallback. It resolves itself on first publish and affects only a tenant that has never published, but it
  is technically a narrow violation of "prevent incomplete edits from replacing published content".
