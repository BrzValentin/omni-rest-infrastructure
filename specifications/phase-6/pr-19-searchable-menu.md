# PR-19 — Searchable Menu

**Source:** `requirments/Phase 6/Phase_6_PR_19_Searchable_Menu.md`

**Normalization rulings:** `specifications/phase-6/README.md` section 2, rulings 5 and 6

## 1. Starting position

PR-19 is written for a platform whose menu is a PDF or an image. This one is not. Phase 2 already ships the
menu as server-rendered HTML text: `app/menu/page.tsx` is `force-dynamic`, and `DesignMenuBrowser` renders
every category and every dish into the server response. A no-JavaScript end-to-end test already asserts
that all categories and dish headings are present without client-side rendering.

Tasks 1–4 are therefore largely **already satisfied**, and this document records what was verified rather
than claiming new work. The genuine gaps are Tasks 5, 6, 8, and 9, plus one real indexing defect.

| Task | Status |
| --- | --- |
| 1 Database preparation | Already satisfied — categories and dishes are relational, with validated slugs on categories (Phase 2 PR-6) |
| 2 HTML menu rendering | Already satisfied — no PDF or image is the sole source of any menu item |
| 3 Semantic HTML structure | Already satisfied — `<main>`, `<nav>`, `<section>` per category, `h1`/`h2`/`h3`, `<article>` per dish |
| 4 Server-side rendering | Already satisfied — verified by the existing no-JavaScript test |
| 5 Menu URL integration | **New** — `/menu/{categorySlug}` |
| 6 Internal linking | **New** — real category hrefs |
| 7 SEO metadata | **New** — canonical, title, description, meta robots |
| 8 Structured data | **New** — `Menu`, `MenuSection`, `MenuItem`, `BreadcrumbList` |
| 9 XML sitemap integration | **New** — category URLs in the sitemap |
| 10 Performance | Verified, not re-engineered |
| 11 Accessibility | Preserved; covered by the existing axe assertions |
| 12 Testing | **New** — unit and e2e coverage |

## 2. The indexing defect this PR fixes

`DesignMenuBrowser` renders every category server-side, then — once hydrated — sets `hidden` on every panel
except the selected one. This is the Phase 2 progressive-enhancement contract and it is deliberate: without
JavaScript the whole menu is visible, and with JavaScript it behaves as a tab strip.

For search engines it is a real problem. Googlebot executes JavaScript, so it sees exactly one category's
dishes as visible and the rest as hidden content, which is devalued.

**The fix is not to remove the tabs.** Architecture section 16 fixes `/menu` as the stable canonical menu
URL and the future QR-code target, and the no-JavaScript baseline is a shipped accessibility property.
Instead, every category also becomes independently reachable at its own URL where nothing is ever hidden
(ruling 6). `/menu` remains the whole menu; a category page is one section as a standalone document. They
are not duplicates and each is self-canonical.

## 3. Category route (Task 5)

`app/menu/[category]/page.tsx`, `force-dynamic`.

Category slugs already exist, are validated against `^[a-z0-9]+(?:-[a-z0-9]+)*$`, and are stable, so no
schema change is required. Dishes are **not** given URLs (ruling 5): they carry only a UUID, and adding
slugs would need a new column, a uniqueness rule, and a backfill, while producing thin pages for one-line
descriptions. Dish content stays indexable within `/menu` and `/menu/{slug}`.

Resolution rules:

- The slug is matched against the **published** snapshot. A category that was never published, or has been
  unpublished, does not exist publicly and returns a real `404` — never an empty `200`.
- The check runs before any suspending boundary, so the `404` is a hard status
  (`specifications/phase-6/README.md` ruling 12).

**The whole design system is reused by narrowing the payload to a single category** rather than by adding a
sixth renderer or branching the five existing ones. Because `DesignMenuBrowser` only renders its nav strip
and only hides panels when more than one category is present, a single-category payload renders with every
dish visible and nothing hidden — which is precisely the property this route exists to provide. All five
website designs gain category pages with no design-specific work and no risk of drift between them.

**Known limitation:** the `<h1>` on a category page remains the restaurant name, and the category name is
the `<h2>`, because the heading hierarchy is owned by the five design renderers. The `<title>` element is
category-specific, and the `MenuSection` and `BreadcrumbList` structured data name the category explicitly,
so the page's subject is unambiguous to a crawler. Promoting the category to `<h1>` would require a
contract change across all five designs and is deliberately deferred.

## 4. Internal linking (Task 6)

The category strip in `DesignMenuBrowser` previously used `href="#slug"`, which gives a crawler nothing to
follow. It now uses `href="/menu/{slug}"` while keeping the existing `onClick` handler, which calls
`preventDefault`, switches the panel in place, and pushes the `#slug` hash.

The result is progressive enhancement done in the correct order:

- a crawler, and a visitor without JavaScript, sees a real link to a real page;
- a visitor with JavaScript gets the unchanged in-place tab behavior and unchanged hash history;
- `/menu#slug` deep links keep working;
- middle-click and ctrl-click now open the category page, which is what a link should do.

The crawl graph is complete: the sitemap lists every category page, `/menu` links to every category page,
and every page links back to `/` and `/menu` through the shared header.

## 5. SEO metadata (Task 7)

| Page | `<title>` | Canonical |
| --- | --- | --- |
| `/menu` | `Menu \| {restaurant}` | `{origin}/menu` |
| `/menu/{slug}` | `{category} \| Menu \| {restaurant}` | `{origin}/menu/{slug}` |

Descriptions come from the category description when set, and fall back to a generated sentence naming the
category and restaurant. Both pages are `index, follow`. `/menu` describes the "coming soon" state
explicitly when no menu is published, rather than claiming a menu exists.

## 6. Structured data (Task 8)

- `/menu` emits a `Menu` node whose `hasMenuSection` covers every category, each with `hasMenuItem` per
  dish and an `Offer` carrying `price`, `priceCurrency`, and availability. Each section's `@id` and `url`
  point at that category's own page, linking the structured data to the crawl graph.
- `/menu/{slug}` emits the standalone `MenuSection` for that category plus a `BreadcrumbList`
  (`{restaurant}` → `Menu` → `{category}`).
- An unavailable dish is emitted as `https://schema.org/OutOfStock` rather than being dropped. Hiding it
  would misrepresent the menu; the visible page shows it as unavailable and the structured data agrees.

All builders route through the same `prune` and escaping rules as PR-18.

## 7. Sitemap integration (Task 9)

One `<url>` per published category at priority 0.7, with `lastmod` from the publication timestamp. Covered
in `pr-17-search-engine-indexing.md` section 3.

## 8. Performance (Task 10)

No new client JavaScript ships: the category page reuses the existing renderer and the JSON-LD is a static
`<script>` in the server response. The added cost is one extra server-side read on the home page for the
`hasMenu` check, which is eliminated by `lib/public-data.ts` — `generateMetadata` and the page body would
otherwise each fetch the projection, so `cache()` memoizes per request and holds every public route at one
round trip per endpoint. These calls use raw `node:http` rather than `fetch`, so Next.js's own fetch
deduplication does not apply and this wrapper is what keeps the count correct.

A category page transfers **less** than `/menu`, since it renders one category rather than all of them.

## 9. Accessibility (Task 11)

Unchanged from Phase 2 and preserved rather than re-derived: skip link, `<main id="main-content">`, one
`h1`, `<section>` per category with `aria-labelledby`, `<article>` per dish, and the existing axe
assertions at serious/critical severity. The `href` change strengthens accessibility — the category strip
now exposes real link targets to assistive technology instead of fragment placeholders.

## 10. Testing (Task 12)

- `lib/json-ld.test.ts` — `Menu`, `MenuSection`, `MenuItem`, offers, unavailable dishes, empty categories.
- `e2e/seo.spec.ts` — the category page renders with nothing hidden, `/menu` links to category pages with
  real hrefs, an unknown slug is a hard `404`, and the category page carries a self-referencing canonical.
- The existing `e2e/menu.spec.ts` no-JavaScript and hash-history tests are the regression guard for the
  `href` change; both must continue to pass unchanged.

## 11. PR acceptance

> The restaurant menu is presented as indexable HTML text and is fully accessible to search engines
> without relying on PDF files or images as the sole source of menu information.

Satisfied: no PDF or image is or ever was the source of a menu item; every dish is server-rendered HTML
text at `/menu`; every category is additionally available at its own crawlable URL with nothing hidden; all
of those URLs are in the sitemap and are linked from `/menu`; and every dish is described in Schema.org
structured data.
