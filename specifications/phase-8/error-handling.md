# Phase 8 — Error Handling Strategy

**Requirement:** PR-22 Task 1. **Status:** Implemented.

This is the unified error-handling contract for backend and frontend. It documents the categories, the
user-facing message for each, and the logging disposition of each — including what must never be logged.

## 1. Principles

1. **A visitor never sees a technical artefact.** No stack trace, no exception message, no HTTP status
   number, no error code, no correlation id. Asserted by `ErrorContractApiTests` on the API side and by
   `app/menu/error.test.tsx` on the client side.
2. **An owner sees what they can act on.** Field-level validation names the field. A failed save says the
   entries are preserved. An expired session says to sign in again. None of these use technical
   vocabulary.
3. **Empty is not broken.** A successful request returning nothing renders a distinct state from a request
   that failed. See §5.
4. **A transient fault never masquerades as absence.** A 503 must not render as a 404. This is load-bearing
   for SEO — `specifications/phase-6/page-indexing-classification.md` §5 — and it is why PR-22 Task 5's
   "server unavailable page" became a state rather than a route (`README.md` Ruling 5).
5. **Every unexpected failure is correlatable.** A response carries a `correlationId`; the client logs
   `error.digest`; the two can be joined without either being shown to the user.

## 2. Categories

The frontend vocabulary is `ApiFailureKind` in `src/frontend/lib/api-error.ts`. It is deliberately about
*what the reader should do next*, not about what the transport returned — a 404 and a 500 lead to
different dead ends, and the kind is what lets a component choose between retry, sign in again, and give
up.

| Kind | Arises from | User-facing message | Retry offered | Logged |
|---|---|---|---|---|
| `network` | No response at all (status sentinel `0`) | "Check your connection" / temporarily unavailable | Yes | Client only, no payload |
| `timeout` | 408, 504, or an `AbortSignal.timeout()` firing | Temporarily unavailable | Yes | Yes, with route + duration |
| `notFound` | 404 | "Page not found" — distinct copy from "no restaurant at this address" | No | No (expected) |
| `validation` | 400, 409, 422 | Field-level messages; entries preserved | Not applicable — the user edits and resubmits | No (expected) |
| `denied` | 401, 403 | 401: "Your session ended — sign in again". 403: generic | 401 offers sign-in, not retry | Yes, as a security audit event |
| `server` | ≥500 | Temporarily unavailable | Yes | Yes, with `correlationId` |
| `unexpected` | Anything unclassified | Generic error copy | Yes | Yes |

Two decisions worth stating because they are not obvious:

- **`409` is classified as `validation`, not as its own conflict category.** Every conflict this
  application produces is a stale-ETag write that the owner resolves by reloading and re-entering — the
  same shape as a rejected field, so it takes the same UI path.
- **`401` and `403` share the `denied` kind but not the treatment.** A 401 is recoverable by the user
  (sign in again, form contents preserved); a 403 is not. Offering "retry" on either would be a lie.

## 3. The API error contract

Every error response is `application/problem+json` and carries:

- `status`, `title`, `type` (`https://omni-rest.example/problems/{code}`)
- **`code`** — a stable machine-readable string. The frontend maps codes to copy; it never renders the
  code.
- **`correlationId`** — `HttpContext.TraceIdentifier`, for joining a user report to a log line.
- `errors` — for validation only, a field → codes dictionary.

Injected centrally in `Program.cs` via `AddProblemDetails` + `CustomizeProblemDetails`, so no endpoint can
opt out. `ApiProblems.Problem(...)` and `ApiProblems.Validation(...)` are the only sanctioned factories.

**Never present in an error body:** `stackTrace`, `exception`, inner exception text, connection strings,
SQL, file paths. `ErrorContractApiTests` asserts their absence across the error surface, and asserts that a
forced unhandled exception still yields the generic 500 problem with no leaked detail.

**Status conventions** (from `architecture.md` §15, unchanged by this phase): `401` unauthenticated, `403`
authenticated-but-unauthorized. Cross-tenant resource access answers **404, not 403** — Phase 7 Ruling 4 —
because a 403 there turns every admin endpoint into an existence oracle for other tenants' identifiers.

## 4. Boundaries and components

| Surface | Component | Notes |
|---|---|---|
| Root application error | `app/error.tsx` | **No nav, no brand mark** — see `README.md` Ruling 4. One unbranded link home. |
| Root layout failure | `app/global-error.tsx` | Renders its own `<html>`/`<body>`, inline styles only, names no tenant. |
| Menu route error | `app/menu/error.tsx` | Keeps `PublicShell`; the tenant already resolved. |
| 404 (any path) | `app/not-found.tsx` | Own copy. Previously borrowed the "no restaurant at this address" text, so a mistyped page on a healthy restaurant claimed the restaurant did not exist. |
| 404 (no such restaurant) | `app/menu/not-found.tsx` | The genuine unknown-tenant case. |
| Shared presentation | `components/state/StateCard.tsx` | Four variants: `notFound`, `error`, `unavailable`, `empty`. Owns retry de-duplication and the pending label. |
| Owner portal | `components/admin/AdminUnavailable.tsx` | Distinguishes outage from not-yet-configured; offers retry. |

All user-facing strings live in `src/frontend/lib/menu-messages.ts`. None are inline.

**Retry semantics.** Retry is de-duplicated by a ref guard so a double click cannot fire two requests, and
the control shows a pending label while in flight. Retry is offered only where it can help: `network`,
`timeout`, `server`, `unexpected`. It is not offered for `notFound` or `denied`.

## 5. Empty state versus error state

Three outcomes must be visually and semantically distinct:

| Outcome | Treatment |
|---|---|
| Loading | Loading affordance; layout preserved |
| Success with no data | `empty` variant — explains why there is nothing here |
| Failure | `error` / `unavailable` variant — explains that something went wrong, offers retry |

The public side already satisfied this before Phase 8 (per-design empty cards, empty category, empty
gallery). Phase 8 fixed the **owner portal**, where all six pages tested only `!result.data` and rendered
the same dead end for both an outage and an unconfigured section, and fixed the design preview, where any
non-200 collapsed into `notFound()` so a transient 503 told the owner the design did not exist.

Note the two sub-requirements of PR-22 Task 6 that describe a product that does not exist — "empty
restaurants" and "empty search results" — are covered by `README.md` Ruling 1.

## 6. Logging policy

### What is logged

| Event | Where | Contents |
|---|---|---|
| Any response ≥500 | `CustomizeProblemDetails` | `correlationId`, method, path, status |
| Unhandled server-render / route-handler fault | `instrumentation.ts` `onRequestError` | timestamp, route, method, digest, error type |
| Client boundary render | `app/error.tsx`, `app/menu/error.tsx` | `error.digest` only, once on mount |
| Publication lifecycle | publication dispatcher | operation id, restaurant id, draft version, attempt, elapsed ms, outcome |
| Slow request / slow query | request timing middleware, `SlowQueryInterceptor` | route or command shape, duration, threshold |
| Authorization denial | `SecurityAuditLog` | actor, requested vs entitled, endpoint, remote address, timestamp |

### What must never be logged

- Cookies, session tokens, CSRF tokens, credentials
- Request bodies
- The `Host` header or any tenant-identifying value in frontend logs
- SQL **parameter values** — the interceptor logs command shape and duration only, and there is a test
  asserting a bound value never reaches the log
- Full URLs with query strings, in the vitals endpoint
- Personal data of any kind: names, phone numbers, email addresses

`error.digest` is the only correlator carried to the client. The visitor never sees it; it is logged so a
user report can be joined to a server line.

### Performance

Logging is structured and threshold-gated. Slow-query and slow-request logging emit only above a
configured threshold (`PerformanceLogging` in `appsettings.json`) and are disabled entirely by a
non-positive threshold.

## 7. Verification

- `ErrorContractApiTests` — every error body is problem+json with `code` and `correlationId` and no stack
  trace; a forced unhandled exception yields the generic 500; faults inside the tenant-media mount still
  produce a problem body.
- Colocated vitest suites for `StateCard`, `AdminUnavailable`, `api-error`, both 404 pages, the root error
  boundary, `instrumentation`, and the two proxies.
- `e2e/errors.spec.ts` — the scenario matrix (hard 500, timeout, connection lost mid-response, empty and
  malformed bodies, invalid endpoint, admin outage), each asserting message, layout stability, retry, and
  recovery after the fixture is restored. **Not executed in this environment** — see
  `implementation-evidence.md`.

## 8. Outstanding

- The e2e error matrix has never run; Playwright cannot execute here.
- No guard prevents a future refactor from removing `force-dynamic` or moving the readers to `fetch`,
  which would reintroduce caching and, on a public route, a tenant-isolation risk. See `README.md` §5.
