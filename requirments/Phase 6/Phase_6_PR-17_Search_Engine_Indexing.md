# Phase 6 - PR-17. Search Engine Indexing

## Goal

Ensure proper indexing of all public website pages by search engines
(Google, Bing, etc.) while preventing administrative and private
sections from being indexed.

------------------------------------------------------------------------

# Task 1. Define Indexable Pages

## Description

Identify which pages are public and should be indexed by search engines,
and which pages should be excluded from indexing.

### Requirements

-   Create a complete list of all page types.
-   Classify every page as either:
    -   **Indexable**
    -   **Non-indexable**
-   Document the reason for each classification.

### Indexable Pages

-   Home
-   Restaurant Page
-   Category Page
-   Dish Page (if it has its own URL)
-   Gallery (if public)
-   About
-   Contact

### Non-indexable Pages

-   Login
-   Registration
-   Forgot Password
-   Admin Panel
-   Dashboard
-   Restaurant Management
-   API Endpoints
-   Error Pages
-   Temporary Preview Pages

### Acceptance Criteria

-   All page types are classified.
-   No ambiguous cases remain.
-   Documentation is completed and approved.

------------------------------------------------------------------------

# Task 2. Configure robots.txt

## Description

Configure the `robots.txt` file to control how search engine crawlers
access the website.

### Requirements

-   Allow crawling of all public pages.
-   Disallow crawling of:
    -   `/admin`
    -   `/dashboard`
    -   `/api`
    -   `/login`
    -   `/register`
-   Include a reference to `sitemap.xml`.

Example:

``` text
User-agent: *

Disallow: /admin
Disallow: /dashboard
Disallow: /api
Disallow: /login
Disallow: /register

Sitemap: https://domain.com/sitemap.xml
```

### Acceptance Criteria

-   `robots.txt` is publicly accessible.
-   Search engine crawlers can access all public pages.
-   Restricted sections are blocked from crawling.
-   The sitemap location is specified.

------------------------------------------------------------------------

# Task 3. Generate XML Sitemap

## Description

Implement automatic generation of `sitemap.xml`.

### Requirements

Include only indexable pages.

Each entry contains: - URL - lastmod - changefreq - priority

Automatically update when: - Restaurant is created - Restaurant is
updated - Dish is published - URL changes

### Acceptance Criteria

-   Generated automatically.
-   Only public pages included.
-   Valid URLs.
-   Valid XML.

------------------------------------------------------------------------

# Task 4. Implement Meta Robots Rules

Public pages: `index, follow`

Restricted pages: `noindex, nofollow`

404 pages: `noindex`

Search pages (if any): `noindex, follow`

### Acceptance Criteria

-   Correct meta robots on every page.

------------------------------------------------------------------------

# Task 5. Add Canonical URLs

Every public page must contain:

``` html
<link rel="canonical">
```

Canonical URLs must: - be absolute; - point to the primary page; - not
contain query parameters.

### Acceptance Criteria

-   Canonical exists on every public page.
-   No circular references.
-   No invalid canonical URLs.

------------------------------------------------------------------------

# Task 6. Prevent Duplicate URLs

Use one canonical URL format.

Do not index parameterized URLs such as: - `?ref=` - `?sort=` - `?page=`

Use redirects where appropriate.

### Acceptance Criteria

-   One canonical URL per page.
-   Duplicate URLs are not indexed.
-   Redirects work correctly.

------------------------------------------------------------------------

# Task 7. Validate HTTP Status Codes

Use: - 200 - 301 - 404 - 410 (if applicable)

Do not use: - Soft 404 - 200 for missing pages

### Acceptance Criteria

-   Correct status codes everywhere.

------------------------------------------------------------------------

# Task 8. Verify Search Engine Accessibility

Verify: - robots.txt - sitemap.xml - canonical URLs - meta robots - HTTP
status codes - public pages are crawlable

### Acceptance Criteria

-   All checks pass.
-   Site is ready for indexing.

------------------------------------------------------------------------

# Implementation Order

  \#   Task                                 Dependency
  ---- ------------------------------------ --------------------
  1    Define Indexable Pages               ---
  2    Configure robots.txt                 1
  3    Generate XML Sitemap                 1
  4    Implement Meta Robots Rules          1
  5    Add Canonical URLs                   4
  6    Prevent Duplicate URLs               5
  7    Validate HTTP Status Codes           6
  8    Verify Search Engine Accessibility   All previous tasks
