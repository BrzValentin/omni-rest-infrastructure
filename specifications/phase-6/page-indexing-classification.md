# Page Indexing Classification

**Source:** `requirments/Phase 6/Phase_6_PR-17_Search_Engine_Indexing.md`, Task 1

**Normalization rulings:** `specifications/phase-6/README.md` section 2, rulings 1, 2, 5, and 6

This document is the PR-17 Task 1 deliverable. It classifies **every route the application serves**, so that the
"all page types are classified / no ambiguous cases remain" acceptance criterion is satisfied by enumeration
rather than by assumption. It is the single source of truth for `robots.txt`, the sitemap, and the per-route
`robots` metadata; those three artifacts must not disagree with this table.

## 1. Classification vocabulary

| Class | Meaning | `robots` meta | In sitemap |
| --- | --- | --- | --- |
| **Indexable** | Public, stable, unique content | `index, follow` | Yes |
| **Non-indexable** | Route exists but must never appear in results | `noindex, nofollow` | No |
| **Non-indexable, follow** | Route must not rank, but its outgoing links should still be crawled | `noindex, follow` | No |
| **N/A** | Route does not exist in this platform | — | No |

Every restaurant is served on its own host (architecture section 8), so this table describes one tenant's site
and applies identically to every tenant.

## 2. Indexable routes

| Route | Page | Reason |
| --- | --- | --- |
| `/` | Home / restaurant page | The tenant's primary public page. Unique per host, server-rendered from the published snapshot, and the target of the `sameAs`/brand identity. |
| `/menu` | Full menu | The complete published menu as HTML text. Architecture section 16 fixes this URL as the stable Phase 9 QR-code target, so it must stay canonical and indexable. |
| `/menu/{categorySlug}` | Menu category | One published category with every dish visible and no hidden panels. Added by PR-19 Task 5 (README ruling 5). Slugs are validated and stable (Phase 2 PR-6). |

Each of the three is **self-canonical**: `/menu` and `/menu/{slug}` present overlapping content but different
scopes, and neither is a duplicate of the other. `/menu` is the whole menu; a category page is one section
presented as a standalone document. No cross-canonicalization is applied between them.

A category page is emitted only for a category that exists in the **published** snapshot. An unknown or
unpublished slug returns a real `404` (see section 5), never a soft `404` or an empty `200`.

## 3. Non-indexable routes

| Route | Page | Class | Reason |
| --- | --- | --- | --- |
| `/admin/login` | Owner sign-in | Non-indexable | Authentication surface. No public value; indexing it invites credential-stuffing traffic. This platform's login lives under `/admin`, not `/login`. |
| `/admin` | Owner portal home | Non-indexable | Authenticated-only. Returns a redirect to login for anonymous requests, so it has no stable public content. |
| `/admin/restaurant` | Restaurant management | Non-indexable | Authenticated-only management surface. |
| `/admin/restaurant/preview` | Draft preview | Non-indexable | Renders **draft**, unpublished content. Architecture section 16 requires preview pages to be non-indexable so unpublished data never reaches search results. |
| `/admin/menu` | Category management | Non-indexable | Authenticated-only management surface. |
| `/admin/menu/dishes` | Dish management | Non-indexable | Authenticated-only management surface. |
| `/admin/gallery` | Gallery management | Non-indexable | Authenticated-only management surface. |
| `/admin/design` | Website design selection | Non-indexable | Authenticated-only management surface. |
| `/admin/design-preview/{designId}/home` | Temporary design preview | Non-indexable | Temporary preview page. Already carries `X-Robots-Tag: noindex, nofollow` and `Cache-Control: private, no-store` from `next.config.ts`; Phase 6 adds the matching meta tag so the rule survives a header-stripping proxy. |
| `/admin/design-preview/{designId}/menu` | Temporary design preview | Non-indexable | As above. |
| `/api/v1/{...}` | API proxy | Non-indexable | JSON endpoints. Disallowed in `robots.txt` and served with `X-Robots-Tag: noindex`; a JSON body cannot carry a meta tag, so the header is the only available control. |
| `/media/{...}` | Media proxy | **Indexable for images only** | Serves the images referenced by public pages. Blocking it would suppress the restaurant's photos from image search and would strip the `image` values in the Schema.org output of any crawler that verifies them. Not listed in the page sitemap; discovered through the pages that embed it. |
| 404 page | Not found | Non-indexable | Served with a real `404` status and `noindex`. Applies to the unknown-host page, the unknown-category page, and the root not-found page. |
| 500 / error page | Error boundary | Non-indexable | Transient failure output; must never be captured as content. |

## 4. Routes named by the requirement that do not exist

PR-17 Task 1 was written against a generic website. These entries are recorded so no classification is left
ambiguous (README ruling 1).

| Requirement entry | Status | Reason |
| --- | --- | --- |
| Registration | **N/A** | Owner accounts are never publicly registered. They are provisioned through a controlled backend procedure (`specifications/phase-3/backend-operations.md`). No route exists. |
| Forgot Password | **N/A** | No self-service password reset ships in Phase 3. Credential recovery is an operator procedure. No route exists. |
| Dashboard | **N/A** | The owner portal is `/admin`, already classified in section 3. There is no `/dashboard` route. `robots.txt` still disallows the path defensively (README ruling 2). |
| About | **N/A** | No standalone About route. Restaurant description is a section of `/`. |
| Contact | **N/A** | No standalone Contact route. Address, phone, and hours are sections of `/`. |
| Gallery | **N/A** | The gallery is a section of `/` (Phase 5 PR-15), not a route. Its images are indexable through `/media/{...}`. |
| Dish page | **N/A** | Dishes have no dedicated URL (README ruling 5). Dish content is indexable within `/menu` and `/menu/{categorySlug}`. |
| Login (`/login`) | **N/A** as a path | The route exists as `/admin/login` and is classified in section 3. `robots.txt` disallows `/login` defensively. |

## 5. HTTP status contract

PR-17 Task 7 requires correct status codes and forbids soft `404`s. The rules that follow are the ones Phase 6
must hold; they are verified in `implementation-evidence.md`.

| Condition | Status | Body |
| --- | --- | --- |
| Published public page | `200` | The page |
| Host does not resolve to a published restaurant | `404` | Not-found page, `noindex` |
| `/menu` when the restaurant has no published menu | `200` | The "menu coming soon" state — the restaurant exists and the page is correct, so this is **not** a `404` |
| `/menu/{slug}` where the slug is not a published category | `404` | Not-found page, `noindex` |
| Any unknown path | `404` | Root not-found page, `noindex` |
| Tracking parameter present on a public URL | `301` | Redirect to the parameter-free canonical URL (README ruling 10) |
| Upstream API failure | `503` | Error page, `noindex` — never a `200` |

`410 Gone` is listed as permitted by the requirement but is **not** emitted: the platform has no concept of a
permanently removed public page. An unpublished category becomes a `404`, which is correct, because publication
is reversible.

## 6. Consistency obligations

These three artifacts are generated from this classification and must be kept in agreement:

1. `robots.txt` — disallows every path in section 3 except `/media`, and names the sitemap.
2. `sitemap.xml` — contains exactly the section 2 routes, and nothing else.
3. Per-route `robots` metadata — `index, follow` for section 2, `noindex, nofollow` for section 3.

A route added in a later phase must be added to this table in the same change that adds the route.
