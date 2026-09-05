# Bug Report — Phase 1

> **For the AI agent:** Each issue below is self-contained. Work them one at a time, in the order listed. For every issue: locate the responsible code, apply the fix, and verify against the **Acceptance criteria**. Do not refactor beyond the scope of the issue. If a fix requires a decision not specified here, stop and ask instead of guessing.

## Context

| Field | Value |
|---|---|
| Phase | 1 |
| Scope | PR1, PR2 + general UI issues |
| Total issues | 9 |
| Blockers | BUG-003 (map not rendering), BUG-006 (cannot add social link) |

---

## PR1

### BUG-001 — Missing "About Us" section

- **Task:** 1.1
- **Area:** Home page / landing content
- **Type:** Missing feature
- **Severity:** High

**Current behavior**
The "About Us" section does not exist anywhere on the page.

**Expected behavior**
An "About Us" section is rendered as part of the page, per the Task 1.1 spec.

**Acceptance criteria**
- [ ] An "About Us" section exists and is visible on the page.
- [ ] It is populated from the same data source as the rest of the page content (not hardcoded), unless the spec says otherwise.
- [ ] It is responsive and matches the styling of surrounding sections.

**Open question for the requester**
- Exact placement, heading text, and content fields are not specified in the report. Confirm before implementing if not defined in the Task 1.1 spec.

---

### BUG-002 — Mock data is incomplete

- **Task:** 1.2
- **Area:** Mock data / fixtures
- **Type:** Incomplete data
- **Severity:** Medium

**Current behavior**
Mock data is not fully provided, so parts of the UI render empty or with placeholder gaps.

**Expected behavior**
Mock data covers every field consumed by the UI, so all sections render fully populated.

**Acceptance criteria**
- [ ] Every field the UI reads has a corresponding value in the mock dataset.
- [ ] No section renders blank, `undefined`, or `null` when running against mock data.
- [ ] Mock data includes the fields needed by BUG-001 ("About Us"), if that section is data-driven.

---

## PR2

### BUG-003 — Map is not displayed

- **Task:** 2.9
- **Area:** Map component
- **Type:** Rendering failure
- **Severity:** **Blocker**

**Current behavior**
The map does not render at all.

**Expected behavior**
The map renders and displays the correct location.

**Investigation checklist**
1. Console and network errors on the page containing the map.
2. Map provider API key — present, valid, correctly scoped, and referrer/domain-allowed.
3. Container element has a non-zero height (a common cause of a blank map).
4. Map library is initialized after the container is mounted in the DOM.
5. Coordinates/address passed to the map are valid and non-null.

**Acceptance criteria**
- [ ] Map renders on load with no console errors.
- [ ] Correct location/marker is shown.
- [ ] Map is responsive and renders on mobile widths.

---

## Other / General

### BUG-004 — Stray input field overlaps the Remove button in Special Hours

- **Area:** Special Hours section (editor form)
- **Type:** UI defect
- **Severity:** High
- **Attachment:** `Pasted image 20260819200057.png`

**Current behavior**
In the special-period editor row, the right-hand **Note** input field renders on top of the **Remove** button for that period. In the screenshot, the row reads:

`Date [mm/dd/yyyy] · [ ] Closed all day · Opens [09:00 AM] · Closes [05:00 PM] · Note [__________]`

The Remove button is visible only as a grey rectangle peeking out from behind the top-left corner of the Note input (directly under the "Note" label). The Note field is not wanted here and it makes the Remove button unclickable.

**Expected behavior**
The Note input field is removed from the special-period row. The Remove button is fully visible and clickable.

**Acceptance criteria**
- [ ] The Note input no longer renders in the special-period editor row.
- [ ] The Remove button is fully visible, not overlapped by any other element, and clickable at all viewport widths.
- [ ] Removing a special period still works correctly after the change.
- [ ] No leftover empty space or broken alignment where the Note field used to be.
- [ ] The data model / API payload is unchanged (UI-only removal).

**Scope — confirmed**
Remove the Note field **from the UI only**. Do **not** change the underlying data model, database schema, or API payload — the `note` field stays intact server-side.

**Related observation (see BUG-005)**
The same screenshot shows the saved entry rendered as `2026-08-18 — 09:00–17:00` (24-hour) while the editor inputs show `09:00 AM` / `05:00 PM` (12-hour) — the display and the editor are inconsistent.

---

### BUG-005 — Working hours use 24-hour format instead of 12-hour (AM/PM)

- **Area:** Working hours display (regular + special hours)
- **Type:** Formatting
- **Severity:** Medium

**Current behavior**
Hours are displayed in 24-hour format (e.g. the saved special-hours entry renders as `2026-08-18 — 09:00–17:00`), even though the editor's own time inputs use 12-hour format (`09:00 AM` / `05:00 PM`).

**Expected behavior**
Hours are displayed in 12-hour format with AM/PM (e.g. `5:00 PM`).

**Implementation notes**
- Apply the change to **display only**; keep the stored/underlying values in their existing format.
- Apply consistently everywhere hours appear: regular hours, special hours, admin/editor previews, and the public site.

**Acceptance criteria**
- [ ] All displayed times use `h:mm AM/PM`.
- [ ] Midnight and noon render correctly (`12:00 AM`, `12:00 PM`).
- [ ] Stored data and API payloads are unchanged.

---

### BUG-006 — Cannot add a second social media link (URL validation too strict)

- **Area:** Social links / URL validation
- **Type:** Validation bug
- **Severity:** **Blocker**

**Current behavior**
Adding a second social media link fails with:

> `Use an approved HTTPS URL for this platform.`

**Reproduction**
1. Add one social media link. It saves successfully.
2. Attempt to add a second link using:
   `https://www.facebook.com/profile.php?id=100073564902779`
3. The validation error above is shown and the link is not saved.

**Expected behavior**
The URL above is a valid Facebook profile URL and must be accepted. Multiple social links can be added.

**Investigation checklist**
1. Is the failure caused by the **URL pattern** (query string `?id=` / `profile.php` path not matched by the platform regex) or by the **count** (only one link supported)? Test both independently.
2. Review the per-platform URL validation rules — they likely only allow vanity paths like `facebook.com/<name>` and reject `profile.php?id=<numeric>`.
3. Confirm the validator preserves query strings and does not strip/normalize them before matching.

**Acceptance criteria**
- [ ] `https://www.facebook.com/profile.php?id=100073564902779` is accepted.
- [ ] Both vanity-name and numeric-ID profile URLs are accepted for each supported platform.
- [ ] Two or more social links can be added, saved, and displayed.
- [ ] Genuinely invalid URLs (non-HTTPS, wrong domain) are still rejected with the same message.

---

### BUG-007 — Expired special hours remain visible on the website

- **Area:** Special Hours — public site display
- **Type:** Logic bug
- **Severity:** High

**Current behavior**
Special hours continue to be displayed on the website after the special period's end date has passed.

**Expected behavior**
A special hours entry automatically stops being displayed once its specified period has ended.

**Implementation notes**
- Filter by end date/time at render (and/or query) time so no manual cleanup is required.
- Define and apply the correct timezone consistently — the business's local timezone, not the viewer's or the server's UTC clock.

**Acceptance criteria**
- [ ] A special period whose end date is in the past is not displayed.
- [ ] A period ending today is still displayed until the end of that day (local business time).
- [ ] Future and currently-active periods are unaffected.
- [ ] The record itself is not deleted — only hidden from display (unless the spec says otherwise).

---

### BUG-008 — Menu button does not toggle to Home on the Menu tab

- **Area:** Navigation
- **Type:** Missing behavior
- **Severity:** Medium

**Current behavior**
While on the Menu tab, the navigation button still reads "Menu" and does not navigate back Home.

**Expected behavior**
When the Menu tab is active, the "Menu" button becomes a "Home" button and navigates to the Home page.

**Acceptance criteria**
- [ ] On the Menu page, the button label reads "Home".
- [ ] Clicking it navigates to the Home page.
- [ ] On the Home page (and all other pages), the button reverts to "Menu" and navigates to the Menu page.
- [ ] Label/behavior stays correct after browser back/forward navigation and on direct page load of the Menu route.

---

## Suggested order of work

1. BUG-006 — blocker, validation
2. BUG-003 — blocker, map rendering
3. BUG-004 — blocking interaction (Remove button unclickable)
4. BUG-007 — incorrect public-facing data
5. BUG-001 — missing section
6. BUG-002 — mock data (unblocks verification of BUG-001)
7. BUG-005 — time formatting
8. BUG-008 — navigation toggle

## Notes / gaps in the original report

- No environment details were provided (browser, OS, build/commit, staging vs. local). Ask if a fix cannot be reproduced.
- No repo paths or component names were provided; the agent must locate them.
- BUG-004's screenshot was reviewed and its contents are described inline in that issue.
