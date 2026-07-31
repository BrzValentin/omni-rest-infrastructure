# Phase 2 — PR-7. Dish Availability

## Goal

Implement a complete Dish Availability feature that allows restaurant owners to temporarily mark dishes as unavailable while clearly communicating this status to visitors throughout the Digital Menu.

Each task is designed to be implemented independently by an AI agent and will later serve as the foundation for detailed technical specifications.

---

# Task 1. Design Dish Availability Data Model

## Objective
Define how dish availability is represented within the system.

## Requirements
- Add an availability status to every dish.
- Support at least two states:
  - Available
  - Unavailable
- Default value is Available.
- Availability status must be independent from dish visibility.
- Availability must persist in the database.

## Acceptance Criteria
- Every dish has an availability field.
- Existing dishes automatically become Available.
- Status is stored correctly.
- Database migration completes successfully.

---

# Task 2. Restaurant Dashboard — Availability Management

## Objective
Allow restaurant owners to change the availability of a dish.

## Requirements
- Add an availability control to the dish editing interface.
- Restaurant owner can:
  - Mark dish as Available
  - Mark dish as Unavailable
- Saving updates the database.
- Changes are reflected immediately.

## Acceptance Criteria
- Owner can change availability.
- Changes persist after page refresh.
- Validation prevents invalid values.
- API returns updated status.

---

# Task 3. Backend API Support

## Objective
Expose dish availability through backend services.

## Requirements
- Dish API includes availability status.
- Public menu endpoint returns availability.
- Admin endpoints support updating availability.
- API documentation updated.

## Acceptance Criteria
- Availability included in all required responses.
- Update endpoint saves correctly.
- Unauthorized users cannot modify availability.
- Existing API functionality remains unaffected.

---

# Task 4. Display Availability in Digital Menu

## Objective
Show visitors when a dish is unavailable.

## Requirements
- Every unavailable dish displays a clear visual indicator.
- Indicator is consistent across menu views.
- Status is immediately understandable.
- Layout remains clean and readable.

## Acceptance Criteria
- Visitors clearly recognize unavailable dishes.
- Indicator appears consistently.
- UI remains responsive.
- No layout issues occur.

---

# Task 5. Visual Styling

## Objective
Create consistent styling for unavailable dishes.

## Requirements
- Define disabled appearance.
- Reduce visual emphasis.
- Keep text readable.
- Maintain accessibility.
- Ensure sufficient color contrast.

## Acceptance Criteria
- Styling is consistent.
- Accessibility requirements met.
- Contrast remains acceptable.
- Appearance matches design system.

---

# Task 6. Prevent Ordering of Unavailable Dishes (Future Compatibility)

## Objective
Prepare the system for future online ordering functionality.

## Requirements
- Availability flag exposed wherever ordering logic will consume dish data.
- System architecture supports blocking unavailable dishes.
- No ordering logic implemented yet.
- Future integrations require minimal changes.

## Acceptance Criteria
- Availability available in ordering-related models.
- Architecture supports future order validation.
- No breaking changes introduced.

---

# Task 7. Real-Time Availability Updates

## Objective
Ensure menu reflects availability changes correctly.

## Requirements
- Updated availability becomes visible after normal page refresh.
- Cached menu data refreshes correctly.
- No stale availability information remains.
- API returns current status.

## Acceptance Criteria
- Availability changes appear correctly.
- Cache invalidation functions properly.
- Users never receive outdated availability after refresh.

---

# Task 8. Edge Case Handling

## Objective
Ensure availability behaves correctly in uncommon scenarios.

## Requirements
Handle:
- Dish archived while unavailable.
- Dish duplicated.
- Category hidden.
- Dish restored.
- Bulk import/export.
- Menu synchronization.

## Acceptance Criteria
- Availability remains consistent.
- No corrupted states occur.
- Import/export preserves status.
- Archived dishes retain availability if restored.

---

# Task 9. Testing

## Objective
Verify Dish Availability works across all system components.

## Requirements
Test:
- Database
- API
- Dashboard
- Public Menu
- Edge Cases

## Acceptance Criteria
- All tests pass.
- No regressions introduced.
- Feature behaves consistently across supported browsers.

---

# Deliverables

- Persistent dish availability model
- Dashboard controls
- Backend API support
- Public menu indicators
- Consistent visual styling
- Future-ready ordering compatibility
- Proper cache/update handling
- Edge case support
- Automated test coverage
