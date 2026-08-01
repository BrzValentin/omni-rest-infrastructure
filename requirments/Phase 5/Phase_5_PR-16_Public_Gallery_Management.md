# PR-16. Gallery Management

## Goal

Implement complete restaurant gallery management, allowing restaurant
owners to upload photos, delete photos, and change their display order.
The architecture should be extensible to support future features such as
cover images, captions, AI moderation, and image optimization.

## Task 1. Gallery Data Model

### Description

Create the data model for storing restaurant gallery images.

### Requirements

-   Create a `GalleryImage` entity.
-   Each image belongs to a single restaurant.
-   Store:
    -   ID
    -   Restaurant ID
    -   Image URL
    -   Storage Key
    -   Display Order
    -   Width
    -   Height
    -   File Size
    -   Created At
    -   Updated At
-   `Display Order` must be unique within a restaurant.
-   Add indexes for efficient gallery retrieval.

### Acceptance Criteria

-   The gallery data model is implemented.
-   A restaurant can have multiple gallery images.
-   Display order is stored independently.
-   Database migrations execute successfully.

## Task 2. Upload Image API

### Description

Implement an API for uploading gallery images.

### Requirements

-   Authenticated restaurant owners can upload images.
-   Supported formats: JPG, JPEG, PNG, WEBP.
-   Validate maximum file size.
-   Create a GalleryImage record.
-   New images receive the last Display Order.
-   Return uploaded image information.

### Acceptance Criteria

-   Images upload successfully.
-   Unsupported formats are rejected.
-   Oversized files are rejected.
-   Database record is created.
-   Uploaded image appears last.

## Task 3. Image Storage Integration

### Description

Integrate gallery uploads with file storage.

### Requirements

-   Store uploaded files.
-   Generate unique filenames.
-   Save Image URL and Storage Key.
-   Roll back on storage failure.
-   Prevent orphaned records.

### Acceptance Criteria

-   Files are stored.
-   URLs are accessible.
-   Failed uploads are rolled back.
-   Storage Keys are saved correctly.

## Task 4. Gallery Retrieval API

### Description

Implement gallery retrieval.

### Requirements

-   Return all restaurant images.
-   Sort by Display Order.
-   Return ID, URL, Width, Height, Display Order.
-   Exclude unavailable images.

### Acceptance Criteria

-   Complete gallery returned.
-   Correct ordering.
-   API contract satisfied.

## Task 5. Delete Image API

### Requirements

-   Delete image from storage and database.
-   Recalculate Display Order.

### Acceptance Criteria

-   Image deleted.
-   Storage cleaned.
-   Sequential ordering preserved.

## Task 6. Reorder Gallery API

### Requirements

-   Accept new image order.
-   Validate ownership.
-   Validate duplicates and completeness.
-   Update atomically.

### Acceptance Criteria

-   Order saved.
-   Invalid requests rejected.

## Task 7. Gallery Validation

### Requirements

-   Maximum image count.
-   Restaurant existence.
-   Ownership.
-   Image existence.
-   Reorder validation.

### Acceptance Criteria

-   Clear validation errors.
-   Data integrity preserved.

## Task 8. Gallery Business Rules

### Requirements

-   First image gets Display Order = 1.
-   Deleted images trigger reorder.
-   New images append to end.
-   Orders remain 1...N.

### Acceptance Criteria

-   Continuous ordering.
-   No duplicates.

## Task 9. Authorization

### Requirements

-   Only owners can upload, delete, and reorder.
-   Public users can view only.

### Acceptance Criteria

-   Unauthorized access denied.
-   Owners manage only their own galleries.

## Task 10. Testing

### Requirements

Cover upload, validation, deletion, retrieval, reorder, authorization,
and ordering scenarios.

### Acceptance Criteria

-   All tests pass.
-   Positive and negative scenarios covered.
-   No regressions.

## Development Order

1.  Gallery Data Model
2.  Upload Image API
3.  Image Storage Integration
4.  Gallery Retrieval API
5.  Delete Image API
6.  Reorder Gallery API
7.  Gallery Validation
8.  Gallery Business Rules
9.  Authorization
10. Testing
