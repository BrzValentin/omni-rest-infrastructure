# Phase 9 — Implementation Evidence

What was built, how it was verified, and — with equal weight — **what was not verified and why**. §5 is
the point of this document.

## 1. Test baselines

| Suite | Before Phase 9 | After | Where |
| --- | ---: | ---: | --- |
| Backend (xUnit, Linux) | 271 | **294** | `src/backend/OmniRest.Api.Tests` |
| Frontend (vitest) | 357 across 39 files | **456 across 44 files** | `src/frontend` |
| Playwright specs | — | +7 (authored, not executed) | `src/frontend/e2e/qr-code.spec.ts` |

`npm run lint` (`--max-warnings=0`), `npm run typecheck`, `npm run build`, and
`scripts/assert-design-assets.mjs` are all clean. Backend built `--configuration Release` with 0 warnings.

## 2. Backend verification

23 new tests, all executed against the real stack — the integration cases run on PostgreSQL 18 in
Testcontainers, not a stub.

- `Unit/RestaurantPublicAddressTests.cs` — 20 cases on the precedence rule: shortest-domain preference,
  ordinal tie-break, custom domain beating a configured slug, slug fallback, base domains written with
  leading or trailing dots, a base domain that normalises away being skipped rather than taken literally,
  null and whitespace domain rows, case normalisation, and both no-address paths.
- `Integration/AdminPublicAddressApiTests.cs` — 3 cases: anonymous `401`; **two owners of two seeded
  restaurants each reading their own host and never the other's**; and the slug fallback under an
  overridden `PublicMenu:PlatformBaseDomains`.

The two-tenant case is the PR-26 Task 6 requirement and the one worth naming:
`EachOwnerReadsTheirOwnPublicHostAndAnonymousCallersAreRefused`.

## 3. Frontend verification

99 new vitest tests. Three of them are worth calling out because they were written to catch things that
would otherwise pass:

- **`lib/qr-png.test.ts` verifies chunk CRCs against Node's own `zlib.crc32`**, not against a second copy
  of the lookup table it is testing. A shared-table test proves only that a function agrees with itself.
- **`lib/qr-code.test.ts` counts emitted dark modules against the matrix itself**, so a run-merge that
  silently dropped modules cannot pass by producing well-formed path syntax.
- **`lib/qr-file-name.test.ts` asserts a restaurant name can never emit a path separator or a `"`.** The
  stem is interpolated into `Content-Disposition: attachment; filename="…"`, so a surviving quote would
  let a restaurant name rewrite a response header.

### An independent decode round-trip

Structural tests prove the PNG is well-formed; they do not prove it **scans**. That gap was closed
out-of-tree, because closing it in-tree would have meant adding a QR decoder and a PNG parser as
devDependencies for one assertion — against the dependency posture of Ruling 3.

Method, reproducible: install `pngjs` and `jsqr` in a scratch directory outside the repo, import
`lib/qr-code.ts`, `lib/qr-png.ts` and `lib/public-menu-url.ts` directly, then for each case generate the
PNG, parse it with `pngjs`, and decode it with `jsqr`.

| Case | Modules | Output | Decoded back to the input |
| --- | ---: | --- | --- |
| Production apex domain | 37 | 1036×1036 | yes |
| Platform slug subdomain | 37 | 1036×1036 | yes |
| Development host with port | 37 | 1036×1036 | yes |
| Long domain (higher symbol version) | 45 | 1035×1035 | yes |
| Uppercase host, normalised | 37 | 1036×1036 | yes |

This exercises the whole chain — `publicMenuUrl` → `encodeQr` → `qrToPng` → a real PNG parser → a real QR
decoder — and confirms the scheme split (`.localhost` → `http`, a real domain → `https`) and the port
reattachment along the way. **It is not part of the test suite and will not run in CI.**

### Two defects found by this verification, both fixed

1. **A test fixture, not the renderer.** Three `qrToPathData` cases failed and looked like a run-flush bug
   at the right edge of the matrix. The renderer was correct; `matrixOf` was declaring
   `size: rows.length` for oblong pictures, so a 1×4 fixture claimed to be 1×1. `matrixOf` now rejects a
   non-square picture outright. The case it guards is genuinely latent: a real symbol always ends in four
   quiet-zone columns, so a right-edge flush bug would never appear on real input, and only a synthetic
   square fixture can catch it.
2. **`qrToPng` returned `Uint8Array<ArrayBufferLike>`**, which also admits a `SharedArrayBuffer` and is
   therefore not assignable to `BodyInit` — the function could not be put into a `Response` at all. Fixed
   at the source by narrowing the return type rather than casting at the call site.

### The client bundle is untouched

Ruling 5 claims no QR code reaches the browser. Verified, not assumed: after `npm run build`, grepping
every file under `.next/static` for `uqr`, `maskPattern` and `qrToPathData` returns nothing.
`scripts/assert-design-assets.mjs` passes, and total client JavaScript stays comfortably inside the
Phase 8 gzip budget.

## 4. The QR surfaces were proven without a browser

Playwright cannot run on this machine (§5), so the Phase 8 precedent was followed: *"The e2e fixtures were
proven without a browser."*

A scratch script boots `e2e/api-proxy.mjs` and a real `npm run build` + `npm run start`, then drives the
three surfaces over plain HTTP with an explicit `Host` header. **All 18 checks passed.**

| Check | Result |
| --- | --- |
| Owner signs in on `qr.localhost`; page renders "Your menu QR code" | `200` |
| **Encoded URL is `http://menu.localhost:3000/menu`** | the public origin, port included |
| **Encoded URL does not contain `qr.localhost`** | the load-bearing claim, against a running server |
| `<svg role="img">` with real merged path data in the server HTML | present |
| Both download links present | present |
| `qr.svg` | `200`, `image/svg+xml; charset=utf-8`, `attachment; filename="corner-cafe-menu-qr.svg"` |
| `qr.png` | `200`, `image/png`, 999 bytes carrying the PNG signature |
| Second tenant's code | `http://bistro.localhost:3000/menu` — neither tenant names the other |
| Tenant with no public address | explanatory copy, no `<svg>`, download `404` |
| Anonymous `qr.svg` | `401` |

One trap worth recording for whoever repeats this: **`Host` is a forbidden header name for `fetch`**, and
undici drops it silently rather than erroring. Every request then arrives as `127.0.0.1`, resolves to no
tenant, and falls through to the real backend — which presents as a confusing `502 ECONNREFUSED` from the
fixture. The script uses `node:http` instead. Tenancy in this application is entirely a function of the
`Host` header, so any tool that cannot set it cannot test this application.

## 5. What was NOT verified

This section is the point of this document.

| Item | Status | Why |
| --- | --- | --- |
| `e2e/qr-code.spec.ts` (7 tests) | **Written, never executed** | Chromium is installed, but 27 system packages (`libnss3`, `libasound2t64`, fonts…) are missing and `playwright install-deps` needs password sudo, which is not available to this session. Unchanged from Phase 8. |
| Scan-to-menu with no redirect (Task 4) | **Written, never executed** | It is the one check that needs the real .NET backend serving `menu.localhost`; the browserless run deliberately omitted the backend. The assertion exists in the spec. |
| Real-device scan (Task 7) | **Not delivered** | No physical phone scanned a printed code. Requires a printer and a handset. Not estimated, not fabricated. |
| Mobile Safari / Chrome cookie-less load (Task 1) | **Partly** | The `webkit` and `chromium-minimum` Playwright projects cover the engines at mobile viewports, and those projects have never run either. |
| Scan-to-menu timing (Task 4) | **Not separately measured** | Task 4 defers to the PR-23 budget. `/menu` is already in that budget and in `lighthouserc.json`; nothing about scanning changes how the page loads. `perf-report.mjs` remains the gate and still has never run in CI. |
| Print legibility at table-tent size | **Reasoned, not measured** | 300 DPI is declared in `pHYs` and ~1000 px is ~85 mm, comfortably above the ~20 mm a phone needs at arm's length. No code was physically printed and measured. |
| Lighthouse | **Not applicable** | `/admin/qr-code` is `noindex` owner surface and is deliberately not in `lighthouserc.json`. |

### Most likely first-run failures

For whoever runs the e2e suite first:

1. **The three new fixture hosts must resolve.** `qr.localhost`, `qr-second.localhost` and
   `qr-unaddressed.localhost` rely on `*.localhost` resolving to loopback. Where it does not, every QR
   test fails at `page.goto`, not at an assertion.
2. **`bistro.localhost` is named as a public address but is deliberately not served** by the fixture. Only
   the first tenant's `menu.localhost` is a real menu. A test that tries to *scan* the second tenant's URL
   will fail; only the first tenant's scan case is meant to resolve.
3. **The suite adds three sign-ins per run.** The harness raises the account limit to 20 per minute and
   Phase 8 already recorded the suite sitting near that ceiling. If sign-ins begin failing with
   `auth_rate_limited`, this phase is the most recent thing to have added any.
4. **`OMNI_REST_PUBLIC_PORT` must reach `next start`.** Playwright merges `webServer.env` over
   `process.env`, so the existing inline `OMNI_REST_API_BASE_URL` prefix and the new `env` block coexist.
   If the port is lost, every URL equality assertion fails by exactly `:3000`.

## 6. Known issues carried forward

1. **The e2e job is still `continue-on-error` in CI.** Phase 8 set that deliberately and wrote "remove it
   as soon as the suite is green". It has not been removed, so **the Phase 9 e2e assertions cannot fail a
   build** even once they run. Stated plainly rather than implied.
2. **No CI change was needed and none was made.** `npm run test` and `dotnet test` glob; `npm ci` uses the
   lockfile. The new `lib/*.ts` files enter the vitest coverage `include` and clear the 80/80/75/80
   thresholds.
3. **`PlatformBaseDomains` is still absent from `appsettings.json`.** On a default deployment the slug
   fallback never fires, so only a `restaurant_domains` row produces a QR code. Pre-existing resolver
   behaviour, but it decides what an owner sees on this page.
4. **The seeded fixture tenants have one domain each**, so the shortest-host tie-break is covered only by
   unit tests, never by an integration test against real rows.
