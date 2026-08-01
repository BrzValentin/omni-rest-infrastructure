# Phase 6 - PR-18. Structured Restaurant Information

## Goal

Implement structured data (Structured Data / Schema.org) so that search engines can automatically understand restaurant information and use it to improve local search results.

---

# Task 1. Schema Foundation

## Goal

Create the infrastructure for generating structured data.

### Requirements

- Add a shared JSON-LD generation module.
- Support attaching multiple Schema.org objects.
- Insert JSON-LD into the `<head>` section of the page.
- Use the `application/ld+json` format.
- Generate structured data only for published restaurant websites.
- Do not include empty properties when data is unavailable.

### Acceptance Criteria

- JSON-LD is present in the generated HTML.
- Output is valid JSON-LD.
- No empty properties are included.
- The generated schema passes Schema Validator without errors.

---

# Task 2. Restaurant Identity Schema

## Goal
Provide the restaurant's primary identity information.

### Requirements
- Restaurant Name
- Description
- Logo
- Website URL
- Restaurant Type
- Price Range (if configured)

All values must be automatically populated from the restaurant settings.

### Acceptance Criteria
- Restaurant name is included.
- Description is included.
- Website URL is correct.
- Logo is included when available.
- No empty properties are generated.

---

# Task 3. Address & Contact Information

## Goal
Provide the restaurant's contact information.

### Requirements
- Street Address
- City
- Province/State
- Postal Code
- Country
- Phone Number
- Email (if provided)

Use the Schema.org `PostalAddress` type.

### Acceptance Criteria
- Address follows Schema.org.
- Phone number is included.
- Email is included only when available.
- Values match restaurant settings.

---

# Task 4. Opening Hours Schema

## Goal
Provide the restaurant's operating hours.

### Requirements
- Use `OpeningHoursSpecification`.
- Support every day of the week.
- Support closed days.
- Support multiple opening periods.
- Support a "Closed" status.

### Acceptance Criteria
- All weekdays are generated correctly.
- Closed days contain no opening times.
- Multiple opening periods are generated correctly.
- Validation passes.

---

# Task 5. Menu Schema

## Goal
Provide structured information about the menu.

### Requirements
- Include Menu URL when a published menu exists.
- Omit the property when no menu exists.
- Use Schema.org `Menu`.

### Acceptance Criteria
- Menu URL is included when available.
- Property is omitted otherwise.
- URL points to the published menu.

---

# Task 6. Geo Coordinates

## Goal
Provide geographic coordinates.

### Requirements
- Include Latitude and Longitude when available.
- Omit them otherwise.

### Acceptance Criteria
- Coordinates follow Schema.org.
- Validation passes.

---

# Task 7. Social & External Links

## Goal
Provide official restaurant profiles.

### Requirements
Support:
- Facebook
- Instagram
- TikTok
- X
- YouTube
- LinkedIn

Use `sameAs` and include only existing links.

### Acceptance Criteria
- All configured links are included.
- Empty links are omitted.
- Schema is valid.

---

# Task 8. Image Schema

## Goal
Provide restaurant images.

### Requirements
- Logo
- Cover Image
- Main Restaurant Photo

Use absolute URLs.

### Acceptance Criteria
- Images are included when available.
- URLs are absolute.
- Validation passes.

---

# Task 9. Automatic Data Synchronization

## Goal
Automatically update structured data.

### Requirements
Update schema automatically after changes to:
- Restaurant name
- Address
- Phone number
- Opening hours
- Menu
- Images

### Acceptance Criteria
- JSON-LD updates automatically.
- No manual cache clearing.
- Published data is always current.

---

# Task 10. Validation & QA

## Goal
Validate the implementation.

### Requirements
Verify using:
- Google Rich Results Test
- Schema.org Validator
- JSON-LD validation
- Empty property check
- Duplicate schema check

Test:
- Complete restaurant
- No menu
- No social links
- No coordinates
- Multiple opening periods

### Acceptance Criteria
- No validation errors.
- All scenarios pass.
- No duplicate schemas.

---

# Development Order

| Task | Name | Dependency |
|------|------|------------|
|1|Schema Foundation|—|
|2|Restaurant Identity Schema|1|
|3|Address & Contact Information|2|
|4|Opening Hours Schema|3|
|5|Menu Schema|2|
|6|Geo Coordinates|3|
|7|Social & External Links|2|
|8|Image Schema|2|
|9|Automatic Data Synchronization|2–8|
|10|Validation & QA|1–9|
