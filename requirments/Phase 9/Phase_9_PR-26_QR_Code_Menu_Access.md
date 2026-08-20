# Phase 9 — PR-26. QR Code Menu Access

## Goal

Let a restaurant place a QR code (on tables, signage, or printed materials) that visitors scan with their phone camera to land directly on the menu section of the site — instead of the home page.

## Status

**Planned for a future phase.** This PR is not part of the MVP build order. It exists now so that Phase 1–2 (and later phases) do not make architectural choices that would block it. Tasks 1 and 5 describe foundation behavior that must already hold true during current development; Tasks 2–4 and 6–8 describe the feature work to be scheduled later.

---

# Task 1. Direct, Stable Menu URL (Foundation — applies now)

## Description

The menu must be reachable through its own permanent URL, independent of the home page, so that URL can later be encoded into a QR code.

### Requirements

- The menu page has its own route (e.g. `/menu`) distinct from the home page.
- The menu route renders correctly when loaded directly (deep link), not only via in-site navigation.
- The menu route does not require login, an active session, or prior navigation state.
- The menu route is server-rendered so it loads correctly on first hit, including on mobile browsers opened from a camera app.

### Acceptance Criteria

- Loading the menu URL directly, with no prior visit to the home page, shows the full menu.
- No authentication or session state is required to view the menu.
- Behavior is verified on mobile Safari/Chrome via a fresh, cookie-less load.

---

# Task 2. QR Code Generation (Future)

## Description

Allow the owner to generate a QR code image that encodes the restaurant's menu URL.

### Requirements

- Generate the QR code server-side or client-side from the restaurant's current menu URL.
- Regenerate correctly if the restaurant's domain/slug changes.
- Provide a preview of the QR code in the owner dashboard.

### Acceptance Criteria

- Owner can view a QR code that, when scanned, opens the correct menu page.
- QR code reflects the restaurant's actual live menu URL.

---

# Task 3. QR Code Download & Print (Future)

## Description

Let the owner export the QR code for physical use.

### Requirements

- Download as a high-resolution image (e.g. PNG/SVG) suitable for printing.
- Optionally provide a print-ready template (e.g. table tent, sticker) — nice-to-have, not required for MVP of this PR.

### Acceptance Criteria

- Downloaded QR code scans correctly when printed at typical table-tent/sticker sizes.

---

# Task 4. Landing Behavior (Future)

## Description

Ensure the scan-to-menu experience is fast and correct across devices.

### Requirements

- Scanning opens the menu page directly, not an intermediate redirect page, splash screen, or app-install prompt.
- Menu page loads within the same performance targets defined for Phase 8 (PR-23).
- Menu page is fully responsive (reuses Phase 1 PR-4 responsive baseline).

### Acceptance Criteria

- Scan-to-menu-visible time meets the site's existing performance budget.
- Works on iOS and Android default camera QR scanners without extra apps.

---

# Task 5. URL Stability Across Publishing (Foundation — applies now)

## Description

The URL encoded in a printed QR code must keep working indefinitely, even as menu content, prices, and dishes change.

### Requirements

- The menu URL is never regenerated or invalidated by routine content edits or publication events.
- Menu content updates are reflected at the same URL (per Phase 3/8 publishing behavior) rather than requiring a new URL per change.

### Acceptance Criteria

- A QR code printed today continues to resolve to the current menu after any number of future menu edits.

---

# Task 6. Multi-Restaurant Readiness (Future, depends on Phase 7)

## Description

Once multiple restaurants are supported, each restaurant's QR code must resolve only to its own menu.

### Requirements

- QR/menu URL resolution uses the same host/slug-based restaurant resolver introduced in Phase 7 (PR-20).
- No cross-restaurant leakage between QR codes.

### Acceptance Criteria

- Each restaurant's QR code opens that restaurant's menu only, verified with at least two restaurants configured.

---

# Task 7. Testing & Documentation (Future)

## Description

Validate the end-to-end scan experience and document it for owners.

### Requirements

- Manual and/or automated test scanning the generated QR code and confirming the correct page loads.
- Owner-facing help text explaining how to generate, download, and use the QR code.

### Acceptance Criteria

- Scan-to-menu flow is tested on real devices.
- Documentation exists for owners with no technical background (ties to Phase 8 PR-24 Ease of Use).

---

# Result

After Tasks 1 and 5 are respected during current development, and Tasks 2–4, 6, and 7 are completed in a future phase, the product will provide:

- A stable, directly linkable menu URL usable in a QR code from Phase 1 onward.
- Owner-generated, downloadable/printable QR codes linking straight to the live menu.
- A scan-to-menu experience with no login, redirect, or app-install friction.
- QR codes that keep working across menu edits and, later, across multiple restaurants.
