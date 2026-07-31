# PR-4 — Responsive Experience Technical Specification

**Status:** Proposed

**Depends on:** Phase 0, PR-1, PR-2, PR-3

**Product source:** `requirments/Phase 1/Phase_1_PR-4_Responsive_Experience.md.md`

## 1. Objective

Establish and verify a responsive, accessible, and performant UI system for every public surface delivered in Phase 1. Later phases inherit these standards and must validate their own forms, tables, dialogs, menus, and galleries when those components are introduced.

PR-4 does not create dummy features solely to satisfy a generic responsive checklist.

## 2. Supported experience

### 2.1 Width ranges

| Range | CSS pixels | Primary behavior |
| --- | ---: | --- |
| Small | 320–767 | Single-column, compact spacing, stacked actions. |
| Medium | 768–1023 | Expanded spacing, mixed one/two-column composition where useful. |
| Large | 1024 and above | Constrained content container and multi-column composition where useful. |

CSS must remain fluid inside each range. Breakpoints are implementation thresholds, not device detection.

### 2.2 Required test viewports

| Name | Viewport |
| --- | --- |
| Minimum mobile | 320×568 |
| Common mobile | 375×812 |
| Mobile landscape | 812×375 |
| Tablet portrait | 768×1024 |
| Tablet landscape/small desktop | 1024×768 |
| Desktop | 1440×900 |

### 2.3 Browser policy

At release time, support the latest two stable major versions of Chrome, Edge, Firefox, Safari, iOS Safari, and Android Chrome that remain supported by the framework/browser vendors. CI runs Chromium, Firefox, and WebKit; manual release checks cover one current iOS Safari and Android Chrome device or trusted device service.

## 3. Design-system foundation

Phase 0/PR-4 define CSS custom-property tokens for:

- color roles and contrast-safe states;
- typography scale and line height;
- spacing scale;
- content widths;
- borders and radii;
- elevation where necessary;
- focus indicator;
- touch target minimum;
- responsive gutters;
- motion duration with reduced-motion alternatives.

Components use CSS Modules and tokens. Feature components do not introduce arbitrary one-off colors, spacing values, or breakpoints without design-system review.

Minimum interactive target size is 44×44 CSS pixels unless a documented WCAG-compliant exception applies.

## 4. Task specifications

### Task 1 — Define Responsive Breakpoints

#### Technical requirements

- Implement the width ranges in section 2.1 through shared media-query tokens.
- Use mobile-first base rules; larger ranges progressively enhance layout.
- Do not use user-agent strings or JavaScript width checks for ordinary layout.
- Support portrait and landscape through fluid rules rather than orientation-specific duplication unless a real defect requires it.
- Document minimum supported width as 320 CSS pixels.
- Zoom and text resizing must not trigger horizontal content loss.

#### Verification

- Static style checks prevent undocumented breakpoint constants in Phase 1 feature styles.
- Playwright covers every required viewport.
- Manual 200% text zoom and browser zoom checks are recorded.

### Task 2 — Responsive Layout System

#### Technical requirements

- Implement a shared page container with fluid gutters and an approved maximum reading width.
- Use CSS Grid/Flexbox for composition; fixed widths are allowed only for intrinsically fixed elements such as icons.
- Set `min-width: 0` on grid/flex children where text overflow would otherwise occur.
- Long words, URLs, addresses, and social labels wrap without clipping.
- Horizontal page scrolling is forbidden at supported widths.
- Local horizontal scrolling is allowed only for future data components whose specification justifies it.

#### Verification

- Automated overflow assertions compare document scroll width and viewport width.
- Long-content fixtures cover restaurant name, description, address, email, and social URLs.

### Task 3 — Responsive Header and Navigation

#### Technical requirements

- Implement a Phase 1 public header containing restaurant identity and navigation to available Phase 1 routes/sections.
- Do not link to unimplemented routes except the explicitly reserved `/menu` placeholder from PR-1.
- Use a collapsible mobile menu only if the number/length of links cannot fit at 320 CSS pixels; otherwise prefer a simpler wrapping or compact navigation.
- If a disclosure menu is used, implement it as an accessible button with `aria-expanded`, controlled region, Escape handling, focus behavior, and close-on-navigation.
- Preserve visible active-page state without relying only on color.

#### Verification

- Keyboard and pointer tests cover open, close, Escape, navigation, and resize behavior when a disclosure exists.
- Header elements do not overlap at any required viewport or 200% text zoom.

### Task 4 — Responsive Typography

#### Technical requirements

- Use a fluid or stepped typography token scale with minimum and maximum sizes.
- Body text remains readable without zooming at 320 CSS pixels.
- Maintain heading hierarchy independently of visual size.
- Limit prose line length to the design-system reading-width token.
- Prevent text truncation for essential restaurant, hours, contact, and action content.
- Support user font-size preferences and 200% text resize.

#### Verification

- Visual regression fixtures include long names, long descriptions, and large text settings.
- No essential text is clipped or replaced by an unexplained ellipsis.

### Task 5 — Responsive Images and Media

#### Technical requirements

- Use Next.js `Image` for eligible local/remote images.
- Supply intrinsic dimensions or a stable aspect-ratio container.
- Supply accurate `sizes` values for responsive layouts.
- Use the generated responsive source set; do not send one desktop-sized image to all devices.
- Prioritize only the likely LCP hero image; lazy-load below-the-fold images.
- Preserve focal content through explicit object positioning when required by the asset specification.
- Maps/iframes use responsive containers and explicit aspect ratio.

#### Verification

- No image or iframe exceeds its container.
- CLS remains within the Phase 1 threshold.
- Network inspection confirms responsive image variants at small and large viewports.

### Task 6 — Responsive Forms

#### Phase 1 status

No product form exists in Phase 1, so PR-4 does not create a dummy form.

#### Inherited technical requirements

- Future forms use visible labels, appropriately typed inputs, full-width small-screen layout, field-level errors, and persistent action access.
- Virtual keyboards must not hide the active control or submit action.
- Error summaries and field errors remain associated programmatically.
- Input text is never reduced below a usable mobile size.

#### Verification

- Marked “not applicable to Phase 1 product surfaces.”
- Requirements become mandatory in the first PR introducing a form.

### Task 7 — Touch-Friendly Interface

#### Technical requirements

- Primary actions and navigation controls meet the 44×44 CSS-pixel target.
- Adjacent controls have sufficient separation to reduce accidental activation.
- Hover is never the only way to reveal content or functionality.
- Call, Directions, menu, and navigation actions work with one deliberate tap.
- Do not intercept platform scrolling or ordinary gestures.

#### Verification

- Computed-size assertions cover primary Phase 1 controls.
- Manual iOS and Android checks cover scrolling and action activation.

### Task 8 — Responsive Tables and Data Presentation

#### Phase 1 interpretation

Phase 1 has schedule data but does not require an HTML table. Render hours as a semantic list optimized for narrow screens.

#### Technical requirements

- Weekday and interval relationships remain understandable visually and to assistive technology.
- Split and overnight intervals wrap without losing association with the weekday.
- Future true tabular data must retain headers and relationships; it may use a documented scroll container or alternate stacked representation.

#### Verification

- Hours remain readable at 320 CSS pixels and 200% text zoom.
- Screen-reader smoke testing confirms weekday/interval association.

### Task 9 — Responsive Dialogs and Popups

#### Phase 1 status

No Phase 1 requirement needs a dialog or popup. External Call and Directions actions use native links without custom confirmation dialogs.

#### Inherited technical requirements

- Future dialogs use an accessible dialog primitive, focus trap, initial focus, Escape close where safe, focus restoration, viewport-contained sizing, and internal scrolling.
- Destructive flows require explicit confirmation behavior in their feature specification.

#### Verification

- Marked “not applicable to Phase 1 product surfaces.”
- Requirements become mandatory in the first PR introducing a dialog.

### Task 10 — Cross-Browser Responsive Compatibility

#### Technical requirements

- Run critical Phase 1 flows in Playwright Chromium, Firefox, and WebKit.
- Avoid unsupported browser APIs unless transpilation/polyfill policy explicitly covers them.
- Verify layout, fonts, navigation, images, map fallback, Call/Directions links, and hours presentation.
- Treat cosmetic antialiasing differences separately from functional or layout defects.
- Record manual iOS Safari and Android Chrome evidence for platform integrations.

#### Verification

- The browser matrix passes with no unresolved severity-one or severity-two defects.
- Any accepted browser-specific deviation is documented with user impact and fallback.

### Task 11 — Responsive Performance

#### Technical requirements

- Meet the shared Core Web Vitals targets: LCP ≤2.5 seconds, INP ≤200 milliseconds, CLS ≤0.1 at p75 when field data is available.
- Keep Phase 1 content server-rendered and minimize Client Components.
- Optimize hero and map loading; do not eagerly load below-the-fold embeds.
- Use font-display behavior that avoids invisible text and excessive layout shift.
- Enable response compression and immutable caching for versioned static assets.
- Prevent duplicate server/client API requests for the same render.
- Record repeatable mobile lab baselines in CI using the approved network/CPU profile.

#### Verification

- Performance results are stored as CI artifacts.
- A failing threshold or unapproved regression blocks completion.
- Bundle analysis confirms no unexplained large client dependency was introduced.

### Task 12 — Responsive QA and Validation

#### Technical requirements

- Run automated viewport, overflow, accessibility, and visual-regression tests across all Phase 1 routes.
- Run orientation checks for mobile and tablet viewports.
- Test JavaScript-disabled behavior for essential public content and native action links.
- Test slow image/API behavior, missing optional data, long content, and error boundaries.
- Complete manual keyboard, screen-reader smoke, iOS, and Android checklists.
- Associate defects and evidence with the affected PR-1–PR-3 acceptance criterion.

#### Verification

- Every Phase 1 page passes the required matrix.
- No unresolved serious/critical accessibility issue or high-impact responsive defect remains.
- Baseline screenshots are reviewed and stored as artifacts.

## 5. Visual regression policy

- Capture deterministic screenshots at 320×568, 768×1024, and 1440×900 for stable Phase 1 routes.
- Mask only nondeterministic data that cannot be controlled by fixtures.
- Snapshot updates require visual review; updating snapshots alone is not evidence of correctness.
- Browser-specific snapshots are used only when rendering differences are material.

## 6. Accessibility verification

Automated coverage must include:

- accessible names and roles;
- heading and landmark structure;
- common color-contrast checks;
- focusable controls and invalid ARIA;
- image alternatives.

Manual coverage must include:

- full keyboard navigation;
- visible focus;
- 200% zoom/text resize;
- screen-reader smoke test;
- reduced-motion preference;
- touch operation on supported mobile platforms.

## 7. PR-4 completion evidence

- design-token and breakpoint documentation;
- viewport/browser test matrix;
- overflow and long-content results;
- accessibility automated/manual report;
- Core Web Vitals lab baseline;
- visual regression artifacts;
- manual iOS/Android checklist;
- list of tasks correctly marked not applicable until later phases.

## 8. References

- [Phase 1 shared specification](README.md)
- [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Core Web Vitals thresholds](https://web.dev/articles/defining-core-web-vitals-thresholds)
- [Next.js image optimization](https://nextjs.org/docs/app/getting-started/images)
