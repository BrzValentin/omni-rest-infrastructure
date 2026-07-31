# PR-1 — Home Page Technical Specification

**Status:** Proposed

**Depends on:** Phase 0

**Product source:** `requirments/Phase 1/Phase_1_PR-1_Restaurant_Website_Foundation_Tasks.md`

## 1. Objective

Deliver a server-rendered public home page that introduces the restaurant and provides working View Menu, Call, and Directions actions. The implementation establishes reusable public-layout, metadata, image, accessibility, and testing patterns without implementing the digital menu or owner management.

## 2. In scope

- `/` public route and shared public shell;
- typed restaurant-summary contract and server-side sample source;
- hero content and image;
- View Menu, Call, and Directions actions;
- Phase 1 responsive and accessibility behavior;
- page metadata, canonical URL, and Open Graph metadata;
- automated and manual validation.

## 3. Out of scope

- real menu browsing;
- owner authentication or content editing;
- database persistence and public restaurant API, which start in PR-2;
- embedded maps;
- analytics or call tracking;
- Schema.org structured data;
- animation beyond user-agent-native behavior.

## 4. Technical design

### 4.1 Route and component structure

```text
src/web/app/
├── layout.tsx
├── page.tsx
├── menu/
│   └── page.tsx              # temporary non-indexable placeholder
└── _components/
    ├── public-shell/
    ├── hero/
    └── primary-actions/

src/web/features/restaurants/
├── contracts/restaurant-summary.ts
├── server/restaurant-summary-source.ts
├── server/fixture-restaurant-summary-source.ts
└── links/
    ├── build-call-uri.ts
    └── build-directions-uri.ts
```

`page.tsx` is a Server Component. It obtains the current restaurant summary from `RestaurantSummarySource` and renders semantic presentational components. Components do not import fixture data directly.

### 4.2 Restaurant summary contract

The PR-1 web contract contains:

| Field | Type | Rule |
| --- | --- | --- |
| `id` | string UUID | Stable sample identifier. |
| `name` | string | Required, trimmed, 1–120 characters. |
| `shortDescription` | string | Required, trimmed, 1–300 characters. |
| `heroImage` | object | Required URL/path, width, height, and alt text. |
| `phone` | object | Required E.164 value and display value. |
| `address` | object | Required formatted address and directions destination. |

The fixture is server-only and configuration-neutral. It contains clearly fictional restaurant content and must be replaced by the PR-2 API source through the existing abstraction.

### 4.3 Error behavior

If the fixture/source cannot return a valid restaurant:

- the page renders the shared public error boundary;
- no invalid Call or Directions links are emitted;
- the error is logged with a correlation identifier but without user data;
- production output shows a generic recovery message.

## 5. Task specifications

### Task 1.1 — Create Public Website Skeleton

#### Technical requirements

- Implement `/` with Next.js App Router.
- The route must be accessible without a session or authentication redirect.
- Implement `PublicShell` with semantic `header`, `main`, and `footer` landmarks.
- Add identifiable Hero, About, and primary-action sections.
- Empty structural sections may contain non-production placeholder copy only during development; final PR output uses the typed fixture.
- Do not add a global client-side state provider for this static page.
- The production build must render the route without browser JavaScript.

#### Verification

- A server-render test finds one `main` landmark and the three sections.
- A browser test reaches `/` anonymously and receives HTTP 200.
- Disabling JavaScript leaves restaurant content and action links usable.

### Task 1.2 — Create Restaurant Information Model

#### Technical requirements

- Implement the `RestaurantSummary` TypeScript contract from section 4.2.
- Implement `RestaurantSummarySource` as a server-side interface.
- Implement one fixture-backed source selected only for PR-1/local sample operation.
- Validate fixture construction during build or test; invalid required fields fail fast.
- Keep the contract presentation-oriented and independent of future EF Core entities.

#### Verification

- Type tests reject missing required fields.
- Unit tests verify fixture validation and source behavior.
- No component imports the fixture module directly.

### Task 1.3 — Implement Hero Section

#### Technical requirements

- Render the restaurant name as the page's single `h1`.
- Render the short description as text, not injected HTML.
- Render the hero through Next.js `Image` with known dimensions or `fill` plus an aspect-ratio container.
- Supply meaningful alt text from the contract.
- Configure responsive `sizes` values.
- Mark the hero as the likely LCP image with the supported Next.js priority/fetch-priority mechanism.
- Preserve the focal content and readable text contrast at all Phase 1 viewports.

#### Verification

- Component tests assert heading, description, image alt text, and intrinsic sizing.
- Browser tests detect no layout overflow at 320, 768, 1024, and 1440 CSS pixels.
- The image does not create measurable layout shift in the lab test.

### Task 1.4 — Implement View Menu Button

#### Technical requirements

- Render an ordinary link styled as the primary action, not a click-handler-only element.
- Link to the reserved `/menu` route.
- Until PR-5 replaces it, `/menu` renders a minimal “Menu coming soon” page with `noindex` metadata.
- The link has visible text “View Menu” and a visible keyboard focus state.
- Do not introduce client-side navigation logic beyond the framework link behavior.

#### Verification

- Keyboard and pointer activation navigate to `/menu`.
- The placeholder returns HTTP 200 and includes `noindex`.
- No menu entities, API calls, or sample dishes are introduced in PR-1.

### Task 1.5 — Implement Call Button

#### Technical requirements

- Render an anchor whose `href` is generated from the E.164 phone value: `tel:+<digits>`.
- Never concatenate an unvalidated display string into the URI.
- Keep the human-readable phone number available to assistive technology.
- Use an accessible name that includes the restaurant name or intent to call.
- The action must work without JavaScript.
- Do not add analytics, confirmation dialogs, or intermediate screens.

#### Verification

- Unit tests cover valid E.164 conversion and invalid input rejection.
- Component tests assert the accessible name and exact `tel:` URI.
- Manual device verification confirms the dialer opens on one supported iOS and Android configuration.

### Task 1.6 — Implement Directions Button

#### Technical requirements

- Build a universal Google Maps directions URL using `https://www.google.com/maps/dir/?api=1`.
- URL-encode the destination with platform URL utilities.
- Use address text in PR-1; PR-2 may prefer validated coordinates or a Google Place ID.
- Render an ordinary external anchor with an accessible name describing the destination.
- When a new browsing context is used, include safe `rel` attributes.
- Do not load the Maps JavaScript SDK or an embedded map in PR-1.

#### Verification

- Unit tests cover spaces, punctuation, Unicode, and reserved characters in destinations.
- The resulting URL always contains `api=1` and one encoded destination.
- Manual verification covers desktop browser navigation and one supported mobile platform.

### Task 1.7 — Implement Responsive Layout

#### Technical requirements

- Use mobile-first CSS and the Phase 1 design tokens.
- Support content widths from 320 CSS pixels upward.
- Stack primary actions on narrow screens and use available horizontal space at wider viewports.
- Constrain text line length and page content width without fixed page-width assumptions.
- Hero media uses a stable aspect ratio and never exceeds its container.
- No content or interactive control may be hidden solely because of viewport width.

#### Verification

- Playwright checks 320×568, 375×812, 768×1024, 1024×768, and 1440×900.
- Each viewport has no document-level horizontal scrolling.
- A 200% text zoom check preserves content and actions.

### Task 1.8 — Implement Accessibility

#### Technical requirements

- Meet the shared WCAG 2.2 Level AA target for the completed route.
- Preserve a logical heading structure.
- All actions are native links and keyboard operable.
- Focus indicators meet the design-system focus token.
- Hero alt text communicates purpose; decorative imagery uses empty alt text intentionally.
- Do not add ARIA where native semantics already communicate role and state.
- Honor reduced-motion preferences if any nonessential transition is introduced.

#### Verification

- Automated accessibility scanning reports no serious or critical findings.
- Manual keyboard order follows visual and reading order.
- A screen-reader smoke test announces the page title, main heading, and three primary actions meaningfully.

### Task 1.9 — Implement SEO Foundation

#### Technical requirements

- Use the Next.js Metadata API for title, description, canonical URL, and Open Graph metadata.
- Generate title and description from typed restaurant data with safe fallbacks.
- Resolve the canonical origin from validated deployment configuration or tenant host resolution; never infer it from an untrusted forwarded host without platform validation.
- Provide an Open Graph image with absolute URL, dimensions, and alt text.
- Render the page's essential content in initial HTML.
- Do not add structured restaurant data; PR-18 owns that feature.

#### Verification

- Metadata tests assert title, description, canonical, and Open Graph values.
- Production configuration validation fails when a canonical-origin requirement is missing.
- The server response contains restaurant name and description without client hydration.

### Task 1.10 — Final Integration and QA

#### Technical requirements

- Add end-to-end coverage for anonymous home-page loading and all primary actions.
- Add component coverage for Hero and primary actions.
- Add unit coverage for Call and Directions URI builders.
- Run production build, TypeScript check, lint, unit/component tests, Playwright smoke tests, and accessibility checks.
- Record manual mobile verification for Call and Directions behavior.
- Confirm browser console and server logs have no unexpected errors during the flow.

#### Verification

- All PR-1 automated checks pass.
- Every PR-1 product acceptance criterion has a traceable test or manual evidence item.
- `/` remains usable when JavaScript is disabled.

## 6. API and database impact

PR-1 introduces no application API endpoint or database migration. The fixture source must be replaceable without changing Hero or primary-action component props.

## 7. Security and privacy

- Treat all content as untrusted text even though PR-1 uses a fixture.
- Do not use raw HTML rendering for restaurant descriptions.
- Allowlist remote image origins.
- Validate canonical-origin configuration.
- Do not include personal phone data in analytics or logs.
- External links must not receive unsafe opener access.

## 8. PR-1 completion evidence

- production build output;
- component and unit-test results;
- Playwright results at the viewport matrix;
- automated accessibility report;
- page metadata snapshot;
- manual iOS/Android Call and Directions checklist;
- screenshots for mobile, tablet, and desktop review.

## 9. References

- [Phase 1 shared specification](README.md)
- [Next.js image optimization](https://nextjs.org/docs/app/getting-started/images)
- [Google Maps URLs](https://developers.google.com/maps/documentation/urls/get-started)
