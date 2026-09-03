# Phase 9 — QR Code Menu Access

**Requirement:** PR-26. **Status:** Implemented. Tasks 1 and 5 were already satisfied before this phase
and were audited rather than rebuilt (`README.md` §3); Task 3's optional print template and Task 7's
real-device scan are not delivered (`README.md` Ruling 8, §4).

## 1. The finding that shapes this document

A QR code is the only artefact this platform produces that **leaves the platform permanently.** Every
other output can be corrected by a deploy. A QR code is printed, laminated, and glued to a table, and the
restaurant discovers a mistake from a customer holding a phone.

That changes which failure matters most. It is not "the code renders badly" — a bad render is visible. It
is **"the code renders perfectly and encodes the wrong address"**, which passes every visual check and
fails only in the field. Nearly everything below exists to make that outcome impossible.

The specific trap, in one sentence: **the owner portal is not necessarily served on the restaurant's
public host**, so the portal's own request origin is the wrong answer, and it is also the answer every
existing helper in the codebase would have given. See `README.md` Ruling 1.

## 2. Resolving the public address

The backend owns this, because the backend is the only party that knows it. `Restaurants/RestaurantPublicAddress.cs`
holds the rule as a pure function; `RestaurantPublicAddressService` supplies it with tenant data.

The precedence deliberately mirrors `Infrastructure/RestaurantResolver.ResolveAsync`, which maps the other
direction — host to restaurant. The two must agree, or the dashboard prints an address the resolver would
refuse:

| Order | Strategy | Source value | Mirrors |
| ---: | --- | --- | --- |
| 1 | A row in `restaurant_domains` | `"domain"` | `ResolveByDomainAsync` |
| 2 | Tenant slug beneath the first usable `PublicMenu:PlatformBaseDomains` entry | `"slug"` | `ResolveBySubdomainAsync` |
| 3 | Neither | `"none"`, `host: null` | — |

Normalization matches the resolver exactly: trim, strip a trailing root dot, lowercase. A base domain
written `".example.app"` yields `menu.example.app`, not `menu..example.app`, and an entry that normalizes
away is skipped rather than taken literally — the resolver drops those too.

The development-only loopback fallback (`ResolveByConfigurationAsync`) is deliberately **not** mirrored. It
exists so a developer can reach a tenant on `localhost`; a QR code built from it would encode `localhost`
onto something physical.

### Contract

```
GET /api/v1/admin/restaurant/public-address        [OwnerPolicy, read-only, no antiforgery]
200 → { "host": "prairietable.com", "source": "domain" }
200 → { "host": null,               "source": "none"   }
401 → unauthenticated        403 → authenticated but not an owner
```

The tenant is never named in the request. It comes from `IOwnerRestaurantContext.ResolveAsync`, which
derives it from the caller's active membership and binds the tenant scope. There is no restaurant id to
tamper with, which is what makes cross-restaurant leakage structurally impossible rather than merely
tested against — `architecture.md` §8 requires exactly this.

## 3. Composing the URL

`lib/public-menu-url.ts` turns the reported host into the encoded string. It reuses
`normalizeOriginHost`, `resolveScheme` and `absoluteUrlFrom` from `lib/site-origin.ts` rather than
reimplementing any host rule; that module is the platform's single source of truth for what a host may
contain and is already adversarially tested.

Three properties are load-bearing:

- **The path is always exactly `/menu`.** No query, no fragment, no tracking parameter — `absoluteUrlFrom`
  strips them by contract. See `README.md` Ruling 7.
- **A host that already carries a port is rejected**, not honoured. The backend column cannot hold one, so
  a port arriving there means something upstream is guessing, and two disagreeing sources of truth is
  worse than one loud failure.
- **A port equal to the scheme default is dropped.** Beyond canonical spelling, `absoluteUrlFrom` compares
  `url.origin` against the origin string, and `https://host:443` fails that comparison.

Failure is `UnsafeHostError` — the existing type, so callers keep one failure mode — never a partly built
string.

## 4. Encoding

`lib/qr-code.ts`, over `uqr@0.1.3` (`README.md` Ruling 3).

| Choice | Value | Why |
| --- | --- | --- |
| Error correction | **M** (~15% damage) | The standard for printed table-top codes, which pick up grease and scuffs. L (~7%) is too fragile for a surface people eat over. Q and H push the symbol to a higher version, so the same card holds more, *smaller* modules — harder to scan at these URL lengths, not easier. |
| Quiet zone | **4 modules**, every side | Mandated by the QR specification. It is part of the symbol, not margin: a code cropped flush to its finder patterns is the classic "scans on screen, fails on paper" bug. |
| Empty payload | Rejected | A whitespace-only payload produces a *perfectly valid* symbol. That is the danger — it prints, passes visual inspection, and scans to nothing. |

`qrToPathData` merges horizontally adjacent dark modules into one path command. A version-3 symbol is
37×37; one `<rect>` per module puts roughly 700 elements in the document for a single code.

## 5. Surfaces

| Surface | Kind | Behaviour |
| --- | --- | --- |
| `/admin/qr-code` | Server component, **no client island** | Inline SVG preview, the encoded URL as inspectable text, both download links, printing guidance |
| `/admin/qr-code/qr.svg` | Route handler | `image/svg+xml`, `attachment`, named after the restaurant |
| `/admin/qr-code/qr.png` | Route handler | `image/png`, `attachment`, ~1000 px at 300 DPI |

All three read through `app/admin/(protected)/qr-code/qr-target.ts`, which is `cache()`-wrapped, so a
request costs one backend round trip regardless of how many surfaces consult it.

**Route handlers do not run the `(protected)` layout**, so none of them inherits its session check. This
is safe by construction rather than by a second check: every surface reads through the backend, which
refuses a caller without an active owner membership, and that refusal maps straight onto the response.
Adding a frontend authorization check would only create something that could disagree with the authority.

The state ladder is the portal's existing vocabulary — an outage, an empty section, and a working page are
three different things (Phase 8 PR-22):

| Backend result | Page | Downloads |
| --- | --- | --- |
| `401`/`403` | Redirect to login with a return path | `401` |
| Unreachable or fault | `AdminUnavailable`, retryable | `503` |
| `host: null` | Plain-language explanation, no code, no download links | `404` |
| A host | The code | The file |

The empty state names no control, because an owner cannot fix it themselves — domains are attached by
whoever provisions the account — so it says who to ask instead.

## 6. Printing

Task 3 requires a download that "scans correctly when printed at typical table-tent/sticker sizes". Three
things make that true, and each of them is a known way to get it wrong:

1. **The SVG carries a module-unit `viewBox` and no pixel dimensions**, so it is resolution-independent and
   a print shop can set it to any size losslessly.
2. **The PNG declares 300 DPI** in a `pHYs` chunk (11811 pixels per metre). Without it the file defaults to
   72 DPI and a layout tool silently places a 1000 px code at 13 inches or scales it to a blur. The scale
   is derived from a ~1000 px target rather than fixed, because module count grows with URL length — a
   fixed scale would quietly shrink the printed code for a restaurant with a long domain.
3. **Both render an opaque white ground across the full viewBox, quiet zone included, and hardcode black on
   white.** A transparent QR printed onto coloured card does not scan, and a code that inherited
   `currentColor` would invert under a dark theme.

The owner-facing guidance on the page states the same constraints in plain language, with no error codes,
no standards references, and no internal state names, per the Phase 8 content rules: print at least 2 cm
across, keep the white border, print dark on light, and test it with a phone before printing a hundred.

## 7. Stability (Task 5) and isolation (Task 6)

**Stability.** The QR payload is computed on every read and never persisted. There is no stored image, no
cached payload, and no version in the URL, so a slug or domain change is reflected the next time the page
is opened, and no menu edit can invalidate anything. `Cache-Control: no-store` on both downloads keeps a
proxy from serving a previous domain's code to an owner who has just moved domains and is about to
reprint.

**Isolation.** Two restaurants cannot see each other's address, because neither request names a
restaurant at all — the tenant comes from the membership. This is asserted directly:
`AdminPublicAddressApiTests.EachOwnerReadsTheirOwnPublicHostAndAnonymousCallersAreRefused` signs in two
owners of two seeded restaurants, asserts each reads its own host, and asserts the two differ.

## 8. Verification

Full detail, including what was *not* verified, is in `implementation-evidence.md`.

1. `Unit/RestaurantPublicAddressTests.cs` — 20 cases over the precedence rule: shortest-domain
   preference, ordinal tie-break, slug fallback, base domains written with stray dots or normalizing away,
   null and whitespace rows, and both no-address paths.
2. `Integration/AdminPublicAddressApiTests.cs` — 3 cases against real PostgreSQL: anonymous refusal, the
   two-tenant isolation case above, and the slug fallback under an overridden `PlatformBaseDomains`.
3. `lib/qr-code.test.ts` — quiet zone, determinism, version growth, empty-payload refusal, run merging
   (including a dark-module count cross-checked against the matrix itself), the white ground, hardcoded
   colours, `crispEdges`, and XML escaping of the title.
4. `lib/qr-png.test.ts` — structural, with no PNG decoder dependency: signature, chunk order, IHDR fields,
   `pHYs` values, inflated scanline geometry, and chunk CRCs checked against Node's own `zlib.crc32` so
   the two implementations verify each other.
5. `lib/public-menu-url.test.ts` — adversarial hosts, the scheme split, port attachment and omission, and
   a case asserting no query or fragment can ever reach the output.
6. `lib/qr-file-name.test.ts` — including that a restaurant name can never emit a path separator or a
   quote that would break out of the `Content-Disposition` header.
7. `e2e/qr-code.spec.ts` — the encoded URL names the public host and not the admin host; the code is in
   the server HTML with JavaScript disabled; the encoded URL fetched cold and cookieless returns `200`
   with no redirect; both downloads; two-restaurant isolation; and the empty state.

## 9. Known traps

- **The obvious implementation is the wrong one.** `await absoluteUrl("/menu")` inside the QR page
  compiles, passes review, renders a beautiful code, and encodes the admin origin. The only thing standing
  between this feature and that bug is the assertion in `e2e/qr-code.spec.ts` that the displayed URL does
  **not** contain the admin host. Do not weaken it.
- **A latent renderer bug survives real input.** `qrToPathData` must flush a run that touches the final
  column. It never has to on a real symbol, because the last four columns are always quiet zone — so the
  test that catches it uses a synthetic matrix, and a "simplification" that drops it would go unnoticed.
  This was caught during Phase 9 by a fixture that declared a non-square matrix; `matrixOf` now rejects
  one.
- **`PlatformBaseDomains` is absent from `appsettings.json`.** Subdomain resolution is off until a
  deployment opts in, so on a default deployment the slug fallback never fires and only a
  `restaurant_domains` row produces a code. This is the resolver's existing behaviour, not a Phase 9
  choice, but it decides what an owner sees on this page.
- **`OMNI_REST_PUBLIC_SCHEME` matters more here than anywhere else.** Unset, the scheme falls back to a
  loopback heuristic. A production deployment that leaves it unset while serving on a host the heuristic
  reads as loopback would print `http://` onto a card. Never derive it from `OMNI_REST_FORWARDED_PROTO`,
  which is set to `https` in local development as a deliberate lie.
