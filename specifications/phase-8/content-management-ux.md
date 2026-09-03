# Phase 8 — Content Management UX

**Requirement:** PR-24 Task 1. **Status:** Implemented. Four of twelve PR-24 tasks were already complete
before Phase 8.

The goal is that a restaurant owner with no technical knowledge can manage the common content without
contacting a developer.

## 1. Navigation and section structure

One portal serves exactly one restaurant. There is no restaurant switcher and no cross-restaurant
administration — Phase 7 Ruling 3.

| Nav item | Route | Owns |
|---|---|---|
| My Restaurant | `/admin/restaurant` | Profile, contact, website, address, regular hours, special hours, social links, main image, logo, cover image, publication status |
| My Menu | `/admin/menu` | Categories: create, rename, reorder, delete |
| My Dishes | `/admin/menu/dishes` | Dishes: create, edit, **inline price**, availability, reorder, delete, **name filter** |
| My Gallery | `/admin/gallery` | Photos: upload, drag-and-drop, replace, alt text, caption, visibility, reorder, delete |
| My Hours | `/admin/restaurant#hours-title` | Anchor into the restaurant page — see §2 |
| Preview | `/admin/restaurant/preview` | Draft preview before publication |
| Design | `/admin/design` | Website design selection |
| My QR Code | `/admin/qr-code` | Added in Phase 9 (PR-26). Read-only: the menu QR code, its address, and the SVG/PNG downloads — see `specifications/phase-9/` |

### Ruling — hours are an anchor, not a separate page

PR-24 Task 4 names a "Restaurant Hours Editor" as though it were a page. The shipped design places hours
inside the restaurant profile and links the nav to an anchor.

Task 1's criterion "no page contains unrelated settings" arguably pushes toward splitting
`/admin/restaurant`, which currently holds profile, contact, address, both hour editors, social links,
three image slots and publication. **The current grouping is recorded as intentional and the split
deferred.** It would be a larger, higher-conflict change than the rest of PR-24 combined, and it is a
product-owner call rather than a polish-phase one. What matters for the requirement — that an owner can
find and edit hours without documentation — is satisfied by the nav entry.

## 2. What was already true before Phase 8

Stated so this document is not mistaken for a description of new work. The opening hypothesis that hours
were the largest gap was **wrong**:

- **Regular hours** ship end to end: per-day fieldsets, closed days, multiple intervals, a
  copy-to-weekdays action, and server-side validation covering duplicate days, malformed times, zero-length
  intervals, overlaps, and overnight ranges.
- **Special hours** ship end to end: date picker, closed-all-day, custom intervals, notes, edit and delete
  with a focus-trapped confirmation, future scheduling, and override of regular hours in the computed
  public status with source attribution.
- **Contact information** was editable except for one field, and **social links** were editable with a
  per-platform host allow-list.
- **Photo management** had upload, delete, alt text, captions, visibility, reorder, automatic thumbnail
  optimisation, and content-sniffed format validation.
- **Every admin mutation was already audited.**
- **Publishing was already automatic on save.**

## 3. Gaps Phase 8 closed

| Gap | Why it mattered |
|---|---|
| **`WebsiteUrl` did not exist** in the schema at all | The only genuinely missing contact field; the only migration in PR-24 |
| **The dish price endpoint was never called** | `PATCH /dishes/{id}/price` shipped fully implemented, audited and integration-tested, but the UI only ever PATCHed the whole dish. Task 2 was wiring, not construction |
| **No way to find a dish** | With no filter, "update a price in under 30 seconds" is not reachable on a real menu |
| **Unsaved-changes warning existed in one editor of four** | Three editors could silently discard work |
| **A 401 mid-save showed "try again"** | An expired session is not a retryable error; retrying always fails |
| **No retry after a failed save** | Retry existed only for failed *publication* |
| **Drag-and-drop only reordered** | Dropping a file from the desktop did nothing |
| **No photo replace** | Only delete-then-upload |
| **Duplicate special date returned an opaque conflict** | "The change conflicts with the current restaurant data" does not tell an owner which date is duplicated |
| **Technical vocabulary in owner-facing labels** | "Phone (E.164)", a free-text IANA time zone, "Draft {version}", raw publication states |

## 4. UX guidelines

These describe the shipped conventions; new editors are expected to follow them.

**Structure.** Every editable field belongs to exactly one section. Each section has its own Save. Related
fields are adjacent; nothing requires scrolling past unrelated settings to complete one task.

**Language.** No error codes, HTTP statuses, internal state names, or standards references in owner-facing
text. "Phone number (with country code)", not "Phone (E.164)". "Website updating now", not `processing`.
"Last saved", not "Draft 47". Where a value must be technical (an IANA time zone), the control chooses for
the user rather than asking them to type it — while preserving an off-list existing value as its own
option so no configuration is silently destroyed.

**Touch and mobile.** Every interactive control is at least 44 px tall. Grid layouts collapse to a single
column below 48 rem.

**Validation.** Server-side rules are authoritative and hand-rolled on both sides against a shared
error-code vocabulary. Validation errors render **beside the field they concern**, with `aria-invalid`,
`aria-describedby`, and a focus-managed summary. Entered data is always preserved. *A schema-validation
library was deliberately not introduced* — it would fork the architecture and duplicate the backend's
authoritative rules.

**Save, cancel, confirmation.** Every editor has Save. Destructive actions confirm through one shared
focus-trapped `role="alertdialog"`. Submit controls disable while in flight, which is what prevents
duplicate saves. Navigating away from unsaved edits warns — both on page unload and on in-app header
navigation.

**Failure.** Each failure kind gets its own treatment: validation shows fields; a conflict offers reload;
an expired session offers sign-in; anything else offers "Try again". See `error-handling.md` §2.

**Feedback.** Success and failure both announce through `role="status"` / `role="alert"` live regions.
Publication state is shown in plain words and polled until it settles.

## 5. Shared components

Extracted in Phase 8 from code that had been duplicated four times:

| Component | Replaces |
|---|---|
| `ConfirmDialog` | Four near-identical focus-trapped dialogs |
| `FieldError` + `fieldErrorHelpers` | Four copies of `fieldA11y` / `errorFor` |
| `DraftStatusBar` | Four hand-rolled status bars; owns plain-language publication wording, the sign-in link, and the retry control |
| `useUnsavedChanges` | The single `beforeunload` guard, now shared, with a module-level counter so the header can ask about unsaved edits from a different React tree |
| `AdminNavLink` | Header links that confirm before abandoning unsaved edits |

A fifth dialog remains in `DesignSelector`. It differs materially — Escape and Cancel disabled while
publishing, a primary rather than destructive confirm, a label that swaps to "Publishing…" — so it was
left rather than widening the shared component's prop surface for one caller.

## 6. Verification

Component tests cover inline price editing (asserting exactly one request to the price endpoint, not a
whole-dish PATCH), the dish filter, the website field, the time-zone select including off-list preservation,
unsaved-changes guards, 401 session expiry, retry after failure, the gallery drop zone and photo replace,
and the shared dialog and field-error primitives.

`e2e/admin-tasks.spec.ts` is the PR-24 Task 12 substitute — see `README.md` Ruling 6 for what it does and
does not prove. **It has never been executed**; Playwright cannot run in this environment.

## 7. Outstanding

- **The ≥95 % success rate and user-satisfaction targets require a human study.** They are not estimated
  and not claimed.
- **Photo replace is unavailable on a full 50-photo gallery.** The gallery update endpoint has no
  `mediaAssetId` field, so replacement is upload → delete → reorder, which needs one free slot. That order
  is deliberate: it guarantees the owner never loses the old photo if a step fails. Adding `mediaAssetId`
  to the update request would make it a single atomic PATCH.
- **Splitting `/admin/restaurant`** into contact / hours / images — deferred, see §1.
- `csrf_invalid` copy still reads slightly technical.
