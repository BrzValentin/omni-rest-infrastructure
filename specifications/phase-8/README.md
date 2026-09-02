# Phase 8 — Product Polish

**Status:** Implemented and verified. Backend **271/271** on Linux (242 before Phase 8); frontend **357
vitest tests across 39 files** (244 before), with lint, typecheck, `npm run build`, and
`scripts/assert-design-assets.mjs` all clean.

**Version:** 0.1

**Architecture dependency:** `specifications/architecture.md`, sections 10, 15, 17, 21, 22, 24

**Product scope:** PR-22 (Error Handling), PR-23 (Performance), PR-24 (Ease of Use), PR-25 (Content
Publishing)

## 1. Purpose

This package converts the Phase 8 product requirements into technical specifications and records what was
actually built.

- `error-handling.md` — the PR-22 Task 1 deliverable
- `performance-budget.md` — the PR-23 Task 1 deliverable, and the numeric budget
  `architecture.md` §17 deferred
- `content-management-ux.md` — the PR-24 Task 1 deliverable
- `content-publishing.md` — the PR-25 Task 1 deliverable
- `implementation-evidence.md` — what was verified, how, and what was not

## 2. Scope normalization

Phase 8 is titled "Product Polish", which implies a thin finishing pass over a finished product. The audit
that opened this phase found something different and worth stating plainly, because it changes how the
rest of this package should be read:

> **Most of Phase 8's 46 tasks were not Phase 8 work. They were unpaid debt from Phases 0–5, collected
> under one heading.**

The evidence for that claim is in §3. The consequence is that this specification is, more than any phase
before it, **an audit of what already held plus a record of debts settled** — not a description of new
product surface. The Phase 7 precedent governs:

> a later phase adapts to the shipped architecture, it does not fork it
> — `specifications/phase-7/README.md` §2

Following the Phase 7 precedent of recording rulings rather than making silent choices, the following
apply.

### Ruling 1 — This application has no search, and Phase 8 did not add one

Four requirements depend on a search feature: **PR-22 Task 6** ("empty search results"), **PR-23 Task 10**
(Search Performance), **PR-23 Task 11** (Infinite Scroll & Pagination), and **PR-23 Task 13**'s third
acceptance criterion ("Search page Lighthouse Performance ≥ 90").

Three independent audits confirmed the same thing: grepping `search` across `app/`, `components/`, `lib/`
and the whole API returns only `searchParams`, `nextUrl.search`, `window.location.search`, `parsed.search`
in URL validators, and one SEO help string. The complete public route table is `/`, `/menu`,
`/menu/[category]`, `/robots.txt`, `/sitemap.xml`, `/media/*`, `/api/v1/*`, plus `/admin/*`. Nothing
paginates. Nothing scrolls infinitely. The menu is one published snapshot rendered whole.

**These four requirements are recorded as not applicable.** Building a search feature inside a performance
PR would mean a polish phase shipping the largest new feature in Phase 8, and that decision belongs to the
product owner, not to PR-23. If search is wanted, it is a PR of its own.

Two consequences:

- **Lighthouse targets `/`, `/menu`, and `/menu/[category]`** — three genuinely distinct render paths with
  different payload shapes. Note there is no "restaurant page" separate from the homepage either: each
  restaurant is a tenant on its own host, so `app/page.tsx` **is** the restaurant page. Scoring `/menu`
  twice and labelling one of them "search" would be dishonest evidence.
- **PR-24 Task 2's "search menu items" was implemented**, because that one is an *admin* filter over data
  already loaded in the browser, not a public search feature. It is in `DishManager`, and it is what makes
  the "price updated in under 30 seconds" criterion reachable.

### Ruling 2 — PR-23 Task 11 would have reversed a shipped Phase 6 ruling, and was not applied

Beyond having no subject, Task 11's requirement to "avoid rendering all items simultaneously" is in direct
conflict with a decision Phase 6 already made deliberately:

- `app/menu/[category]/page.tsx` documents that every dish must be present in the markup so a crawler sees
  it.
- `DesignMenuBrowser` hides non-selected panels with `hidden` rather than unmounting them, on purpose.
- `e2e/menu.perf.spec.ts` **asserts** all 1,000 `h3` headings are present.

Phase 6 resolved the indexability-versus-DOM-size tension in favour of indexability. PR-23 does not
silently reverse it. The win that was available — and taken — is **hydration cost, not DOM count**: see
Ruling 5.

### Ruling 3 — Immediate publication and a configurable interval are one knob, not two systems

**PR-24 Task 11** requires "changes visible immediately after save". **PR-25 Task 5** requires a
configurable interval including "Every 15 minutes". Taken literally, both cannot hold at once.

`architecture.md` §10 already anticipated this and refuses to build two content systems:

> If the approved product behavior is "publish on save," the save workflow invokes the same publish
> command immediately. If manual publication is selected, save and publish remain separate actions. This
> avoids implementing two unrelated content systems.

**Resolution:** a `PublicationDelay` option, defaulting to `Immediate`. PR-24 Task 11 is an acceptance
criterion about behaviour; PR-25 Task 5 is a requirement about configurability. A knob whose default is
`Immediate` satisfies both texts literally — "no hardcoded timing values" is met by the knob existing, not
by the default being non-zero. A non-zero `PublicationDelay` **knowingly relaxes PR-24 Task 11**; the
shipped default does not. Details in `content-publishing.md`.

### Ruling 4 — The root error boundary keeps no navigation chrome

**PR-22 Tasks 5 and 8** require "navigation back to homepage" and that "navigation continues to work".
`app/error.tsx` carries a deliberate comment stating it has no header, no navigation, and no brand mark,
because when that boundary renders **the tenant is precisely what failed to resolve**, and the same file
also serves the owner portal. Wrapping it in `PublicShell` would reintroduce the multi-tenant branding
leak Phase 7's PR-20 removed.

**Resolution:** a single **unbranded** `<a href="/">`. Enough for a visitor to continue; not enough to
name or imply a tenant. `app/menu/error.tsx`, which renders only after a tenant resolved, does keep
`PublicShell`.

### Ruling 5 — "Server unavailable" is a state, not a route

**PR-22 Task 5** asks for a *page* for server-unavailable alongside 404 and application error. The App
Router has `not-found.tsx` and `error.tsx` and nothing else; a 503 is not a navigable URL. The shipped
precedent is explicit that a transient fault must surface as a 5xx through the error boundary and never as
a 404 — `lib/public-data.ts` says so in a comment citing
`specifications/phase-6/page-indexing-classification.md` §5, and `e2e/menu.spec.ts` asserts it.

**Resolution:** an `unavailable` **variant** of the shared `StateCard`, rendered by the existing
boundaries. Introducing a `/503` route would fork the Phase 6 ruling.

### Ruling 6 — PR-24 Task 12 cannot be executed as written, and the numbers were not fabricated

Task 12 requires human participants, a measured completion rate, error counts, subjective satisfaction,
and "Success rate ≥95%". No agent can recruit users or measure satisfaction.

**What was delivered instead:** `e2e/admin-tasks.spec.ts` — six scripted task walkthroughs, each from a
cold login with no prior instruction, asserting mechanically a click/keystroke budget (the executable
proxy for "time to complete" and "minimize number of clicks"), that every step is reachable by visible
label alone with no documentation, zero console errors and zero failed requests (the proxy for "number of
errors"), and that the change reaches the public page in the same run. Plus a keyboard-only pass and a
375 px pass, since Task 1 requires mobile-friendliness and large touch targets.

**What was not delivered:** the ≥95 % success rate and the user-satisfaction target. Those require a human
study. They are recorded as outstanding, not estimated.

### Ruling 7 — PR-23 Task 15 is authored but unproven

The requirement is that performance checks run in CI and that builds fail when thresholds are exceeded.
**This repository had no CI system of any kind** — no `.github/`, no pipelines — although it does have a
GitHub remote.

`.github/workflows/ci.yml` and the perf/bundle gates were authored, and `scripts/perf-report.mjs` was
converted from a reporter into a gate that exits non-zero. But **the workflow has never executed**. Its
first real run will be the next push, and it may need adjustment. This is recorded as authored-not-proven
rather than presented as a passing gate. See `implementation-evidence.md`.

### Ruling 8 — PR-25 was largely already built, and was not rebuilt

A cold reading of PR-25's ten tasks ("create a queue", "implement a background publisher", "content status
management") describes almost exactly what Phase 3 shipped. Five of its ten tasks were already complete
before Phase 8 began. The identified risk was **over-implementation**: an agent taking the tasks at face
value would have added per-entity status columns and produced a second parallel pipeline.

Nothing was rebuilt. See `content-publishing.md` for the entity-coverage proof and the narrow set of
genuine gaps that were closed.

## 3. Where Phase 8's work actually belonged

The table below is the audit finding behind §2's opening claim. It maps each debt closed in Phase 8 to the
phase that should have carried it.

| Should have shipped in | Debt closed in Phase 8 | PR |
|---|---|---|
| Phase 0/1 (architecture, quality) | Numeric performance budget — `architecture.md` §17 explicitly deferred it to a "Phase 0 quality specification" that was never written | 23 |
| Phase 0/1 | CI of any kind — `architecture.md` §22 specifies CI/CD; none existed | 23 |
| Phase 0/1 | Lighthouse, Core Web Vitals collection | 23 |
| Phase 0/1 | `global-error.tsx`, `instrumentation.ts`, `error.digest` correlation | 22 |
| Phase 0/1 | A written error-handling strategy | 22 |
| Phase 1 | Restaurant `WebsiteUrl` — the column did not exist at all | 24 |
| Phase 2 | API response compression — the full menu snapshot crossed the wire uncompressed | 23 |
| Phase 2 | `response.on("error")` in the public menu reader | 22 |
| Phase 3 | Automatic retry of failed publications; `failed` was terminal to the worker | 25 |
| Phase 3 | Publication start/success/duration logging | 25 |
| Phase 3 | `PublicationDispatcher` configuration block; every value was a code default | 25 |
| Phase 3 | Client-side session-expiry (401) handling | 24 |
| Phase 3 | Retry and "service unavailable" states on the six admin pages | 22 |
| Phase 3 | Timeouts on browser fetches — there were none anywhere | 22 |
| Phase 3 | Slow-request and slow-query logging | 23 |
| Phase 3 | Field-level duplicate-date guard for special hours | 24 |
| Phase 4 | Wiring the dish price endpoint, which shipped fully tested but was never called by the UI | 24 |
| Phase 4 | Admin dish filter | 24 |
| Phase 5 | Design renderers marked `"use client"`, dragging the whole public tree into the browser bundle | 23 |
| Phase 5 | Gallery bypassing the image optimizer; no responsive variants generated on upload | 23 |
| Phase 5 | Lazy lightbox; cache headers on design stylesheets | 23 |
| Phase 5 | Drag-and-drop upload and photo replace | 24 |
| Phase 5 | A 503 rendered to the owner as "this design does not exist" | 22 |
| Phase 6/7 | `response.on("error")` in both proxies | 22 |

Genuinely new Phase 8 work is the remainder: the specification documents in this package, the CI gates,
and the two new e2e suites.

## 4. What was already true before Phase 8

Recorded so the specification is not mistaken for a description of new work.

- **PR-24 Tasks 3, 4, 5 and 11 were already complete.** Regular hours and special hours ship end to end —
  endpoints, overnight and overlap validation, a full editor with copy-to-weekdays, special hours
  overriding regular hours in the computed public status, and rendering in all five designs. The opening
  hypothesis that hours were the biggest gap was wrong.
- **PR-25 Tasks 2, 3, 4, 6 and 7 were already complete**, including atomic publish with rollback, verified
  by pre-existing tests.
- **Every editable entity already flowed through the publication pipeline.** `IRestaurantManagementService`,
  `IMenuManagementService` and `IGalleryManagementService` are three interfaces on one partial class
  registered as a single scoped instance, so menus, dishes and gallery were never bypassing publishing.
- **The backend already had a consistent `ProblemDetails` contract** with `code` and `correlationId`
  injected on every problem, and 46 of 50 error sites already routing through one `ApiProblems` factory.
- **The public read path already had no N+1 risk** — one `AsNoTracking` projection against a published
  snapshot — and a version-keyed cache whose invalidation is structural.
- **Every admin mutation was already audited.** No unaudited mutation was found.

## 5. Two hazards this phase surfaced

Recorded because both are invisible in normal operation and expensive to rediscover.

1. **A caching bug on a public route is a tenant-isolation bug.** Every public page is `force-dynamic`
   because tenancy resolves from the `Host` header. Any Next-level output caching must be host-keyed;
   getting it wrong serves one restaurant's page under another restaurant's domain — the exact failure
   `lib/public-data.ts` and the API proxy were written to prevent. **Nothing currently enforces
   `force-dynamic`**, and a future refactor of the data layer to `fetch` would silently introduce the Next
   Data Cache. A guard test is recommended and is recorded as outstanding.
   For this reason ASP.NET `OutputCache` on the public endpoints was **deliberately deferred** rather than
   added opportunistically: it needs designing together with the frontend caching story and tests of the
   same rigour as `TenantIsolationApiTests`.

2. **With the outbox worker enabled, the publication status a save reports is nondeterministic.** The
   worker can claim a freshly committed `pending` row before the inline post-commit dispatch reaches it;
   the dispatcher then claims zero rows and returns, so the mutation response can report `processing`
   rather than `succeeded`. This is not a data-integrity problem, and the owner UI already tolerates it
   (both surfaces treat `processing` as in-flight and poll through it). It is a trap for any future test
   that asserts an exact status on the save response.
