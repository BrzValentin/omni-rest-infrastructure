# PR-3. Special Operating Hours

## Goal

Break down **PR-3: Special Operating Hours** into small, independent implementation tasks. Each task should be implementable by a separate agent and provide a foundation for detailed technical specifications.

---

# Task 1. Design the Data Model for Special Operating Hours

## Objective
Design the database structure that stores special operating hours for individual calendar dates.

### Requirements

- Create a data model for special operating hours.
- Every record belongs to exactly one restaurant.
- Every record represents one calendar date.
- Store:
  - restaurant ID
  - date
  - is_closed flag
  - opening time (nullable)
  - closing time (nullable)
  - created_at
  - updated_at
- Only one record per restaurant per date is allowed.
- Opening and closing times are required only when `is_closed = false`.

### Acceptance Criteria

- Database schema is documented.
- Unique constraint prevents duplicate dates.
- Validation rules are defined.
- Data model is reviewed and approved.

---

# Task 2. Implement CRUD API for Special Operating Hours

## Objective

Create backend endpoints for managing special operating hours.

### Requirements

Support operations:

- Create special hours
- Update special hours
- Delete special hours
- Retrieve special hours
- Retrieve special hours within a date range

Validation:

- Date is required.
- Date must be valid.
- Opening time must be earlier than closing time.
- Closed days do not require times.

### Acceptance Criteria

- All CRUD endpoints exist.
- Validation errors return proper responses.
- Duplicate dates are rejected.
- API documentation is complete.

---

# Task 3. Build Owner UI for Managing Special Hours

## Objective

Allow restaurant owners to manage special operating hours.

### Requirements

Provide a management screen where the owner can:

- View existing special dates.
- Add a new special date.
- Edit an existing special date.
- Delete a special date.
- Mark a restaurant as closed for a date.
- Specify opening and closing times.

UI should:

- Display dates in chronological order.
- Prevent duplicate entries.
- Show validation messages.

### Acceptance Criteria

- Owner can perform all CRUD operations.
- Validation errors are displayed.
- Closed days hide time inputs.
- UI follows project design guidelines.

---

# Task 4. Apply Override Logic to Restaurant Schedule

## Objective

Ensure special operating hours override the normal weekly schedule.

### Requirements

When determining restaurant availability:

1. Check whether a special record exists for the requested date.
2. If yes:
   - If marked closed → restaurant is closed.
   - Otherwise use the special opening and closing times.
3. If no special record exists:
   - Use the regular weekly schedule.

This logic must be reusable by all services.

### Acceptance Criteria

- Override logic is implemented.
- Weekly schedule is ignored when a special date exists.
- Closed special dates always return closed.
- Logic is reusable across the application.

---

# Task 5. Update Public Restaurant Availability

## Objective

Display the correct operating hours to customers.

### Requirements

Restaurant pages and APIs must:

- Show special operating hours when applicable.
- Show "Closed" when the restaurant is marked closed.
- Show normal hours otherwise.

### Acceptance Criteria

- Public API returns overridden hours.
- Restaurant pages display correct hours.
- Closed days are shown correctly.
- No inconsistencies between API and UI.

---

# Task 6. Validation and Business Rules

## Objective

Implement all business validation for special operating hours.

### Requirements

Validate:

- One record per restaurant per date.
- Valid calendar dates.
- Opening time before closing time.
- Closed days cannot contain business hours.
- Open days must include both opening and closing times.

Return meaningful validation errors.

### Acceptance Criteria

- Invalid requests are rejected.
- Validation messages are clear.
- Database integrity is maintained.

---

# Task 7. Automated Testing

## Objective

Verify that special operating hours work correctly.

### Requirements

Create tests covering:

- Data Model
- API
- Business Logic
- UI

### Acceptance Criteria

- All tests pass.
- Override behavior is fully covered.
- Validation scenarios are covered.
- No regressions in regular operating hours.
