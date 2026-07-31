# PR-12. Dish Management --- Task Breakdown

## Goal

Implement a complete restaurant dish management system. Each task should
be as independent as possible so that it can be completed by a separate
agent without overlapping responsibilities.

## Phase 1 --- Dish Data Model

### Task PR12-1. Design Dish Entity

**Description**

Create the data model for a dish.

**Requirements**

-   Dish ID (UUID)
-   Restaurant ID
-   Category ID
-   Name
-   Description
-   Price
-   Image URL
-   Availability Status
-   Sort Order
-   Created At
-   Updated At

Support soft delete.

**Acceptance Criteria**

-   Dish model is created.
-   All required fields are present.
-   Relationships with Restaurant and Category are established.
-   Soft delete is supported.

## Phase 2 --- Create Dish

### Task PR12-2. Create Dish API

**Description**

Implement the API for creating a new dish.

**Requirements**

Required: - Restaurant - Category - Name - Price

Optional: - Description - Image - Flags

Validation: - Price \> 0 - Name cannot be empty.

**Acceptance Criteria**

-   Dish is created successfully.
-   Required fields are validated.
-   Price validation is enforced.
-   Record is stored in the database.

### Task PR12-3. Create Dish UI

**Requirements**

-   Name
-   Category
-   Price
-   Description
-   Image Upload
-   Dietary Flags
-   Save
-   Cancel

Validation errors appear next to fields.

**Acceptance Criteria**

-   Form opens.
-   Dish can be created.
-   Errors display correctly.

## Phase 3 --- Edit Dish

### Task PR12-4. Update Dish API

Editable fields: - Name - Description - Price - Category - Image -
Flags - Availability - Sort Order

**Acceptance Criteria**

-   Changes are saved.
-   Updated At is refreshed.
-   Validation passes.

### Task PR12-5. Edit Dish UI

-   Form is pre-filled.
-   All editable fields can be modified.
-   Save / Cancel supported.

**Acceptance Criteria**

-   Data displays correctly.
-   Changes save successfully.
-   Cancel works.

## Phase 4 --- Delete Dish

### Task PR12-6. Delete Dish API

-   Soft delete.
-   Deleted dishes do not appear in the menu.

**Acceptance Criteria**

-   Dish is deleted.
-   Data remains in the database.
-   Menu updates.

### Task PR12-7. Delete Confirmation UI

Dialog includes: - Dish name - Warning - Delete - Cancel

**Acceptance Criteria**

-   Confirmation appears.
-   Cancel works.
-   Dish disappears after deletion.

## Phase 5 --- Dish Description

### Task PR12-8. Dish Description Management

Description: - Optional - Multi-line - Stored in Description field

**Acceptance Criteria**

-   Can add/edit description.
-   Empty description allowed.

## Phase 6 --- Dish Image

### Task PR12-9. Dish Image Upload Backend

Supports: - JPG - PNG - WEBP

-   File size limit.
-   Replaces previous image.

**Acceptance Criteria**

-   Upload succeeds.
-   URL stored.
-   Replace works.

### Task PR12-10. Dish Image UI

Supports: - Upload - Replace - Remove - Preview

Displays upload errors.

**Acceptance Criteria**

-   Image displayed.
-   Replace works.
-   Remove works.

## Phase 7 --- Dietary & Special Flags

### Task PR12-11. Dietary Flags Data Model

Supported: - Vegetarian - Vegan - Gluten-Free - Dairy-Free - Halal -
Spicy - Contains Nuts - Popular - New

Multiple flags supported.

**Acceptance Criteria**

-   All flags available.
-   Multiple selections supported.
-   Data saved.

### Task PR12-12. Dietary Flags UI

-   Checkboxes/toggles.
-   Multiple selections allowed.

**Acceptance Criteria**

-   Flags displayed.
-   Selection saved.
-   State restored.

## Phase 8 --- Dish Validation

### Task PR12-13. Dish Validation Rules

Validate: - Required fields - Price - Category - Restaurant - Name
length - Description length

**Acceptance Criteria**

-   Invalid data rejected.
-   Clear validation errors.
-   Valid data accepted.

## Phase 9 --- Authorization

### Task PR12-14. Dish Permissions

Only restaurant owners can: - Create - Update - Delete their own dishes

**Acceptance Criteria**

-   Owners manage only their dishes.
-   Cross-restaurant access denied.
-   Unauthorized requests rejected.

## Phase 10 --- Audit & Logging

### Task PR12-15. Dish Audit Logging

Log: - Create - Update - Delete - Price changes - Flag changes - Image
changes

Each log includes: - User ID - Dish ID - Restaurant ID - Timestamp -
Action

**Acceptance Criteria**

-   All actions logged.
-   Complete audit records.
-   No impact on functionality.

## PR-12 Summary

  Task      Name
  --------- -----------------------------
  PR12-1    Design Dish Entity
  PR12-2    Create Dish API
  PR12-3    Create Dish UI
  PR12-4    Update Dish API
  PR12-5    Edit Dish UI
  PR12-6    Delete Dish API
  PR12-7    Delete Confirmation UI
  PR12-8    Dish Description Management
  PR12-9    Dish Image Upload Backend
  PR12-10   Dish Image UI
  PR12-11   Dietary Flags Data Model
  PR12-12   Dietary Flags UI
  PR12-13   Dish Validation Rules
  PR12-14   Dish Permissions
  PR12-15   Dish Audit Logging
