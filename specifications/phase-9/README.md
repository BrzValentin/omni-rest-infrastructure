# Phase 9 — QR Code Menu Access

**Status:** Implemented. Backend **294/294** on Linux (271 before Phase 9); frontend **456 vitest tests
across 44 files** (357 across 39 before), with lint, typecheck, `npm run build`, and
`scripts/assert-design-assets.mjs` clean. The e2e suite is authored but has never executed here — see
`implementation-evidence.md` §5, which is the point of that document.

**Version:** 0.1

**Architecture dependency:** `specifications/architecture.md`, sections 8, 15, 16, 17, 19, 21

**Product scope:** PR-26 (QR Code Menu Access) — the whole of Phase 9

## 1. Purpose

This package converts the Phase 9 product requirement into a technical specification and records what was
actually built.

- `qr-code-menu-access.md` — the PR-26 specification
- `implementation-evidence.md` — what was verified, how, and what was not

## 2. Scope normalization

PR-26 is the only requirement in Phase 9, and it is unusual in the requirement set: **it was written to be
read twice.** Its own status section says so.

> **Planned for a future phase.** This PR is not part of the MVP build order. It exists now so that
> Phase 1–2 (and later phases) do not make architectural choices that would block it. Tasks 1 and 5
> describe foundation behavior that must already hold true during current development; Tasks 2–4 and 6–8
> describe the feature work to be scheduled later.
> — `requirments/Phase 9/Phase_9_PR-26_QR_Code_Menu_Access.md`

Phase 9 is that later phase. So the eight tasks split cleanly in two, and this package treats them
differently on purpose:

| Tasks | Nature | Treatment in Phase 9 |
| --- | --- | --- |
| 1, 5 | Foundation constraints that had to hold from Phase 1 onward | **Audited, not built.** §3 records the evidence. |
| 2, 3, 4, 6, 7 | The feature itself | Built. Specified in `qr-code-menu-access.md`. |

The Phase 7 precedent governs, as it did in Phase 8:

> a later phase adapts to the shipped architecture, it does not fork it
> — `specifications/phase-7/README.md` §2

Following that precedent of recording rulings rather than making silent choices, the following apply.

### Ruling 1 — The QR target comes from the backend, never from the portal's own request host

This is the finding that shaped the whole phase, and it is worth stating at length because the wrong
implementation is the obvious one and it fails silently.

The frontend already owns URL construction. `lib/site-origin.ts` builds a tenant origin from the incoming
`Host` header, `lib/seo.ts` wraps it, and every canonical URL, sitemap entry and Schema.org `url` the
platform emits comes from there. The obvious way to build a QR page is therefore
`await absoluteUrl("/menu")`.

**That would encode the wrong address.** The owner portal is not guaranteed to be served on the tenant's
public host:

- Owner endpoints bind their restaurant from the signed-in **membership**, not from the request host
  (`src/backend/OmniRest.Api/Security/OwnerSecurity.cs`, `IOwnerRestaurantContext.ResolveAsync`). Compare
  the public path, which resolves from the host (`Infrastructure/RestaurantContext.cs`).
- The Playwright fixtures already exercise the split: sign-in happens on `admin.localhost` while the
  public site is `menu.localhost`. `e2e/design.spec.ts` carries a comment about a CI failure caused by
  exactly this confusion.

A QR code is the least forgiving surface in the product for this class of bug. A wrong canonical tag is
fixed by a deploy; a wrong QR code has already been printed, laminated, and glued to two hundred tables.

**Resolution:** a new owner-authenticated read, `GET /api/v1/admin/restaurant/public-address`, returns the
host the *public* reaches this restaurant on. `lib/public-menu-url.ts` composes the URL from that host,
reusing the existing host and scheme rules rather than duplicating them. `lib/seo.ts` is never consulted
on this page. See `qr-code-menu-access.md` §2.

### Ruling 2 — Tasks 1 and 5 are audited, not built

Both foundation tasks were already satisfied, and one of them was satisfied *deliberately and in writing*
two phases earlier:

> The menu page's canonical URL stays constant across content/publication changes and requires no session
> or query state to resolve, so it can double as a future QR-code target (Phase 9, PR-26) without a
> URL-scheme change.
> — `specifications/architecture.md` §16

Nothing in `app/menu/` was changed by this phase. §3 records the evidence line by line. Rebuilding
satisfied requirements to make a phase look substantial would be the opposite of the Phase 8 finding.

### Ruling 3 — `uqr` is added as the first runtime dependency since Phase 0

The frontend had exactly four runtime dependencies — `next`, `react`, `react-dom`, `server-only` — every
version pinned exact, with an `overrides` block forcing transitive versions. That is a deliberate posture,
not an accident, and adding to it needs a reason.

QR encoding is a specified binary format with Reed–Solomon error correction over GF(256). It is not
something to improvise inside a feature phase, and a subtly wrong encoder produces codes that scan on the
developer's phone and fail on a customer's.

The `architecture.md` §17 precedent for a "do we add this?" decision is Redis: *not a Phase 0 dependency;
may be added when measured need justifies it.* The need here is direct.

**Resolution:** `uqr@0.1.3` (MIT, unjs), pinned exact. It was chosen over the more popular `qrcode`
specifically on supply-chain grounds: it has **zero transitive dependencies** and adds **nine lines** to
`package-lock.json`, where `qrcode` pulls `pngjs`, `dijkstrajs`, and `yargs` — a CLI argument parser
present only for a binary this application never runs.

It stays on the server. See Ruling 5.

### Ruling 4 — Multiple custom domains resolve by shortest host, with no new migration

`restaurant_domains` allows a restaurant several hosts and has **no primary-domain flag and no ordering
column**. Something has to choose which one gets printed, and "whatever the database returned first" is
not a rule.

**Resolution:** shortest host wins, ties broken by ordinal comparison. Shortest prefers the apex
(`prairietable.com`) over a `www.` or regional prefix, which is the name worth putting on a table tent;
ordinal makes the residual choice stable rather than arbitrary. This is deliberately **not** a schema
change: adding an `is_primary` column would be the correct fix for a restaurant that actively wants a
different one, but no requirement asks for that, and inventing owner-facing domain management inside a QR
phase would repeat the mistake Phase 8's Ruling 1 declined to make. The unit tests pin the ordering, and
the doc comment on `RestaurantPublicAddresses.Resolve` records that a flag is the upgrade path.

### Ruling 5 — Nothing about this feature reaches the browser

The QR page could reasonably have been a client component that generates the code and builds downloads
from `Blob` URLs. It is not.

The code is a static picture of a string the server already knows, so there is nothing for the browser to
do. The page is a server component with no client island, and both downloads are plain links to route
handlers that render on the server. This keeps `uqr` and both renderers out of the client bundle entirely
— verified: grepping the built client chunks for `uqr`, `maskPattern` and `qrToPathData` returns nothing —
so the Phase 8 client-JavaScript budget and the `assert-design-assets` invariant are untouched by Phase 9.

It also means the downloads work with the keyboard, the context menu, and "save link as", which `Blob`
URLs handle poorly.

### Ruling 6 — The PNG is encoded in-repo rather than by adding a rasterizer

Task 3 requires a high-resolution raster download. Rasterizing an SVG would mean a second, much heavier
dependency (`sharp` is present only as a transitive of Next's image optimizer and is not ours to import).

A QR code is a 1-bit bitmap, which is the one case where writing a PNG encoder is genuinely small:
`lib/qr-png.ts` emits bit-depth-1 greyscale with `deflateSync` from `node:zlib`, a stdlib module. It also
declares a `pHYs` chunk at 300 DPI, so the file carries a real print density instead of defaulting to 72 —
a printed QR that silently scales to 72 DPI is the exact failure this feature dies on.

Its tests verify chunk CRCs against Node's own `zlib.crc32` rather than a second copy of the lookup table,
so the two implementations check each other.

### Ruling 7 — No tracking parameter on the encoded URL

An obvious product request is `?src=qr` to measure scans. It is not implemented, and it should not be
added without a ruling that supersedes this one.

Every URL this platform emits is parameter-free by contract (`architecture.md` §16 and the Phase 6
ruling 10), and `absoluteUrlFrom` enforces it by stripping query and fragment. `e2e/seo.spec.ts` already
asserts that `/menu?ref=qr&sort=price&page=2` still emits the bare canonical — a test written before this
phase existed, anticipating exactly this. Scan measurement belongs in analytics on the menu page, not in
the printed URL.

### Ruling 8 — The print-ready template is not built

Task 3 offers a print-ready template — a table tent or sticker layout — and marks it explicitly as
*"nice-to-have, not required for MVP of this PR."* It is not built. Phase 9 ships the SVG and PNG the
acceptance criteria require, plus owner-facing guidance on printing them (`/admin/qr-code`, "Getting a
good print"). Recorded as scoped out, not as delivered.

## 3. What was already true before Phase 9

Tasks 1 and 5 in full, with the evidence. **No file under `app/menu/` was modified by this phase.**

| Requirement | Status | Evidence |
| --- | --- | --- |
| Menu has its own route, distinct from the home page | Already satisfied | `app/menu/page.tsx`; `app/sitemap.ts` lists `${origin}/menu` unconditionally |
| Renders correctly on a direct deep link | Already satisfied | `e2e/menu.spec.ts` deep-links `menu.localhost:3000/menu#desserts` in a **JavaScript-disabled** context and asserts every category heading is in the server HTML |
| No login, session, or prior navigation state | Already satisfied | `lib/menu-api.ts` sends exactly `{ Accept, Host }` on the menu read — the render path never reads or forwards a cookie, unlike the home page path, which does. `PublicMenuEndpoints.cs` is `.AllowAnonymous()`. `proxy.ts` matches only `/admin/:path*` |
| Server-rendered, so it loads on first hit from a camera app | Already satisfied | `export const dynamic = "force-dynamic"` plus an async server component; `MenuDesignRenderer` is a server component by deliberate Phase 8 change; `e2e/menu.spec.ts` asserts the page makes **zero** client-side API calls |
| URL never invalidated by content edits or publication | Already satisfied | The route has no id, slug, version, or token. The canonical derives from `Host` + scheme only, never from content |
| Menu updates appear at the same URL | Already satisfied | `app/sitemap.ts` records that `/menu` always returns 200, rendering a "coming soon" state rather than a 404 when nothing is published; asserted in `e2e/menu.spec.ts` |
| Verified on mobile Safari/Chrome, cookie-less | **Partly.** The `webkit` and `chromium-minimum` Playwright projects cover the engines at mobile viewports; a real handset was never used | See `implementation-evidence.md` §5 |

## 4. Known limitations

1. **A restaurant with no custom domain and no configured platform base domain has no QR code.** The page
   says so in plain language and offers no control, because an owner cannot fix it themselves — domains
   are attached by whoever provisions the account. `PlatformBaseDomains` is absent from `appsettings.json`
   entirely, so on a default deployment the slug fallback never fires and only a `restaurant_domains` row
   produces a code.
2. **The scan-to-menu timing target in Task 4 is inherited, not separately measured.** Task 4 defers to the
   PR-23 budget, and `/menu` is already in that budget and in `lighthouserc.json`. Nothing about scanning
   changes how the page loads — the QR encodes a plain URL with no redirect — so no new measurement was
   taken. `perf-report.mjs` remains the gate, and it has still never run in CI.
3. **`OMNI_REST_PUBLIC_PORT` is a development and test affordance.** `restaurant_domains.host` is
   constrained to hold no port, and production serves on 443. In development and under the fixtures the
   public site answers on `:3000`, so the port is reattached from configuration; unset, nothing is
   appended. A deployment that serves the public site on a non-default port must set it or print an
   unreachable URL.
4. **Task 7's "tested on real devices" is not satisfied by this phase.** No physical phone scanned a
   printed code. This is recorded as outstanding rather than estimated.
