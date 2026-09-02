# Phase 8 — Performance Budget and Metrics

**Requirement:** PR-23 Task 1. **Status:** Implemented; enforcement partially proven (see §6).

This document is the numeric budget that `architecture.md` §17 deferred and that was never written:

> Numerical performance budgets and load profiles must be defined in the Phase 0 quality specification
> rather than implied by words such as "fast" or "smooth."

Every other PR-23 task references these numbers.

## 1. Field targets (Core Web Vitals)

`specifications/phase-1/README.md` already fixed three of these at p75. They are restated here unchanged;
Phase 8 adds the two that were missing.

| Metric | Target (p75, mobile) | Source |
|---|---|---|
| LCP — Largest Contentful Paint | ≤ 2.5 s | Phase 1 |
| INP — Interaction to Next Paint | ≤ 200 ms | Phase 1 |
| CLS — Cumulative Layout Shift | ≤ 0.1 | Phase 1 |
| FCP — First Contentful Paint | ≤ 1.8 s | **New in Phase 8** |
| TBT — Total Blocking Time | ≤ 200 ms (lab proxy for INP) | **New in Phase 8** |

Collection is implemented in-app (`components/vitals` + `app/api/vitals`), reporting LCP, INP, CLS, FCP and
TTFB. See `error-handling.md` §6 for what that endpoint may and may not log — in particular, no full URLs
with query strings and no tenant-identifying values.

## 2. Asset budgets — enforced

These are gates. `scripts/perf-report.mjs` exits non-zero when one is exceeded.

| Budget | Value | Measured after Phase 8 | Headroom |
|---|---|---|---|
| Client JavaScript, raw | 1,050,000 B | 969,334 B | ~8 % |
| Client JavaScript, gzip | 330,000 B | 305,479 B | ~8 % |
| Category switch | 100 ms | 4.5 ms | large |
| Navigation (cold `/menu`, 1,000 dishes) | 5,000 ms | ~537 ms page load | deliberately loose |

Notes on how these numbers were chosen, because a budget without a rationale is a number nobody will dare
change later:

- **The JavaScript budgets sit ~8 % above measured.** That is enough for ordinary feature work while
  remaining tight enough to catch the specific regression that motivated them: re-marking the design
  renderers `"use client"` costs more than 200 KB and cannot fit under the ceiling.
- **The category-switch budget is 100 ms** because that is the ceiling `e2e/menu.perf.spec.ts` has asserted
  since Phase 6. It is mirrored into the report so the gate and the test agree.
- **The navigation budget is deliberately an order-of-magnitude guard, not a target.** The spec times
  `page.goto` plus first-heading-visible, so it carries Playwright driver overhead that cannot be separated
  from outside the harness. It catches a catastrophic regression; it does not certify a good page load.

## 3. Image budgets

| Rule | Value |
|---|---|
| Upload size cap | 5 MiB (server-enforced, content-sniffed, not extension-trusted) |
| Accepted formats | JPEG, PNG, WebP |
| Served formats | AVIF, WebP, with fallback |
| Responsive ladder generated on upload | 480 / 960 / 1600 px, `ResizeMode.Max`, never upscaled |
| Gallery thumbnail | 480 px longest edge |
| Layout shift from images | Zero — width/height and `aspectRatio` reserved on every rendered image |

Before Phase 8 a dish image stored exactly one variant at original size and the gallery bypassed the
optimizer entirely (`unoptimized` plus an identity loader). Both are fixed; the read side already selected
the widest variant, so the ladder was purely additive.

## 4. API and database targets

| Target | Value |
|---|---|
| Public menu/restaurant read, p95 | ≤ 200 ms server time |
| Admin mutation, p95 | ≤ 500 ms server time (includes publish on the default `Immediate` setting) |
| Slow-request log threshold | 500 ms (`PerformanceLogging:SlowRequestThreshold`) |
| Slow-query log threshold | 200 ms (`PerformanceLogging:SlowQueryThreshold`) |
| Compression | Brotli, then Gzip, on JSON and problem+JSON |
| N+1 queries on the public path | Zero — one `AsNoTracking` projection against the published snapshot |

The public read was already strong before Phase 8: a single projection query, a version-keyed
`IMemoryCache` whose invalidation is structural (a new publication produces a new key, so stale data is
impossible by construction), plus ETag and `304` handling. Phase 8 added compression and the slow-path
logging that makes a regression visible.

Index coverage was audited and found adequate: 31 `HasIndex` declarations covering tenant resolution,
category and dish browse ordering, the publication `is_current` filtered unique index that the public read
hits, and the outbox `(status, created_at)` scan.

## 5. What is deliberately *not* budgeted

- **Search, pagination, infinite scroll.** No such feature exists — `README.md` Ruling 1.
- **DOM node count on the menu.** All 1,000 dishes stay in the markup by a Phase 6 SEO ruling —
  `README.md` Ruling 2. The lever taken was hydration cost, not DOM size.
- **ASP.NET `OutputCache` hit ratio.** Deferred deliberately: on a `Host`-resolved multi-tenant app a
  mis-keyed cache is a tenant-isolation bug. `README.md` §5.

## 6. Enforcement status — read this before citing the budgets

| Mechanism | State |
|---|---|
| `scripts/perf-report.mjs` gate | Implemented; verified to exit 0 within budget and 1 on breach |
| `scripts/assert-design-assets.mjs` | Implemented and passing; now asserts no design markup reaches any client chunk |
| `e2e/menu.perf.spec.ts` timing assertions | Implemented, **never executed here** — Playwright cannot run in this environment |
| Lighthouse ≥ 90 | Configured, **never executed** |
| CI enforcement | Authored, **never executed** — the repository has never had CI |

The measured figures in §2 come from a local production build plus a standalone 30-category × 1,000-dish
fixture driven in a browser — **not** from a run of `npm run test:perf`. This inherits the scope
disclaimer `scripts/perf-report.mjs` already carries:

> local production build; not a staging or field measurement

Lighthouse's ≥ 90 threshold in particular is a **lab** number. A headless Linux run under WSL2 on a
developer laptop is not the mobile-throttled reference environment the Phase 1 targets assume. Treat it as
a regression detector, not as certification.
