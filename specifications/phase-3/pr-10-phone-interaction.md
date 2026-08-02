# PR-10 — Phone Interaction Technical Specification

**Status:** Proposed

**Depends on:** PR-1, PR-2; integrates with PR-9 preview/admin surfaces

**Product source:** `requirments/Phase 3/Phase_3_PR-10_Phone_Interaction.md`

## 1. Objective

Consolidate all existing public phone presentation through reusable, accessible native `tel:` links and verify one-tap behavior on supported mobile devices. PR-10 hardens the PR-1 foundation rather than duplicating it.

## 2. Scope normalization

Current integration surfaces are the home page, restaurant-information/contact section, and PR-9 preview where phone information is displayed. Restaurant Cards, Search Results, and Favorites are deferred because those product features do not exist.

## 3. Shared phone contract

- Backend/public DTO provides validated E.164 value and locale-formatted display value.
- One `buildTelUri` utility accepts E.164 input only.
- `PhoneLink` renders textual phone presentation.
- `CallButton` renders action presentation with visible label/icon according to context.
- Both are ordinary anchors and work without JavaScript.
- Missing phone renders no interactive element; optional placeholder is a product/design choice.

## 4. Task specifications

### Task 1 — Create Phone Link Component

- Implement/reuse `PhoneLink` with display text and exact `tel:<E.164>` href.
- Use native anchor semantics, visible focus, and accessible link name.
- Do not add ARIA role to an anchor with href.
- Support optional contextual accessible label without hiding the visible number.
- Test formats, accessible name, keyboard activation, and no-JavaScript output.

### Task 2 — Create Call Button Component

- Reuse the same URI builder and base link primitive.
- Render icon as decorative unless it communicates additional meaning.
- Support documented design-system size variants without boolean-prop proliferation.
- When phone is absent, omit the button rather than render a disabled link.
- Test size variants, accessible name, missing value, and one shared URI implementation.

### Task 3 — Integrate Throughout the Application

- Replace static phone text where calling is intended on home, contact/details, and preview surfaces.
- Plain textual phone data may remain in noninteractive contexts such as audit records.
- Future cards/search/favorites must adopt the shared components when product requirements introduce them; no speculative pages are created.
- Add a static/component test preventing direct ad hoc `tel:` construction outside the shared utility where practical.

### Task 4 — Optimize Mobile Calling Experience

- Maintain at least 44×44 CSS-pixel call targets.
- One tap follows the native `tel:` URI without custom confirmation or intermediate modal.
- Support portrait/landscape and safe-area layout.
- Do not intercept or simulate dialer behavior in JavaScript.
- Manually verify current iPhone Safari and Android Chrome.

### Task 5 — Support Desktop Browsers

- Keep valid clickable links; the operating system/browser decides whether a handler exists.
- No application error is shown solely because desktop has no telephony handler.
- Cursor, focus, and context-menu behavior remain native.
- Test no JavaScript errors in supported Chromium, Firefox, and WebKit engines.

### Task 6 — Handle Missing Phone Numbers

- Treat missing/null/invalid phone as unavailable data before rendering.
- Omit CallButton/PhoneLink and avoid empty anchors.
- Preserve layout without blank focus stops.
- Log invalid public contract data as a server-side diagnostic without emitting the value unnecessarily.
- Test null, empty, malformed, and valid values.

### Task 7 — Accessibility

- Meet WCAG 2.2 AA and Phase 1 focus/contrast standards.
- Visible text and accessible name identify the phone action and restaurant context.
- Do not rely on icon/color alone.
- Ensure zoom, screen reader, keyboard, touch, and forced-colors behavior.
- Automated scans plus manual screen-reader smoke test are required.

### Task 8 — Testing

- Unit-test E.164 URI construction and rejection.
- Component-test both components and missing-state behavior.
- Browser-test every existing integration surface at responsive viewports.
- Manual device matrix: iPhone Safari, Android Chrome, and optional Android Firefox when available.
- Desktop matrix verifies navigation/no console errors; automated browsers cannot prove a real dialer launched, so manual evidence is required.
- Record checklist and map all eight source tasks.

## 5. Security and privacy

- Never construct a URI from unvalidated free-form text.
- Escape visible text normally.
- Do not log click events or phone numbers unless a separately approved analytics requirement defines privacy handling.
- Native links avoid introducing extra browser permissions or third-party scripts.

## 6. Completion evidence

- unit/component/browser results;
- component-usage search/audit;
- accessibility report;
- iOS/Android manual checklist;
- explicit list of deferred nonexistent surfaces;
- mapping of all eight source tasks.

## 7. References

- [Phase 3 shared specification](README.md)
- [PR-1 Home Page](../phase-1/pr-1-home-page.md)
- [PR-2 Restaurant Information](../phase-1/pr-2-restaurant-information.md)
