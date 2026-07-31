# Phase 2 --- Restaurant Information

## Task 2.1 --- Restaurant Contact Information Model

### Description

Create the data model for storing restaurant contact information.

### Requirements

Add the following fields: - phone - email (nullable) - website
(nullable)

Rules: - One primary phone number - Email is optional - Website is
optional

### Acceptance Criteria

-   The model contains all required fields.
-   Nullable fields are supported.
-   Database migration applies successfully.
-   Data can be stored and retrieved correctly.

------------------------------------------------------------------------

## Task 2.2 --- Restaurant Address Model

### Description

Add support for storing the restaurant's physical address.

### Requirements

-   street
-   city
-   province/state
-   postalCode
-   country

All fields are required except `postalCode`, if allowed by business
rules.

### Acceptance Criteria

-   Address can be stored.
-   Address can be retrieved.
-   Required fields are properly validated.

------------------------------------------------------------------------

## Task 2.3 --- Restaurant Coordinates

### Description

Add support for storing geographic coordinates.

### Requirements

-   latitude
-   longitude

Coordinates will be used for map display.

### Acceptance Criteria

-   Coordinates can be stored.
-   Coordinates can be retrieved.
-   Latitude and longitude values are validated within valid ranges.

------------------------------------------------------------------------

## Task 2.4 --- Restaurant Business Hours Model

### Description

Create the data model for the restaurant's regular business hours.

### Requirements

For each day of the week store: - dayOfWeek - isOpen - openTime -
closeTime

Rule: - If `isOpen = false`, opening and closing times may be omitted.

### Acceptance Criteria

-   Weekly business hours can be stored.
-   Closed days are supported.
-   Business hours are retrieved correctly.

------------------------------------------------------------------------

## Task 2.5 --- Special Hours Support

### Description

Add support for special business hours.

### Requirements

Support: - Public holidays - Reduced operating hours - Fully closed days

Fields: - date - isClosed - openTime - closeTime - note (optional)

### Acceptance Criteria

-   Special hours can be created.
-   Special hours do not modify the regular schedule.
-   Special hours are retrieved correctly.

------------------------------------------------------------------------

## Task 2.6 --- Restaurant Social Links Model

### Description

Add support for storing restaurant social media links.

### Requirements

Supported platforms: - Facebook - Instagram - TikTok - X (Twitter) -
YouTube - LinkedIn

All fields are optional.

### Acceptance Criteria

-   Links can be stored.
-   Missing links do not cause errors.
-   Links can be retrieved correctly.

------------------------------------------------------------------------

## Task 2.7 --- Restaurant Information API

### Description

Create a public API endpoint that returns restaurant information.

### Requirements

Returns: - Contact information - Address - Coordinates - Regular
business hours - Special business hours - Social media links

### Acceptance Criteria

-   Endpoint returns all required information.
-   Optional fields are handled correctly.
-   Response matches the API contract.

------------------------------------------------------------------------

## Task 2.8 --- Restaurant Information Validation

### Description

Implement validation for restaurant information.

### Requirements

Validate: - Phone format - Email format - Website URL - Social media
URLs - Latitude (-90 to 90) - Longitude (-180 to 180) -
`openTime < closeTime`

### Acceptance Criteria

-   Invalid data is rejected.
-   Valid data is accepted.
-   Clear validation errors are returned.

------------------------------------------------------------------------

## Task 2.9 --- Public Restaurant Information UI

### Description

Display restaurant information on the public restaurant page.

### Requirements

Display: - Restaurant name - Phone - Email (if available) - Address -
Map - Regular business hours - Special business hours - Social media
links

Hide empty fields.

### Acceptance Criteria

-   All available information is displayed.
-   Empty fields are hidden.
-   Responsive on desktop and mobile.

------------------------------------------------------------------------

## Task 2.10 --- Google Maps Integration

### Description

Display the restaurant location on a map.

### Requirements

Use coordinates. If unavailable, display the address only.

Map includes: - Restaurant marker - Directions link

### Acceptance Criteria

-   Map displays correctly.
-   Marker is accurate.
-   Missing coordinates do not cause errors.

------------------------------------------------------------------------

## Task 2.11 --- Business Hours Display

### Description

Implement the business hours display component.

### Requirements

Display: - Days of the week - Opening time - Closing time - Closed
status

Highlight the current day.

### Acceptance Criteria

-   Schedule displays correctly.
-   Closed days display correctly.
-   Current day is highlighted.

------------------------------------------------------------------------

## Task 2.12 --- Open Now Status

### Description

Implement real-time restaurant status calculation.

### Requirements

Support: - Open Now - Closed - Opens at HH:mm - Closes at HH:mm

Special hours override regular hours. Use the restaurant time zone.

### Acceptance Criteria

-   Status is calculated correctly.
-   Special hours take precedence.
-   Time zone is respected.

------------------------------------------------------------------------

# Phase 1 Completion

After completing Phase 2, the system supports:

-   Restaurant contact information
-   Full restaurant address
-   Geographic coordinates
-   Google Maps integration
-   Regular business hours
-   Special business hours
-   Social media links
-   Public Restaurant Information API
-   Validation of all restaurant information
-   Public restaurant information page
-   Real-time Open/Closed status
