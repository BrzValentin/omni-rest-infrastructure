# Phase 3 Frontend Implementation Evidence

**Implementation base:** `46db811`

**Scope:** `src/frontend/**` and frontend-specific Phase 3 documentation. No Phase 4 menu-management UI or deployment action is included.

## Acceptance mapping

| Criterion | Frontend implementation | Automated evidence |
| --- | --- | --- |
| A2 owner authentication | Same-origin API proxy with explicit request-header allowlisting and deployment-owned forwarding metadata; antiforgery client; email/password form with browser validation, password visibility control, pending state, generic credential errors, throttling/network/service messages, exact safe admin path/query return, server-guarded admin route group, and confirmed logout before redirect | `LoginForm.test.tsx`, `LogoutButton.test.tsx`, `auth-contract.test.ts`, `proxy.test.ts`, real authenticated Playwright journey |
| A3 restaurant management | Independently saved profile/address/contact/coordinate fields; localized backend field-error summary plus field/group inline errors with `aria-invalid`/descriptors, first-error focus, preserved input, and exact hours/special/social mappings; E.164 validation; seven-day closed/split/overnight hours and Monday-to-weekday copy; special-hours create/edit/delete with a portal alert dialog, safe Cancel focus, trapped Tab/Shift+Tab, Escape, inert/hidden background, and trigger-focus restoration; social links; ready-media picker, multipart upload, alt-text editing, selection/removal; unsaved-change warning; ETag conflict preservation; publication status prop resynchronization, polling, and retry | focused `RestaurantEditor.test.tsx` accessibility/keyboard cases, `browser-api.test.ts`, and real PostgreSQL/Kestrel/Next Playwright keyboard journey against an actual special-hours row |
| A4 preview and public profile | Authenticated draft preview with a persistent draft banner, `noindex` metadata, contact/address/hours/special-hours/social/image presentation, and public home projection from the published restaurant endpoint | `RestaurantPreview.test.tsx`, Playwright draft preview and server-rendered public contact journey |
| A5 telephone policy | `buildTelUri` is the only raw telephone URI construction point; it accepts strict E.164 only. `PhoneLink` and `CallButton` are native anchors, use the canonical number in `href`, keep display formatting visible, omit invalid/missing values, and provide 44-pixel targets. The public home and preview use these shared components. | `phone.test.ts`, `PhoneLink.test.tsx`, `phone-static-audit.test.ts`, no-JavaScript Playwright assertion |
| A6 frontend verification | Vitest unit/component tests, Testing Library interactions, axe scans, raw URI static audit, coverage thresholds, Next lint/type-check/build, and Playwright against the production build | exact commands and results below |

## Verification results

Run from `src/frontend`:

```sh
npm run lint
npm run typecheck
npm test
npm run test:coverage
npm run build
npm run test:e2e
```

The final local results were:

- ESLint: passed with zero warnings.
- TypeScript: passed with no errors.
- Vitest: 62 tests passed across 14 files.
- V8 coverage: 84.40% statements, 77.27% branches, 83.59% functions, and 89.12% lines; all configured thresholds passed.
- Next.js production build: passed.
- Playwright: 11 tests passed; 24 project-specific skips were intentional. The existing public menu matrix ran against the seeded PostgreSQL backend. Phase 3 owner authentication/editing used the deterministic test proxy, while the public telephone test verified server HTML with JavaScript disabled.
- Real-stack Playwright: 1 comprehensive scenario passed against a fresh ephemeral PostgreSQL 18 database, applied EF migration, guarded seed, controlled owner provisioning, real Kestrel API, and real Next production server. It verifies deep-link login return, all supported fields, an actual-row destructive-dialog keyboard flow and background isolation, actual image upload, cross-tenant denial, draft/public exact values, accessibility, logout, back navigation, and protected refresh.
- Dependency audit: `npm audit --audit-level=high` reported 0 vulnerabilities.

## Manual verification

For a local full-stack check, run the backend and then:

```sh
cd src/frontend
OMNI_REST_API_BASE_URL=http://127.0.0.1:5279 npm run dev
```

Open `http://menu.localhost:3000/` for the public site or `http://menu.localhost:3000/admin/login` for the owner portal. Provision an owner first using the controlled backend procedure.

For the isolated full-stack acceptance fixture, with Docker available and the frontend production build present:

```sh
cd src/frontend
npm run test:e2e:real
```

## Explicit limitations and unverified evidence

- Physical iPhone Safari and Android Chrome dialer launch behavior remains unverified. Automated tests verify native anchor markup, strict URI construction, server HTML without JavaScript, and touch target sizing.
- The deterministic multi-browser suite retains a same-origin API fixture for breadth; the separate real-stack scenario verifies credentials, cookies, antiforgery, authorization, media bytes, persistence, publication, and rendering without mocked application APIs.
- Deployed cache timing, production identity/cookie configuration, and physical-device behavior require staging or device evidence. No deployment was performed.
