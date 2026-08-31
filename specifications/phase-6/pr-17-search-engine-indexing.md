# PR-17 — Search Engine Indexing

**Source:** `requirments/Phase 6/Phase_6_PR-17_Search_Engine_Indexing.md`

**Normalization rulings:** `specifications/phase-6/README.md` section 2

**Task 1 deliverable:** `page-indexing-classification.md`

## 1. Origin resolution (foundation for Tasks 2, 3, 5)

Canonical URLs, sitemap entries, and the `Sitemap:` line in `robots.txt` must all be absolute, and every
restaurant is served on its own host, so the origin can only come from the request. `lib/site-origin.ts`
owns that derivation and is deliberately free of `server-only` and `next/headers` so its parsing rules can
be unit tested; `lib/seo.ts` is the thin request-bound wrapper.

A `Host` header is client-controlled, so three guards apply together:

1. **Syntax.** `normalizeOriginHost` rejects an absent, over-long, whitespace-bearing, comma-joined,
   credential-bearing, or path-bearing value. The port is retained — unlike `normalizePublicHost` in
   `lib/menu-api.ts`, which strips it because the backend resolves tenants by hostname alone — because an
   origin without a port is not addressable in local development.
2. **Scheme.** Taken from the deployment-owned `OMNI_REST_PUBLIC_SCHEME`, never from a client
   `X-Forwarded-Proto`. This follows the rule `app/api/v1/[...path]/route.ts` already applies, but uses
   its **own** variable rather than reusing `OMNI_REST_FORWARDED_PROTO`. The two look interchangeable
   and are not: `OMNI_REST_FORWARDED_PROTO` is set to `https` in local development as a deliberate lie,
   so the API believes the request arrived over TLS and issues its `Secure` auth cookies over plain
   HTTP. Deriving canonical URLs from it would make every local canonical and sitemap entry claim
   `https://…:3000` for a site actually served over `http`. With no configuration, loopback-family
   hosts fall back to `http` and everything else to `https`.
3. **Existence.** A canonical is only ever emitted after the backend has resolved the host to a
   published restaurant. An attacker-supplied host produces a `404` long before any URL is generated.

`metadataBase` is deliberately never set. Next.js ignores it whenever a metadata field supplies an absolute
URL, and any build-time base would be wrong for every tenant. The consequence is a standing rule: **every
URL-valued metadata field must be absolute**, because a relative one with no `metadataBase` fails the build.

## 2. `robots.txt` (Task 2)

`app/robots.ts`, `dynamic = "force-dynamic"`.

Reading the host through `headers()` already opts the route out of caching; the explicit `dynamic` export
states the same intent so a later refactor cannot silently make it static and freeze one tenant's hostname
into every other tenant's document.

```text
User-Agent: *
Allow: /
Disallow: /admin
Disallow: /api
Disallow: /dashboard
Disallow: /login
Disallow: /register

Host: https://{tenant}
Sitemap: https://{tenant}/sitemap.xml
```

- `/admin` and `/api` are the real private surfaces.
- `/dashboard`, `/login`, and `/register` do not exist here (the owner portal is `/admin`). They are kept
  as defensive entries per README ruling 2.
- `/media` is **not** disallowed. It serves the images public pages embed; blocking it would remove the
  restaurant's photos from image search and break any consumer that verifies the Schema.org `image` URLs.
- No `Disallow: /*?` rule is emitted (README ruling 10): a URL Google cannot crawl is a URL whose canonical
  tag Google never sees.

## 3. `sitemap.xml` (Task 3)

`app/sitemap.ts`, `dynamic = "force-dynamic"`, generated from the published projection.

| Entry | Condition | `priority` | `changefreq` |
| --- | --- | ---: | --- |
| `/` | always | 1.0 | weekly |
| `/menu` | always — it returns `200` with a "coming soon" state when nothing is published | 0.9 | weekly |
| `/menu/{categorySlug}` | one per **published** category | 0.7 | weekly |

`lastmod` is `publications.published_at`, surfaced through `PublicMenuReader` as `publishedAt` (README
ruling 9). A request-time `lastmod` would tell crawlers the whole site changed on every fetch, which trains
them to ignore the signal.

Task 3 requires the sitemap to update automatically when a restaurant is created or updated, a dish is
published, or a URL changes. This is satisfied structurally rather than by an invalidation hook: the
document is regenerated per request from the same snapshot the pages render from, so it cannot go stale. An
unknown host returns an empty sitemap rather than a `500`, which a crawler would retry.

## 4. Meta robots (Task 4)

`lib/seo.ts` exposes exactly two builders so no route hand-rolls a directive.

| Surface | Directive |
| --- | --- |
| `/`, `/menu`, `/menu/{slug}` | `index, follow` plus `max-image-preview:large`, `max-snippet:-1` |
| `/admin/**`, previews, `404`, error boundary | `noindex, nofollow` |

Two behaviors govern the implementation:

- **Next.js merges metadata shallowly.** A nested object such as `robots` defined in a later segment
  *replaces* an earlier one rather than merging into it. Every directive is therefore written out in full
  at its own route; none is inherited.
- **Google applies the more restrictive rule when a meta tag and an `X-Robots-Tag` disagree.** Phase 6 adds
  `X-Robots-Tag: noindex, nofollow` for `/admin/:path*` and `X-Robots-Tag: noindex` for `/api/:path*` in
  `next.config.ts`. Config headers are evaluated before filesystem routes, so this guarantees an admin page
  shipped without page metadata is still non-indexable. Because the interaction can only tighten indexing,
  it can never accidentally suppress a public page.

A JSON response cannot carry a meta tag, which is why `/api` relies on the header alone.

## 5. Canonical URLs (Task 5)

Every public page emits `<link rel="canonical">` with an absolute, parameter-free, self-referencing URL
built by `absoluteUrlFrom`, which strips query strings and fragments and refuses any path that would escape
the tenant origin.

- No canonical is emitted on a non-indexable page. A canonical on a page that must not rank is at best
  ignored and at worst an instruction to consolidate signals onto it.
- `/menu` and `/menu/{slug}` are each **self-canonical**. They present overlapping content at different
  scopes and neither is a duplicate of the other, so no cross-canonicalization is applied
  (`page-indexing-classification.md` section 2).
- There are no circular references, because every canonical points at the URL that emitted it.

## 6. Duplicate URLs (Task 6)

Handled by the canonical tag alone; see README ruling 10 for why tracking parameters are not redirected and
why no `Disallow: /*?` rule is used. "Redirects where appropriate" is satisfied by trailing-slash
normalization, which Next.js issues as a `308` under the default `trailingSlash: false`, verified in
`implementation-evidence.md` rather than assumed.

## 7. HTTP status codes (Task 7)

The full contract is `page-indexing-classification.md` section 5. The risk that needed engineering
attention is the **soft `404`**: Next.js returns `200` instead of `404` when `notFound()` is reached after
the response has begun streaming, which happens when a `loading.tsx` sits above the check or when the check
runs inside a `Suspense` boundary.

This application has no `loading.tsx` and performs every existence check before any suspending boundary, so
`notFound()` produces a real `404`. Because the requirement forbids soft `404`s outright, that behavior is
pinned by an end-to-end status assertion rather than left to survive an unrelated future change.
**Adding a `loading.tsx` above a public route is, from Phase 6 onward, an SEO-breaking change.**

`410 Gone` is not emitted: publication is reversible, so an unpublished category is a `404`, not a
permanent removal.

## 8. Verification (Task 8)

`e2e/seo.spec.ts`, tagged `@seo`, runs against the real backend and the production frontend build, because
status codes, response headers, and generated-document contents cannot be evidenced by component tests. It
covers `robots.txt` on two different hosts, sitemap contents and XML validity, canonical presence and
parameter-stripping, meta robots on public and private surfaces, the `X-Robots-Tag` guard, the hard-`404`
matrix, and the trailing-slash redirect. Results are recorded in `implementation-evidence.md`.

## 9. Definition of done

- `lib/site-origin.ts` unit tests cover every rejection case, including host injection.
- `robots.txt` and `sitemap.xml` are host-correct and contain only classified routes.
- Every public page carries an absolute self-referencing canonical and `index, follow`.
- Every private surface carries `noindex, nofollow` from both the page and the header.
- The `404` matrix returns real `404` status codes.
- `npm run lint`, `npm run typecheck`, `npm run test`, `npm run build`, and the `@seo` e2e suite pass.
