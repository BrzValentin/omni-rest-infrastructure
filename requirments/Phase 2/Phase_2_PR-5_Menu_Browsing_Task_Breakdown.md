# Phase 2 — PR-5. Menu Browsing

## Goal

Allow visitors to browse a modern digital restaurant menu instead of viewing a static PDF.

---

# Task 1. Menu Data Model

## Description
Create the data model that represents the restaurant menu and menu items.

### Requirements
- Create Menu entity.
- Create Menu Category entity.
- Create Menu Item entity.
- Every Menu Item contains:
  - Name
  - Description
  - Price
  - Photo (optional)
  - Availability status
- Support sorting within categories.
- Support multiple categories per restaurant.
- Support multiple menus in the future (Lunch, Dinner, etc.), but only one active menu is required for this PR.

### Acceptance Criteria
- Database schema supports menu hierarchy.
- Categories belong to a menu.
- Menu items belong to a category.
- Optional fields are nullable.
- Data model is documented.

---

# Task 2. Dietary & Feature Badges

## Description
Add support for dietary and promotional badges.

### Requirements
Support:
- Vegetarian
- Vegan
- Gluten-Free
- Dairy-Free
- Halal
- Spicy
- Contains Nuts
- Popular
- New

Each badge is stored independently and multiple badges are allowed.

### Acceptance Criteria
- Menu item can have zero or many badges.
- Badge list matches PR specification.
- Badge structure is extensible.
- Invalid badge values are rejected.

---

# Task 3. Menu API

## Description
Create backend API for menu retrieval.

### Requirements
- Retrieve active menu
- Retrieve categories
- Retrieve menu items
- Return badges
- Return image URL
- Return pricing information
- Return only available menu items
- Support sorting

### Acceptance Criteria
- API returns complete menu hierarchy.
- Categories are ordered.
- Items are ordered.
- Optional values are handled correctly.
- Response format is documented.

---

# Task 4. Menu State Management

## Description
Implement frontend state management.

### Requirements
- Load menu on page open.
- Handle loading state.
- Handle empty menu.
- Handle API errors.
- Cache menu during session.
- Refresh when requested.

### Acceptance Criteria
- Menu loads successfully.
- Loading indicator appears.
- Empty state is displayed.
- Error state is handled.
- No duplicate requests.

---

# Task 5. Menu Categories UI

## Description
Create category browsing UI.

### Requirements
- Display category name.
- Display category order.
- Display category sections.
- Allow natural navigation.

### Acceptance Criteria
- Categories appear in configured order.
- Empty categories are hidden.
- Navigation is smooth.
- UI follows design system.

---

# Task 6. Menu Item Card

## Description
Create reusable menu item component.

### Requirements
Display:
- Name
- Description
- Price
- Photo (optional)
- Badges

### Acceptance Criteria
- All fields render correctly.
- Missing photo does not break layout.
- Long descriptions wrap correctly.
- Price formatting is consistent.

---

# Task 7. Badge Rendering

## Description
Display badges.

### Requirements
- Icon (if defined)
- Label
- Consistent styling
- Multiple badges
- Future extensibility

### Acceptance Criteria
- All supported badges render correctly.
- Multiple badges display properly.
- Responsive layout.
- Unknown badges ignored safely.

---

# Task 8. Menu Images

## Description
Support menu images.

### Requirements
- Display image when available.
- Placeholder when absent.
- Optimize loading.
- Preserve aspect ratio.
- Lazy loading.

### Acceptance Criteria
- Images load correctly.
- Placeholder appears.
- Images are not distorted.
- Lazy loading works.

---

# Task 9. Price Presentation

## Description
Display pricing consistently.

### Requirements
- CAD formatting.
- Decimal precision.
- Handle missing prices.

### Acceptance Criteria
- Consistent formatting.
- Canadian currency format.
- Safe handling of missing prices.

---

# Task 10. Tax Information Notice

## Description
Display GST/PST notice when prices exclude taxes.

### Requirements
- Show notice near menu or bottom.
- Configurable enable/disable.

### Acceptance Criteria
- Notice appears only when required.
- Clear wording.
- Correct placement.
- Configuration controls visibility.

---

# Task 11. Empty & Error States

## Description
Handle exceptional states.

### Requirements
- Empty menu
- No categories
- Category without items
- Network error
- Server error

### Acceptance Criteria
- Empty states render correctly.
- Errors are informative.
- No crashes.
- Retry supported.

---

# Task 12. Performance Optimization

## Description
Optimize performance.

### Requirements
- Minimize API calls.
- Cache responses.
- Lazy load images.
- Avoid unnecessary re-renders.
- Support large menus.

### Acceptance Criteria
- Fast loading.
- Responsive with large menus.
- Optimized rendering.

---

# Task 13. Responsive Menu Experience

## Description
Responsive layouts.

### Requirements
- Desktop
- Tablet
- Mobile
- Responsive images
- Touch-friendly UI

### Acceptance Criteria
- Works on all supported devices.
- Layout adapts correctly.
- No horizontal scrolling.

---

# Task 14. Accessibility

## Description
Accessibility support.

### Requirements
- Semantic HTML
- Keyboard navigation
- Screen readers
- Alt text
- Accessible badges
- Proper headings
- Color contrast

### Acceptance Criteria
- Keyboard accessible.
- Screen readers work.
- Images have alt text.
- Meets project accessibility standards.

---

# Task 15. Testing & Documentation

## Description
Complete validation.

### Requirements
- Unit tests
- API tests
- Component tests
- Integration tests
- Documentation updates

### Acceptance Criteria
- All tests pass.
- Documentation complete.
- No critical defects.
- PR-5 acceptance criteria satisfied.
