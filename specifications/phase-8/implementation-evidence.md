# Phase 8 — Implementation Evidence

What was built, how it was verified, and — with equal weight — **what was not verified and why**. The
second list matters: several Phase 8 acceptance criteria cannot be demonstrated in this environment, and
recording them as passing would be false.

## 1. Test baselines

| Suite | Before Phase 8 | After | Where |
|---|---|---|---|
| Backend (xunit) | 242 / 242 | **271 / 271** | WSL2 Linux only |
| Frontend (vitest) | 244 across 29 files | **367 across 40 files** | WSL2 Linux |
| `npm run lint` | clean | clean | |
| `npm run typecheck` | clean | clean | |
| `npm run build` | succeeds | succeeds | |
| `scripts/assert-design-assets.mjs` | **failing** | **passing** | see §4 |

The Windows host cannot build this repository at all — it has .NET SDK 8 only, no Node, and no Docker,
while the repo pins .NET 10.0.302 with `rollForward: disable`, Node 26.5.0, and needs Docker. Everything
above ran against the Linux mirror.

## 2. Backend verification

`dotnet test` — 271 passing, 0 failing, ~59 s. The backend integration suite calls `EnsureDeletedAsync` on
a shared database with parallelisation disabled assembly-wide, so only one run may execute at a time.

### Mutation-tested, not merely green

The automatic publication retry is the highest-risk change in this phase: it is the code path that could
roll a live restaurant's public site backwards. Three of its tests were verified to **fail when the
behaviour they assert is removed**:

| Mutation applied | Test that failed |
|---|---|
| `IsSuperseded` forced to `false` | stale failed publication retires as superseded and never rolls back the newer publication |
| Both retry-backoff gates removed | a freshly failed publication is not reclaimed until the backoff elapses |
| Both attempt-budget gates removed | permanent failures stop being reclaimed once the budget is exhausted |

Mutations were applied to the Linux mirror only, then reverted and checksum-verified. This is the evidence
that those tests assert behaviour rather than merely executing it.

The retry tests additionally ran 10× in isolation and the full suite 3× consecutively, because they enable
the background worker and are the most plausible source of flake in the suite.

### New backend coverage

- `PublicationRetryApiTests` — 5 tests: worker-driven recovery, the superseded guard, attempt exhaustion,
  backoff, and `PublicationDelay` gating. In their own file because they enable the worker, which
  `PostgresFixture` must keep disabled for the exact-`AttemptCount` assertions elsewhere.
- `ErrorContractApiTests` — 3 tests: every error body is problem+json with `code` and `correlationId` and
  no stack trace; a forced unhandled exception yields the generic 500; faults inside the tenant-media
  mount still produce a problem body.
- `AdminRestaurantApiTests` — website URL round-trip to the public contract with four rejection cases;
  duplicate special date as a field-level code rather than an opaque conflict.
- `MenuApiTests` — Brotli round-trip, and a plain client still receiving uncompressed JSON.
- `MediaStorageTests` — 8 cases for the responsive ladder, including no-upscale and source-byte reuse.
- `SlowQueryInterceptorTests` — 9 cases including the assertion that **a bound parameter value never
  reaches the log**.

## 3. Frontend verification

367 vitest tests across 40 files. New coverage includes `StateCard`, `AdminUnavailable`, `api-error`, both
404 pages, the root error boundary, `instrumentation`, both proxies, the vitals endpoint (10 tests), the
extracted `ConfirmDialog` / `FieldError` / `AdminNavLink` primitives, inline price editing, the dish
filter, the website field, the time-zone select, unsaved-changes guards, 401 session expiry, the gallery
drop zone and photo replace, and the server/client design boundary.

Two assertions worth naming because they encode rulings rather than mechanics:

- `DesignRendererBoundary.test.tsx` asserts no design renderer or leaf design carries `"use client"`,
  while `DesignMenuBrowser`, `DesignGallery` and the lightbox remain islands.
- `DesignMenuBrowser.test.tsx` proves memoization by asserting `formatPrice` call counts stay flat across
  three category switches, **and** that all dish headings stay in the DOM — the Phase 6 SEO ruling.

## 4. A pre-existing failure fixed in passing

`scripts/assert-design-assets.mjs` was **already failing before Phase 8 began**, on an untouched baseline
build: `Expected exactly one production chunk for quiet-title; found 2`.

Phase 8 also invalidated its premise. It asserted each design's markup lived in exactly one *client*
chunk — which assumes designs ship to the browser at all. After moving the renderers to the server, they
do not. The check was inverted to the stronger invariant: **no design marker in any client chunk, and
every marker present in the server build.** The old assertion would still pass if a design were
re-clientified into its own chunk; the new one will not.

A second latent defect surfaced while fixing it. The script grepped for raw colour values (`#0e0f0d` and
friends) as a proxy for "a design stylesheet got bundled". The admin design picker paints each design's
preview swatch with the same brand colours on purpose, so the check fired on `.designThumbnail_night` in
`admin.module.css` — **admin CSS, not design CSS**, and a false positive that said nothing about the
invariant. Raw colours were replaced with the design namespace prefixes (`nightfall-v1__`), which is the
actual invariant and cannot collide.

## 5. Performance measurements

| | Before | After | Change |
|---|---|---|---|
| Client chunks | 49 files | 27 | −22 |
| Client JS, raw | 1,177,938 B | 969,334 B | −17.7 % |
| Client JS, gzip | 375,618 B | 305,479 B | −18.7 % |
| Category switch (median of 10) | 46.3 ms* | 4.5 ms | −90 % |
| JS requests on `/menu` | 15 | 13 | −2 |
| Design markup in client bundle | 8 markers in 8 chunks | **0** | eliminated |

\* Measured against a build identical to the shipped one but with `React.memo` removed, to isolate that
one change. The pre-Phase-8 baseline measured 7.3 ms because it rendered a different (client-side) tree;
the honest statement is that memoization moves the switch from ~50 % of the 100 ms ceiling to ~5 %.

**How these were obtained, and the caveat that goes with them:** from a local production build plus a
standalone 30-category × 1,000-dish fixture driven in a browser — **not** from `npm run test:perf`, which
could not run. They inherit the disclaimer `scripts/perf-report.mjs` carries: *local production build; not
a staging or field measurement.*

## 6. The e2e fixtures were proven without a browser

The two new Playwright specs could not run, but the fixture backend they depend on **was** verified, by
driving it out-of-band over raw HTTP with no browser involved: 41 assertions covering sign-in and cookie
handling, all five admin reads, the price PATCH, dish creation with category recount, the regular-hours
and special-hours PUTs, a real multipart gallery upload, the profile PUT carrying `websiteUrl`, and
publication settling. The resulting public payload was then parsed by the **actual**
`lib/menu-contract.ts` parser and confirmed to carry every change.

This does not prove the specs pass. It proves that if they fail, the fixture is not the reason.

Two design decisions in the fixture are worth recording because they exist to prevent false confidence:

- **Fault hosts seed *armed*.** A spec that forgets to switch a fault on sees the failure, not a green
  pass.
- **The publication status deliberately alternates** `succeeded` / `processing` across saves while always
  applying the draft, mirroring the worker-versus-inline-dispatch race documented in `README.md` §5. Any
  spec asserting one exact immediate status fails immediately rather than flaking months later. The
  status endpoint still converges, so a polling consumer settles.

Six fault hosts were added, all independent of the existing one-shot `error.localhost`: hard 500, stall,
mid-response cutoff, malformed/empty body, 404-everything, and an owner portal whose section reads 500
while auth keeps answering. Two owner-portal instances run with separate state so neither disturbs the
`admin.localhost` fixture that existing specs mutate.

### Click budgets (PR-24 Task 12 proxy)

One press per click, one per typed character, plus the focus click before typing. Sign-in is excluded —
it is identical for every task. Each budget is the exact cost of the shortest path, so exceeding it means
a step was added.

| Task | Budget |
|---|---|
| Change a dish price | 16 |
| Add a menu item | 20 |
| Edit regular hours | 14 |
| Edit special hours | 24 |
| Upload a photo | 15 |
| Change contact information | 74 — dominated by four values that must be typed in full |

## 7. What was NOT verified

This section is the point of this document.

| Item | Status | Why |
|---|---|---|
| `e2e/errors.spec.ts` | **Written, never executed** | Playwright's browser needs system packages installed via password sudo, unavailable here |
| `e2e/admin-tasks.spec.ts` | **Written, never executed** | Same |
| `e2e/design.spec.ts`, `menu.spec.ts`, `seo.spec.ts` after Phase 8 edits | **Not re-run** | Same |
| `npm run test:perf` | **Never run end to end** | Needs Playwright plus the `large-menu.localhost` fixture stack |
| Lighthouse ≥ 90 (PR-23 Task 13) | **Configured, never executed** | Same |
| `.github/workflows/ci.yml` (PR-23 Task 15) | **Authored, never executed** | The repository has never had CI. Validated only by a real YAML parse — 3 jobs, 23 steps, all valid |
| PR-24 Task 12 success rate ≥ 95 % and satisfaction | **Not delivered** | Requires human participants. Not estimated, not fabricated. See `README.md` Ruling 6 |
| Production performance monitoring (PR-23 Task 14) | **Collection implemented, production behaviour unverified** | Requires a deployment |

To make the Playwright suites runnable on this machine:

```bash
sudo npx playwright install-deps
```

They should run unattended in CI, where `npx playwright install --with-deps chromium` has the privileges
this environment lacks.

### Most likely first-run failures

Recorded so whoever first runs these specs knows where to look, rather than assuming the specs are wrong:

1. **375 px overflow on the four admin editors.** No spec has ever asserted horizontal fit on them. The
   CSS collapses to one column at ≤48 rem so it should hold — but if it does not, **that is a real product
   finding, not a spec bug.**
2. **`cutoff.localhost`** depends on Node emitting `error` on the request or response when the socket dies
   after a declared `content-length`. Both listeners now exist; if neither fires the read never settles and
   the test times out instead of asserting.
3. **`app/error.tsx` catching a `generateMetadata` throw on `/`** is inferred from the equivalent case
   passing on `/menu` today. If Next routes to `global-error.tsx` instead — which shares the title but
   carries no link — the single-link assertion fails.
4. **Keyboard traversal** never relies on Tab wrapping, but if focus escapes the page the search could
   exhaust its press budget.
5. The photo walkthrough is verified **in the editor, not on the public page** — the public gallery is
   published empty on purpose so the run does not measure the image optimizer against a 1×1 fixture PNG.

## 8. Known issues carried forward

1. **Nothing enforces `force-dynamic` or the `node:http` transport on public routes.** A future refactor to
   `fetch` would silently reintroduce the Next Data Cache; on a `Host`-resolved multi-tenant app that is a
   tenant-isolation risk, not merely a staleness risk. A guard test is recommended.
2. **ASP.NET `OutputCache` on public endpoints was deliberately deferred**, for the same reason. It needs
   designing with the frontend caching story and tests of `TenantIsolationApiTests` rigour.
3. **Publication status on save is nondeterministic** when the worker is enabled — see `README.md` §5. The
   UI tolerates it; a future test asserting an exact immediate status would flake.
4. **Retry guards are duplicated** in the worker predicate and the dispatcher claim. A regression at one
   site alone is invisible to black-box testing.
5. **`SpecialDateDuplicate()` declares a dead 409.** The observable contract is 400; the literal misleads.
6. **Nothing prunes `publication_outbox` or superseded publications.** One row accrues per edit, forever.
7. **A never-published restaurant exposes its draft name and locale** through the pre-first-publication
   fallback.
8. **Photo replace is unavailable on a full 50-photo gallery** — the upload → delete → reorder sequence
   needs a free slot, and that order is deliberate so a failure never loses the original.
9. **`SSH.NET 2025.1.0`** in the test project carries a known high-severity advisory
   (GHSA-q939-rpr3-3284). Transitive, test-only, and unrelated to Phase 8 — tracked separately.
