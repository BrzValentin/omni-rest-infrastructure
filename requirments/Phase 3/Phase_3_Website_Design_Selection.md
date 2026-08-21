# Phase 3 — Website Design Selection

## Goal

Allow a restaurant owner to change the appearance of the public website independently by selecting from approved, predefined designs.

The experience must make design changes easy to explore while protecting the currently published website from accidental or failed changes.

## User Story

As a restaurant owner, I want to preview my restaurant in different approved designs and publish the design I prefer so that I can update the appearance of my website without developer assistance.

## Product Scope

The management area provides a dedicated **Design** section containing the designs currently available to the restaurant.

The initial catalog contains:

- Quiet Elegance
- Nightfall
- Broadsheet
- Sunroom

The catalog may grow in future releases.

Each design presents the same supported restaurant information, menu content, and customer actions. Designs may arrange and style that content differently.

## Owner Experience

The owner can:

- open the Design section from the management area;
- identify the design currently used by the public website;
- browse the available predefined designs;
- select a design for preview without changing the public website;
- preview the selected design using the restaurant's own draft information and menu;
- compare desktop and mobile presentation;
- cancel the selection and leave the published website unchanged;
- apply and publish the selected design after an explicit confirmation;
- see whether publication is in progress, successful, or unsuccessful;
- open the public website after successful publication; and
- select another available design later, including a previously used design.

## Design Consistency

Changing design must preserve the restaurant's supported content and behavior, including:

- restaurant name and description;
- contact information and address;
- regular and special operating hours;
- social links;
- restaurant and dish images;
- menu name, categories, dishes, prices, availability, and badges;
- menu category selection;
- Call and Directions actions; and
- required notices and accessibility information.

If a design contains an optional section for which the restaurant has no content, the website must omit that section without showing broken controls or placeholder copy.

## Publication and Safety

- Selecting a design for preview does not change the public website.
- The owner must explicitly confirm before publishing a different design.
- The management area clearly distinguishes the previewed design from the published design.
- The public website changes only after publication succeeds.
- If publication fails, the last successfully published design remains active.
- The owner receives a clear result and a safe retry option after a failed publication.
- The selected public design does not change the appearance or usability of the management area.

## Design Availability and Releases

- Restaurant owners can switch between designs that are already available without developer assistance, a website restart, or a new deployment.
- Adding a new design requires a product release before owners can select it.
- Adding a new version of an existing design must not unexpectedly alter restaurants using the previous version.
- A restaurant may remain on its current design version until the owner chooses another available version.
- A design that is no longer offered to new restaurants must continue to work for restaurants already using it until a supported replacement path is provided.

## Out of Scope for This Phase

- Free-form page building
- Owner-provided website code
- Owner-provided HTML or style rules
- Editing the internal structure of a predefined design
- Custom fonts, colors, spacing, or layout controls
- Importing third-party themes
- A third-party design marketplace

These capabilities may be considered separately after predefined design selection is validated.

## Acceptance Criteria

1. The authenticated owner can open a Design section in the management area.
2. The currently published design is clearly identified.
3. All designs available to the restaurant are presented with a name and representative preview.
4. Selecting a design updates the preview without changing the public website.
5. The preview uses the restaurant's own draft information and menu rather than sample restaurant content.
6. The owner can preview desktop and mobile presentation.
7. The owner can cancel and retain the currently published design.
8. Publishing a selected design requires explicit confirmation.
9. Successful publication changes the public home and menu presentation to the selected design.
10. Restaurant information, menu content, customer actions, and accessibility behavior continue to work after the design changes.
11. Failed publication leaves the previous public design active and informs the owner how to retry.
12. The owner can later change to any other available design without developer assistance.
13. Existing restaurants receive a safe default design when no explicit selection has been made.
14. Introducing a new design version does not silently change the website of a restaurant using an earlier version.

## Product Outcome

A restaurant owner can complete the full design-change journey as:

**Select → Preview → Confirm → Publish → View website**

The owner does not need to contact a developer or request a deployment when switching between designs already offered by the product.
