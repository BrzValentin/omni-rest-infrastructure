# PR-9 — Restaurant Information Management Technical Specification

**Status:** Proposed; product approval required for reconstructed Tasks 3–14

**Depends on:** PR-8, Phase 1 restaurant/scheduling/media foundations

**Product source:** `requirments/Phase 3/Phase_3_PR-9_Restaurant_Information_Management.md` and main PRD PR-9

## 1. Requirement gap

The source file ends after Task 2 with a placeholder saying Tasks 3–14 continue elsewhere. Their authoritative wording is unavailable. Tasks 1–2 below map directly to the file. Tasks 3–14 are a proposed product-to-technical reconstruction from the PRD fields, PR-9 goal, architecture, and existing Phase 1 specifications. They must be reviewed as product scope before implementation.

## 2. Objective

Allow an authenticated owner to view and edit their restaurant name, description, phone, address, email, regular hours, special hours, supported social links, and main image. Valid changes automatically enter the publication pipeline and become visible through the public projection.

## 3. Management API

- `GET /api/v1/admin/restaurant` — owner-editable draft model and concurrency version.
- `PUT /api/v1/admin/restaurant/profile` — name, description, phone, email, address.
- `PUT /api/v1/admin/restaurant/regular-hours` — complete replacement of validated weekly intervals.
- special-hours endpoints reserved in PR-3.
- `PUT /api/v1/admin/restaurant/social-links` — complete supported-link set.
- media upload/selection endpoints from Media module.
- `GET /api/v1/admin/restaurant/preview` or signed preview route — non-indexable draft preview.
- `GET /api/v1/admin/publication-status/{operationId}` — pending/succeeded/failed status when publication is asynchronous.

Restaurant identity comes only from the active membership. Every mutation requires antiforgery, owner policy, concurrency version, validation, transaction, audit event, and idempotent publication request.

## 4. Task specifications

### Task 1 — Restaurant Information Data Model (authoritative)

- Reuse/extend normalized Phase 1 `restaurants`, address, regular-hours, special-hours, social-link, settings, and Media entities.
- Do not create duplicate social columns or store a main image as an unmanaged URL; reference `media_asset_id`.
- Preserve timestamps, concurrency tokens, restaurant IDs, and public projection versions.
- Migrations preserve existing Phase 1/2 data and create any required draft/publication metadata.
- Test optional fields, relationships, upgrade, and public snapshot compatibility.

### Task 2 — Restaurant Information API (authoritative)

- Implement admin read/update contracts from section 3.
- Require active owner membership and derive restaurant context server-side.
- Return separate editable DTOs, validation codes, concurrency version, and publication status.
- Use Problem Details with 400 validation, 401 unauthenticated, 403 unauthorized, 409 concurrency/duplicate conflict, and safe 404 behavior.
- Integration-test successful owner access, anonymous rejection, wrong-restaurant denial, invalid input, and stale version.

### Task 3 — Profile Validation (proposed)

- Reuse Phase 1 phone/email/address/timezone/social validators.
- Enforce name 1–120, description 1–300, supported address/country rules, paired coordinates, and safe HTTPS URLs.
- Server validation is authoritative; client displays localized field errors.
- Test whitespace, boundaries, malformed Unicode/URLs, and cross-field rules.

### Task 4 — Owner Profile Editor UI (proposed)

- Build `/admin/restaurant` using accessible labelled fields and server-loaded draft data.
- Separate logical sections while providing one clear save status.
- Track dirty state, warn before accidental navigation, prevent duplicate submission, and preserve safe values after validation failure.
- Show concurrency conflict with reload/reapply guidance rather than overwriting.
- Component/browser-test keyboard, responsive, validation, save, cancel/reload, and conflict behavior.

### Task 5 — Regular Hours Editor (proposed)

- Edit zero/multiple intervals per weekday, split service, overnight close, copy-to-days, and closed days.
- Submit a complete replacement with concurrency version in one transaction.
- Display overlap/invalid-duration errors beside the affected interval.
- Preview uses the same schedule calculator as public status.
- Test closed, split, overnight, copy, overlap, timezone, and keyboard operation.

### Task 6 — Special Hours Editor (proposed)

- Activate the PR-3 deferred owner UI and admin endpoints.
- Support date range listing, add/edit/delete, closed dates, split/overnight intervals, notes, and concurrency.
- Show effective regular schedule for context without mutating it.
- Test precedence, duplicate dates, deletion confirmation, authorization, and preview/publication.

### Task 7 — Social Links Editor (proposed)

- Support Instagram, Facebook, TikTok, and Google Business Profile per the PRD.
- Use platform-specific URL validation and one row per platform.
- Empty value removes the draft link after confirmation if needed.
- Show a safe external preview; do not embed social feeds.
- Test valid/invalid hosts, duplicates, removal, ordering, and public projection.

### Task 8 — Main Image Management (proposed)

- Use Media staged upload, server-authorized short-lived upload, actual-file validation, processing, variants, and alt-text metadata.
- Restrict image type, decoded dimensions, and byte size through Media configuration defined before implementation.
- Do not publish an unprocessed/failed image.
- Replacing/removing an image is recoverable during retention and does not orphan blobs.
- Test ownership, malicious/mismatched content, processing failure, replacement, removal, alt text, and public variants.

### Task 9 — Draft Preview (proposed)

- Provide a signed/authenticated, non-indexable preview of the current owner's draft using public components.
- Preview must never be cached publicly or accessible by guessing IDs.
- Display a persistent Preview banner and block canonical/sitemap inclusion.
- Draft and published views can be compared without leaking another restaurant's data.
- Test authentication, tenant isolation, no-store/noindex headers, and visual parity.

### Task 10 — Automatic Publication (proposed)

- Successful save invokes the architecture's common publish command; do not build a second publication system.
- Publication creates an immutable restaurant public snapshot and outbox event.
- API reports pending/succeeded/failed accurately; the UI does not claim public success until confirmed.
- Public API updates on completed publication; web/edge revalidation targets 60 seconds.
- Failed publication preserves the last valid public version and supports idempotent retry.
- Test atomic snapshot, failure, retry, cache invalidation, and no partial public update.

### Task 11 — Concurrency and Data Integrity (proposed)

- Require ETag/version on every owner mutation.
- Return 409 with safe current-version information on stale update.
- Whole-schedule/social replacements are transactional.
- Publication references the exact draft version saved by the operation.
- Test parallel edits, stale tabs, retry, partial failure, and duplicate submission.

### Task 12 — Error and Recovery Experience (proposed)

- Distinguish validation, authorization, concurrency, upload processing, publication, network, and unexpected failures with stable problem codes.
- Preserve unsaved form data where safe.
- Provide retry only for idempotent/recoverable operations.
- Log correlation IDs and operation/publication IDs without sensitive content.
- Browser-test offline/network failure, API failure, publication failure, and recovery.

### Task 13 — Authorization, Audit, and Security (proposed)

- Apply owner policy at every admin endpoint and resource boundary.
- Validate antiforgery and same-origin routing.
- Audit profile, hours, special hours, social, image, and publication changes with actor, restaurant, action, timestamp, and entity/version IDs; do not log secrets or full file contents.
- Prevent cross-restaurant identifiers in URLs/bodies from changing server-derived context.
- Test ID manipulation, revoked membership, CSRF, unsafe URLs/files, and log redaction.

### Task 14 — Integration and End-to-End Validation (proposed)

- Test owner login → edit every supported field → validate → save → preview → automatic publish → public verification.
- Cover concurrent edit, failed media, failed publication, cache invalidation, logout, and cross-restaurant denial.
- Verify public components show exactly the published values and preserve Phase 1 accessibility/responsiveness.
- Record publication timing against the proposed target.
- Map tests to the PRD fields and mark reconstructed product scope approval.

## 5. Publication and cache consistency

The normalized draft and immutable public snapshot are separate. A save can succeed while publication is pending; this state must be visible. Public API and Next.js cache keys include publication version. Outbox processing retries safely, and the previous public snapshot remains active until the new snapshot is complete.

## 6. Completion gate

PR-9 cannot enter implementation until product ownership approves or replaces proposed Tasks 3–14. Technical review alone cannot manufacture missing product requirements.

Required evidence after approval includes migrations, OpenAPI, authorization matrix, UI tests, schedule/media/publication tests, audit evidence, and a complete end-to-end publication report.

## 7. References

- [Phase 3 shared specification](README.md)
- [PR-8 Authentication](pr-8-authentication.md)
- [PR-3 Special Hours](../phase-1/pr-3-special-operating-hours.md)
