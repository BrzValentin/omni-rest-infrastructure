# PR-21. Independent Management

## Goal

Implement tenant isolation so that each restaurant owner can manage only their own restaurant. The system must enforce access restrictions at both the UI and API/database levels. No owner should be able to access, modify, or even discover another restaurant's data.

## Task 1. Restaurant Ownership Data Model
### Requirements
- Define ownership model.
- Each Restaurant has exactly one Owner (Phase 1).
- Owner is linked to restaurant via UserId.
- Create ownership service/helper for retrieving current owner's restaurant.
- Add indexes for efficient lookup.

### Acceptance Criteria
- Restaurant has OwnerId.
- Owner → Restaurant relationship works.
- Service returns owner's restaurant.
- No duplicate ownership records.
- Unit tests pass.

## Task 2. Authentication Context
### Requirements
Create a centralized way to determine:
- Current authenticated user
- User role
- Restaurant owned by current user

Provide reusable service `CurrentUserContext` with methods:
- GetUserId()
- GetRole()
- GetRestaurantId()

### Acceptance Criteria
- User context available everywhere.
- RestaurantId resolved correctly.
- Anonymous users handled safely.
- Unit tests pass.

## Task 3. Authorization Policy
### Requirements
Create reusable `RestaurantOwner` authorization policy:
- User authenticated.
- Role = RestaurantOwner.
- User owns restaurant.
- Admin bypass supported.

### Acceptance Criteria
- Policy created.
- Unauthorized users denied.
- Admin bypass supported.
- Tests pass.

## Task 4. Restaurant Access Guard
### Requirements
Create reusable ownership validation service:
`CanAccessRestaurant(userId, restaurantId)` → true/false.

### Acceptance Criteria
- Ownership validation centralized.
- No duplicated ownership logic.
- Tests pass.

## Task 5. Protect Restaurant Management Pages
### Requirements
Protect all owner pages (profile, hours, gallery, menu, photos, amenities, contact, social links, SEO, future modules). Prevent URL manipulation.

### Acceptance Criteria
- Only owned restaurant accessible.
- Invalid restaurant id rejected.
- Unauthorized access blocked.
- Tests pass.

## Task 6. Secure Backend APIs
### Requirements
Every management API verifies ownership. Never trust RestaurantId from client. Server determines allowed RestaurantId from authenticated owner.

### Acceptance Criteria
- Every write endpoint protected.
- Every read endpoint protected.
- Server ignores forged IDs.
- Tests pass.

## Task 7. Repository-Level Data Filtering
### Requirements
Repository methods scoped by restaurant/owner (e.g. GetRestaurantForOwner(), GetMenusForRestaurant(), GetGalleryForRestaurant()).

### Acceptance Criteria
- Owner repositories scoped.
- Cross-restaurant queries impossible.
- Tests pass.

## Task 8. UI Navigation Isolation
### Requirements
Owner dashboard only shows owned restaurant navigation:
- My Restaurant
- My Menu
- My Gallery
- My Hours

### Acceptance Criteria
- Dashboard scoped.
- No links to other restaurants.
- Backend still blocks manual URL changes.

## Task 9. Ownership Validation During CRUD
### Requirements
Validate ownership before Create, Edit, Delete, Upload, Publish, Archive.

### Acceptance Criteria
- Every mutation validates ownership.
- Unauthorized operations return Forbidden.
- Tests pass.

## Task 10. Security Logging
### Requirements
Log ownership violations with:
- UserId
- Requested RestaurantId
- Actual RestaurantId
- Endpoint
- Timestamp
- IP (if available)

### Acceptance Criteria
- Unauthorized attempts logged.
- Generic 403 returned.
- Logs contain investigation details.

## Task 11. Integration Testing
### Requirements
Test:
- Owner edits own resources.
- Owner cannot access another restaurant.
- Admin can access all.
- Anonymous denied.

### Acceptance Criteria
- Positive scenarios pass.
- Negative scenarios blocked.
- No privilege escalation.
- Automated integration tests.

## Task 12. Final Security Review
### Requirements
Review all owner modules for authorization consistency and verify no authorization bypasses.

### Acceptance Criteria
- All modules reviewed.
- Shared authorization used.
- No known bypasses.
- Security checklist completed.
- PR-21 acceptance criteria satisfied.

# Definition of Done

- Every owner accesses only their own restaurant.
- UI restricted to owned resources.
- APIs enforce ownership.
- Repository/service layers prevent cross-tenant access.
- URL/API forgery blocked.
- Unauthorized attempts logged.
- Integration tests cover positive and negative scenarios.
- Reusable authorization foundation implemented.
