# Phase 7 — PR-20. Independent Restaurants

## Overall Goal

Transform the application from a single-restaurant system into a true multi-tenant platform where each restaurant is fully isolated and has its own data.

# Task 1. Multi-Restaurant Data Model

## Objective
Prepare the data model to support multiple restaurants.

### Requirements
- Create a Restaurant entity.
- Each restaurant must have a unique ID.
- Add a required Restaurant relationship to all restaurant-specific data.
- Design all new entities with multi-restaurant architecture in mind.
- Define the required fields for the Restaurant entity.
- Create the necessary database migrations.

### Acceptance Criteria
- A Restaurant table exists.
- Every restaurant has a unique identifier.
- All restaurant-related entities can be associated with a Restaurant.
- Database migrations execute successfully.

# Task 2. Restaurant Resolution

## Objective
Determine which restaurant should handle the current request.

### Requirements
- Implement a mechanism to resolve the active restaurant.
- Support restaurant resolution by:
  - domain
  - subdomain
  - configuration (for future extensibility)
- Return HTTP 404 if the restaurant cannot be resolved.
- Make the resolved Restaurant available throughout the application.

### Acceptance Criteria
- Every HTTP request resolves the current restaurant.
- Unknown restaurants return HTTP 404.
- Application services receive the current Restaurant without repeated resolution.

# Task 3. Restaurant Context Infrastructure

## Objective
Create infrastructure for accessing the current restaurant across the application.

### Requirements
- Implement a RestaurantContext.
- The context must contain:
  - Restaurant ID
  - Restaurant entity
- Make the context accessible to application services.
- Business logic must never resolve the restaurant directly.

### Acceptance Criteria
- All services use RestaurantContext.
- The context is created once per request.
- No duplicate restaurant resolution occurs.

# Task 4. Restaurant Data Isolation

## Objective
Ensure complete isolation of restaurant data.

### Requirements
- Filter all data queries by the current restaurant.
- Prevent access to data belonging to other restaurants.
- Implement automatic filtering at the Repository/ORM level.
- Eliminate the possibility of accidental data leakage.

### Acceptance Criteria
- One restaurant cannot access another restaurant's data.
- All queries are automatically scoped to the current restaurant.
- Controllers do not perform manual restaurant filtering.

# Task 5. Restaurant Configuration

## Objective
Support restaurant-specific configuration.

### Requirements
Create a restaurant configuration model supporting:
- Restaurant name
- Logo
- Time zone
- Currency
- Language
- Contact information
- Address
- Social media links

Configuration must be stored separately from system data.

### Acceptance Criteria
- Every restaurant has its own configuration.
- Updating one restaurant's configuration does not affect others.
- Configuration is accessible through a centralized service.

# Task 6. Independent Restaurant Website

## Objective
Provide an independent public website for each restaurant.

### Requirements
- Each restaurant has its own public website.
- All pages display only data belonging to the current restaurant.
- Contact information is loaded from the restaurant configuration.
- Branding (logo and name) is restaurant-specific.

### Acceptance Criteria
- Switching restaurants displays a different website.
- No restaurant data is mixed.
- All pages use data from the current restaurant.

# Task 7. Independent Menus

## Objective
Isolate restaurant menus.

### Requirements
- Menus belong to a restaurant.
- Menu categories belong to a restaurant.
- Menu items belong to a restaurant.
- Menu search operates only within the current restaurant.

### Acceptance Criteria
- Every restaurant has its own menu.
- Menus from other restaurants cannot be accessed.
- Search never returns menu items from another restaurant.

# Task 8. Independent Gallery

## Objective
Isolate restaurant galleries.

### Requirements
- All images belong to a restaurant.
- The gallery displays only images belonging to the current restaurant.
- Uploaded images are automatically associated with the current restaurant.

### Acceptance Criteria
- Restaurant galleries are completely independent.
- Images from other restaurants are inaccessible.
- All uploaded images are automatically assigned to the correct restaurant.

# Task 9. Independent Contact Information

## Objective
Support restaurant-specific contact information.

### Requirements
Each restaurant must maintain its own:
- Phone number
- Email address
- Physical address
- Business hours
- Map location
- Social media links

All public pages must use only this restaurant's contact information.

### Acceptance Criteria
- Contact information is unique per restaurant.
- Updating one restaurant's contact information does not affect others.
- Public pages always display the correct contact information.

# Task 10. Restaurant Administration

## Objective
Provide the foundation for managing multiple restaurants.

### Requirements
- Implement restaurant CRUD functionality.
- Create new restaurants.
- Update restaurant configuration.
- Disable restaurants.
- Delete restaurants (subject to defined business rules).

### Acceptance Criteria
- Administrators can create new restaurants.
- Newly created restaurants become available to the platform.
- Disabled restaurants are no longer served.
- Full CRUD functionality works as expected.

# Task 11. Multi-Restaurant Validation

## Objective
Verify the platform operates correctly with multiple restaurants.

### Requirements
Validate:
- Menu isolation
- Gallery isolation
- Contact information isolation
- Configuration isolation
- Website isolation
- Restaurant resolution
- Absence of cross-restaurant data leakage

Create a comprehensive integration test suite.

### Acceptance Criteria
- At least two restaurants exist in the test environment.
- All restaurant data is fully isolated.
- Public websites display only the correct restaurant's data.
- All integration tests pass successfully.
- No cross-restaurant data leakage is detected.

# PR-20 Task Summary

| # | Task | Outcome |
|---|------|---------|
|1|Multi-Restaurant Data Model|Multi-tenant data model established|
|2|Restaurant Resolution|Active restaurant resolved for every request|
|3|Restaurant Context Infrastructure|Centralized restaurant context available application-wide|
|4|Restaurant Data Isolation|Complete restaurant data isolation|
|5|Restaurant Configuration|Restaurant-specific configuration management|
|6|Independent Restaurant Website|Independent public website for each restaurant|
|7|Independent Menus|Independent restaurant menus|
|8|Independent Gallery|Independent restaurant galleries|
|9|Independent Contact Information|Restaurant-specific contact information|
|10|Restaurant Administration|Restaurant management (CRUD)|
|11|Multi-Restaurant Validation|End-to-end validation of the multi-restaurant platform|
