# Phase 3 --- PR-9 Restaurant Information Management

## Overview

**Goal:**

Implement a complete restaurant information management system that
allows restaurant owners to edit all public-facing restaurant
information while ensuring validation, security, media handling, and
controlled publication.

This PR is intentionally divided into small independent tasks so each
can be completed by a separate agent.

------------------------------------------------------------------------

# Task 1. Restaurant Information Data Model

## Goal

Create the database structure that stores editable restaurant
information.

### Requirements

-   Add fields for:
    -   Restaurant Name
    -   Description
    -   Phone
    -   Email
    -   Address
    -   Main Image URL
-   Add fields for social links:
    -   Instagram
    -   Facebook
    -   TikTok
    -   Google Business Profile
-   Support timestamps.
-   Support future expansion without schema changes.

### Acceptance Criteria

-   Database schema supports all required fields.
-   Nullable fields are handled correctly.
-   Migration runs successfully.
-   Existing restaurants remain compatible.

------------------------------------------------------------------------

# Task 2. Restaurant Information API

## Goal

Create backend endpoints for reading and updating restaurant
information.

### Requirements

Implement endpoints to:

-   Get restaurant information
-   Update restaurant information

Additional requirements:

-   Only authenticated owners can update.
-   Validate ownership.
-   Return consistent API responses.
-   Reject unauthorized requests.

### Acceptance Criteria

-   Owner can retrieve restaurant information.
-   Owner can update information.
-   Unauthorized users receive proper errors.
-   Invalid restaurant IDs return errors.

(Tasks 3--14 continue exactly as provided in the conversation.)
