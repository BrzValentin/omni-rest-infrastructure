# PR-8 — Authentication Technical Specification

**Status:** Proposed

**Depends on:** Phase 0 and deployed same-origin routing

**Product source:** `requirments/Phase 3/Phase_3_PR-8_Authentication_Task_Breakdown.md`

## 1. Objective

Allow provisioned restaurant owners to authenticate securely, maintain a revocable session, access authorized administration routes, and log out. The design supports multiple owners and roles without exposing public registration in the MVP.

## 2. Authentication design

- ASP.NET Core Identity stores users, password hashes, lockout state, and security stamps in PostgreSQL.
- `restaurant_memberships` links user ID, restaurant ID, status, and role (`owner` initially).
- Authentication uses an encrypted `HttpOnly`, `Secure`, `SameSite=Lax` cookie scoped to the application.
- Cookie name uses the secure `__Host-` prefix in production, path `/`, and no Domain attribute.
- Session idle timeout: 30 minutes; absolute lifetime: 12 hours; sliding renewal cannot exceed the absolute lifetime.
- Data-protection keys persist in Azure storage and are protected by Key Vault for multi-instance operation.
- Login failures use Identity lockout plus ASP.NET rate limiting; values are configuration with a proposed baseline of 5 failed attempts/15 minutes and progressive endpoint throttling.
- No access or refresh token is stored in localStorage/sessionStorage.
- No public registration, password-reset, email-confirmation, or MFA UI is delivered by PR-8; extension points remain available.

## 3. Routes and contracts

- `GET /api/v1/auth/session` — current session summary or 401.
- `POST /api/v1/auth/login` — email, password, optional safe return path, antiforgery bootstrap convention.
- `POST /api/v1/auth/logout` — authenticated, antiforgery-protected, returns 204.
- `/admin/login` — anonymous-only login page.
- `/admin/*` — authenticated shell; feature endpoints additionally enforce membership/policy.

Login success rotates/signs in the Identity cookie and returns safe user/membership summary. Failure returns one generic message regardless of unknown email, wrong password, disabled account, or lockout where disclosure would aid enumeration.

## 4. Task specifications

### Task 1 — Authentication Architecture

- Implement Identity and membership EF Core models/migrations.
- Configure cookie authentication, authorization policies, antiforgery, Data Protection, forwarded headers, HTTPS/HSTS, rate limiting, and structured security events.
- Define `RequireOwner` and restaurant-membership policy handlers.
- Public routes remain anonymous; admin shell/endpoints default to authorization required.
- Validate configuration at startup and fail closed when production key/secrets settings are absent.
- Document session lifecycle, provisioning, disable/revoke, and future-role extension.

### Task 2 — Login Page UI

- Build `/admin/login` with email, password, submit, loading, and generic error region.
- Use native labelled inputs, correct autocomplete values, password visibility control only if accessible, and no password persistence in application state/logs.
- Preserve a validated same-origin relative return path.
- Authenticated visitors are redirected to the admin landing page.
- Meet responsive/WCAG standards and prevent duplicate submissions.

### Task 3 — Login Validation

- Client validation provides immediate required/email feedback but never replaces server validation.
- Server trims/normalizes email according to Identity rules; password is not trimmed or normalized.
- Enforce request size/shape limits.
- Validation failures and credential failures are distinguishable internally but safely generic externally where needed.
- Test whitespace, Unicode email, malformed input, empty password, oversized values, and duplicate submission.

### Task 4 — Authentication Service

- Use Identity `UserManager`/`SignInManager`; do not implement custom password hashing.
- Authenticate only active users with at least one active restaurant membership.
- Rotate session/security context at sign-in.
- Emit structured success/failure/lockout metrics without credentials.
- Return 429 when endpoint rate limit applies and generic 401 for invalid authentication.
- Provisioning command is separate, auditable, and unavailable publicly.

### Task 5 — Session Management

- Configure idle and absolute lifetime from section 2.
- Validate security stamp periodically and immediately reject disabled/revoked users according to policy.
- `GET /session` returns minimal user ID/display, memberships/roles needed by UI, and expiry information; no cookie/token value.
- Refresh restores server session state after page reload without storing secrets client-side.
- Expiry causes API 401 and admin navigation to safe login with return path.

### Task 6 — Route Protection

- Enforce protection in Next.js server/admin layout for UX and in ASP.NET endpoints for security.
- UI middleware/layout checks cannot be the only authorization control.
- Safe return paths must start with `/admin` and reject schemes, hosts, backslashes, encoded bypasses, and protocol-relative paths.
- Authenticated users visiting login are redirected safely.
- Test direct URL, browser navigation, API call, forged client state, and cross-restaurant membership.

### Task 7 — Logout

- Use POST, not GET, and require antiforgery.
- Call Identity sign-out, expire cookie, and invalidate relevant client cache/state.
- Redirect UI to login/public destination after confirmed response.
- Back navigation or refresh must not restore protected data; admin responses use private/no-store caching.
- Test logout, repeated logout, expired session, back/refresh, and concurrent tabs.

### Task 8 — Authentication Error Handling

- Use generic invalid-credential messaging.
- Distinguish validation, network, throttling, service failure, and expired session through safe problem codes.
- Keep entered email when safe; clear password after failure.
- Do not expose stack traces, database errors, account existence, lockout timing detail, or membership detail.
- Provide correlation ID for unexpected supportable failures.

### Task 9 — Security Hardening

- Never log passwords, cookies, antiforgery tokens, or complete login bodies.
- Require HTTPS and HSTS outside development.
- Apply CSP/frame-ancestor/referrer/content-type protections at the web/edge layer.
- Validate antiforgery on state changes and same-origin assumptions in deployment tests.
- Persist/protect Data Protection keys.
- Test credential stuffing throttles, enumeration resistance, CSRF rejection, session fixation, revoked membership, cookie attributes, and open redirects.
- Run dependency and secret scanning in CI.

### Task 10 — Testing

- Unit-test return-path and authorization policy logic.
- PostgreSQL integration-test Identity/membership migrations and provisioning.
- `WebApplicationFactory` test login success/failure/lockout, session, expiry, logout, antiforgery, rate limit, security stamp, and protected endpoints.
- Playwright test responsive login, validation, refresh persistence, redirect, logout, back button, and mobile layout.
- Complete a manual security checklist and record cookie/header evidence.

## 5. Provisioning and recovery

MVP owners are provisioned by a controlled CLI/administrative job using one-time secret delivery outside application logs. The first login may require password change if the selected Identity flow supports it. Account recovery, email verification, and MFA require a subsequent approved specification before production risk review can declare them unnecessary or implement them.

## 6. Completion evidence

- Identity/membership migration;
- configuration/cookie/header evidence;
- auth integration and browser results;
- CSRF/rate-limit/enumeration tests;
- provisioning runbook;
- security review checklist;
- mapping of all ten source tasks.

## 7. References

- [Phase 3 shared specification](README.md)
- [ASP.NET Core Identity](https://learn.microsoft.com/aspnet/core/security/authentication/identity)
- [ASP.NET Core antiforgery](https://learn.microsoft.com/aspnet/core/security/anti-request-forgery)
