# PR-15. Public Gallery

## Goal

Allow restaurant visitors to browse photos of the restaurant's interior, atmosphere, and dishes without authentication.

---

# Task 1. Gallery Data Model

## Description

Create the data model for storing restaurant gallery photos.

### Requirements

- Each photo belongs to a single restaurant.
- A photo contains:
  - ID
  - Restaurant ID
  - Image URL
  - Thumbnail URL
  - Caption (optional)
  - Sort Order
  - Is Active
  - Created At
  - Updated At
- Support an unlimited number of photos.
- Support manual photo ordering.

### Acceptance Criteria

- A gallery photo record can be created.
- Each photo is associated with a restaurant.
- Photo ordering is supported.
- Inactive photos are not displayed publicly.

---

# Task 2. Public Gallery API

## Description

Implement an API for retrieving gallery photos.

### Requirements

**Endpoint**

```http
GET /restaurants/{restaurantId}/gallery
```

Returns only active photos sorted by Sort Order.

Each response item contains:
- Photo ID
- Image URL
- Thumbnail URL
- Caption

### Acceptance Criteria

- The API returns a list of gallery photos.
- Inactive photos are excluded.
- Photos are returned in the correct order.
- An error is returned if the restaurant does not exist.

---

# Task 3. Gallery Thumbnail View

## Description

Implement a thumbnail grid view for the gallery.

### Requirements

- Display all photos in a responsive grid.
- Use thumbnail images.
- All thumbnails have consistent dimensions.
- The grid adapts to different screen sizes.

### Acceptance Criteria

- All photos are displayed.
- Images are not distorted.
- The gallery works correctly on desktop and mobile devices.
- An empty state is displayed when no photos are available.

---

# Task 4. Full-Screen Photo Viewer

## Description

Implement full-size photo viewing.

### Requirements

When a user clicks a thumbnail:
- Open the full-size image.
- Display the caption (if available).
- Allow the viewer to be closed.

### Acceptance Criteria

- Clicking a thumbnail opens the photo viewer.
- The original image is displayed.
- The caption is shown correctly.
- The viewer closes without reloading the page.

---

# Task 5. Gallery Navigation

## Description

Add navigation between gallery photos.

### Requirements

Supports:
- Next Photo
- Previous Photo
- Swipe gestures on mobile.
- Left/right arrow keys on desktop.

### Acceptance Criteria

- Next/Previous navigation works.
- Swipe works.
- Arrow keys work.
- Navigation stays within bounds.

---

# Task 6. Loading & Empty States

## Description

Handle loading and empty gallery states.

### Requirements

Display a skeleton loader while loading.

If empty:

`No photos available.`

### Acceptance Criteria

- Skeletons display during loading.
- Empty message appears when appropriate.
- No UI errors occur.

---

# Task 7. Image Performance Optimization

## Description

Optimize image loading.

### Requirements

- Lazy loading
- Thumbnails in grid
- Full-size loaded on demand
- Browser cache
- Responsive images

### Acceptance Criteria

- Fast thumbnail loading.
- Full-size loads only when opened.
- Cache reused.
- Smooth scrolling.

---

# Task 8. Accessibility

## Description

Ensure accessibility.

### Requirements

- Alt text
- Keyboard accessibility
- Proper focus management
- Escape closes viewer
- WCAG compliance

### Acceptance Criteria

- Fully keyboard accessible.
- Escape works.
- Alt text present.
- No critical accessibility issues.

---

# Task 9. Error Handling

## Description

Handle image loading failures.

### Requirements

- Show placeholder for broken images.
- Continue displaying remaining images.
- Prevent crashes.

### Acceptance Criteria

- Broken images replaced.
- Gallery continues working.
- Errors logged.
- Users can continue browsing.

---

# Task 10. Public Gallery Integration

## Description

Integrate the gallery into the public restaurant page.

### Requirements

- Display Gallery section.
- Hide it if no active photos.
- Use the public Gallery API.
- Load automatically.

### Acceptance Criteria

- Gallery appears on the public page.
- Visitors can browse photos.
- Hidden when empty.
- All tasks work together correctly.
