# PR-13. Price Management

## Goal

Implement secure dish price management with support for Canadian tax display requirements (GST/PST), publishing workflow, and correct public price presentation.

---

# Task 1. Price Data Model

## Goal

Prepare the data model for storing dish prices.

### Requirements

- Every dish must have a `price` field.
- The price must be stored as a Decimal (not a float).
- Support exactly two decimal places.
- The price must be greater than or equal to zero.
- Restaurant currency is determined by the restaurant settings, not by the dish.
- Create the required database migration.

### Acceptance Criteria

- The dishes table contains a price field.
- Prices are stored without precision loss.
- Database migration executes successfully.
- Existing dishes receive a valid default value or are migrated correctly.

---

# Task 2. Backend API for Price Update

## Goal

Allow restaurant owners to update dish prices.

### Requirements

- Implement an endpoint for updating dish prices.
- Only the restaurant owner may update prices.
- Verify that the dish belongs to the authenticated user's restaurant.
- Validate the price format.
- Return the updated price in the response.

### Acceptance Criteria

- An authorized restaurant owner can update a dish price.
- Users from other restaurants receive a **Forbidden** response.
- Invalid prices are rejected.
- The API response contains the updated price.

---

# Task 3. Price Validation

## Goal

Ensure all submitted prices are valid.

### Requirements

- Required field.
- Numeric format.
- Maximum of two decimal places.
- Value greater than or equal to zero.
- No negative values.
- No NaN or Infinity values.
- Create reusable validation rules.

### Acceptance Criteria

- All invalid values are rejected.
- Valid values are accepted.
- Validation error messages are clear and user-friendly.

---

# Task 4. Restaurant Owner UI

## Goal

Allow restaurant owners to edit dish prices in the management interface.

### Requirements

- Display the price field when editing a dish.
- Use a numeric input control.
- Support decimal values.
- Perform client-side validation.
- The Save button submits the updated price.

### Acceptance Criteria

- Users can successfully change a dish price.
- Validation errors are displayed without reloading the page.
- The updated price is shown after a successful save.

---

# Task 5. Price Publishing

## Goal

Make updated prices available to restaurant visitors after publication.

### Requirements

- Published menus must display the updated price.
- Previous prices must no longer be shown.
- The public menu API must return the latest published price.
- Changes must become available without requiring manual cache clearing.

### Acceptance Criteria

- Visitors see the updated price after publication.
- The public API returns the latest price.
- Cache invalidation works correctly.

---

# Task 6. Public Menu Price Display

## Goal

Display dish prices correctly to restaurant visitors.

### Requirements

- Display the price next to each dish.
- Format the price using the restaurant's currency.
- Always display two decimal places.
- If a price is unavailable, use the system-defined fallback state (if permitted by business rules).

### Acceptance Criteria

- All dishes display prices correctly.
- Currency formatting matches the restaurant settings.
- No visual formatting issues exist.

---

# Task 7. Tax Display Logic (GST/PST)

## Goal

Support restaurants that display prices excluding taxes.

### Requirements

Respect the restaurant tax display setting:

- Prices Include Taxes
- Prices Exclude Taxes

If Prices Exclude Taxes:
- Display an informational tax notice.
- The notice text must come from the project's localization system.
- Do not automatically calculate or modify the displayed price.

If Prices Include Taxes:
- No additional tax notice should be displayed.

### Acceptance Criteria

- A tax notice is displayed when prices exclude taxes.
- No tax notice is displayed when prices include taxes.
- Changing the restaurant setting immediately updates the public display.

---

# Task 8. API Support for Tax Display

## Goal

Provide the frontend with all information required for price presentation.

### Requirements

The public API must return:
- Dish price.
- Tax display mode (include/exclude taxes).
- Restaurant currency.

The API must not calculate taxes.

### Acceptance Criteria

- The frontend receives all required information.
- The API format is documented.
- Backward compatibility is maintained.

---

# Task 9. Authorization & Security

## Goal

Secure the price update process.

### Requirements

- Only restaurant Owners and Admins may update prices.
- All other users have read-only access.
- Verify that the dish belongs to the user's restaurant.
- Prevent unauthorized updates through resource ID manipulation.

### Acceptance Criteria

- Unauthorized price updates are impossible.
- All authorization checks execute correctly.
- Invalid access attempts return appropriate error responses.

---

# Task 10. Testing

## Goal

Verify the complete price management workflow.

### Requirements

### Backend
- Price updates.
- Validation.
- Authorization.
- Publishing.
- Public menu API.
- Tax display mode.

### Frontend
- Price editing.
- Validation error display.
- Successful save.
- Updated price display.
- Tax notice display.

### Integration

Owner → Update Price → Publish → Visitor Sees Updated Price

### Acceptance Criteria

- All automated tests pass.
- No regressions are introduced.
- The complete end-to-end workflow functions correctly.

---

# Implementation Order

| # | Task | Dependency |
|---|------|------------|
| 1 | Price Data Model | — |
| 2 | Backend API for Price Update | 1 |
| 3 | Price Validation | 2 |
| 4 | Restaurant Owner UI | 2, 3 |
| 5 | Price Publishing | 2 |
| 6 | Public Menu Price Display | 5 |
| 7 | Tax Display Logic (GST/PST) | 6 |
| 8 | API Support for Tax Display | 5, 7 |
| 9 | Authorization & Security | 2 |
| 10 | Testing | All previous tasks |
