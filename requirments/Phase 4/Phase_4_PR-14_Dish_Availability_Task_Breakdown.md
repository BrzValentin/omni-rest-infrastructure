# PR-14. Dish Availability

## Goal

Allow restaurant owners to temporarily hide dishes from sale without deleting them from the menu. Changes should appear on the public website only after they are published.

---

# Task 1. Add Availability Status to Dish Model

## Description

Add a field to the dish model that represents the dish availability status.

## Requirements

- Add a new field: `availability_status`.
- Supported values:
  - `Available`
  - `Unavailable`
- All existing dishes must default to `Available`.
- The value must be stored in the database.
- The field is required.

## Acceptance Criteria

- Newly created dishes have the status `Available`.
- Existing dishes are automatically assigned `Available`.
- The database does not allow any value other than the supported statuses.

---

# Task 2. Display Availability Status in Dish List

## Description

Display the current availability status for each dish in the dish list.

## Requirements

- Show the availability status in the dish list.
- Display clear status badges:
  - `Available`
  - `Unavailable`
- The status must be visible without opening the dish details.

## Acceptance Criteria

- Users can see the status of every dish.
- The displayed status matches the database value.
- The status is displayed correctly regardless of the number of dishes.

---

# Task 3. Allow Owner to Change Availability

## Description

Allow restaurant owners to change a dish's availability status.

## Requirements

- Provide a status selector in the dish editor:
  - `Available`
  - `Unavailable`
- Changing the status must not delete the dish.
- After saving, the new status is stored in the database.
- Saving the change must not automatically publish it.

## Acceptance Criteria

- Owners can switch between both statuses.
- The selected status is saved successfully.
- No other dish data is modified.

---

# Task 4. Reflect Availability in Preview

## Description

The Preview version of the website must respect the dish availability status.

## Requirements

- In Preview mode:
  - `Available` dishes are displayed.
  - `Unavailable` dishes are hidden.
- The Preview uses the draft version of the data.

## Acceptance Criteria

- The Preview reflects the current draft state.
- Availability changes are immediately visible in Preview.
- The published website remains unchanged.

---

# Task 5. Publish Availability Changes

## Description

Availability changes must appear on the public website after publishing.

## Requirements

- Publishing transfers the updated availability status to the published version.
- If a dish becomes `Unavailable`:
  - it disappears from the public menu.
- If a dish becomes `Available`:
  - it reappears on the public menu.
- Use the existing publishing workflow.

## Acceptance Criteria

- The public website does not change before publishing.
- The updated availability is reflected after publishing.
- Preview and Published versions remain independent.

---

# Task 6. Hide Unavailable Dishes on the Public Website

## Description

The public menu must display only available dishes.

## Requirements

- Dishes marked as `Unavailable` must be completely hidden.
- They must not appear in:
  - menu categories;
  - search results;
  - recommendations (if applicable).
- Categories must continue functioning correctly.

## Acceptance Criteria

- Unavailable dishes are not visible on the public website.
- Available dishes continue to be displayed.
- Public users cannot access hidden dishes.

---

# Task 7. API Support

## Description

Update the API to support dish availability.

## Requirements

- The API returns the `availability_status` field.
- The API allows updating the availability status.
- The Public API returns only published and available dishes.
- The Admin API returns all dishes regardless of availability.

## Acceptance Criteria

- The API supports reading and updating the availability status.
- Public API responses never include unavailable dishes.
- Admin API responses include complete dish information.

---

# Task 8. Validation and Business Rules

## Description

Implement validation and business rules for dish availability.

## Requirements

- Every dish must always have exactly one availability status.
- Empty or null values are not allowed.
- Changing the availability status must not affect:
  - price;
  - category;
  - images;
  - translations;
  - description.
- Changing the status must never delete dish data.

## Acceptance Criteria

- All validation rules are enforced.
- All dish information remains intact.
- Changing availability affects only the dish's visibility.

---

# Task 9. Testing

## Description

Verify the feature across all supported scenarios.

## Requirements

Create tests covering:

- dish creation;
- availability status updates;
- saving changes;
- Preview mode;
- publishing;
- public website visibility;
- API behavior;
- hiding unavailable dishes;
- restoring dishes to the menu.

## Acceptance Criteria

- All tests pass successfully.
- No regressions are introduced.
- The implementation fully satisfies the requirements of **PR-14: Dish Availability**.
