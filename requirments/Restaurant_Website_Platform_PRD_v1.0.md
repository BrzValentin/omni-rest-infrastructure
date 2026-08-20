# Product Requirements Document (PRD)

## Product
**Restaurant Website Platform**

**Version:** MVP v1.0

---

# Product Vision

Build a modern platform for restaurants that lets owners manage their website independently, without involving developers, while allowing visitors to quickly find up-to-date information about the restaurant, its menu, and ways to get in touch.

# Product Goals

## For the visitor
- quickly find a restaurant
- view the current menu
- see prices
- get contact information
- get directions
- call the restaurant

## For the owner
- update information independently
- change the menu and prices
- add photos
- manage the website without technical knowledge

# Product Constraints

Although the MVP supports only a single restaurant, the product must be designed with future expansion to a multi-restaurant platform in mind, without requiring a full system redesign.

The digital menu must remain reachable through a stable, direct, permanent URL that does not depend on navigating from the home page first (for example `/menu`, or a per-restaurant equivalent once multi-restaurant is live). A restaurant will be able to place a QR code (on tables, signage, or printed materials) that visitors scan with their phone camera to land directly on the menu section of the site. This QR-code concept will be implemented in a later phase (see Phase 9), but current development must not introduce anything — login walls, required session/cart state, client-only rendering, or unstable/query-dependent URLs — that would block adding it later without a redesign.

---

# Phase 1 — Restaurant Website Foundation

## Goal
Create a modern public restaurant website with core information.

### PR-1. Home Page
**Acceptance Criteria**
- restaurant name
- brief description
- main image
- **View Menu** button
- **Call** button
- **Directions** button
- the Directions button opens a navigation app or map service with a route to the restaurant.

### PR-2. Restaurant Information
**Acceptance Criteria**
- phone number
- address
- email (if provided)
- map
- regular business hours
- links to social media (if provided)

### PR-3. Special Operating Hours
**Acceptance Criteria**
- special operating hours by date
- ability to mark the restaurant as closed
- special hours take priority over regular hours

### PR-4. Responsive Experience
**Acceptance Criteria**
- works correctly on mobile devices
- works correctly on tablets
- works correctly on desktop computers

---

# Phase 2 — Digital Menu

## Goal
Provide a modern digital menu.

### PR-5. Menu Browsing
**Acceptance Criteria**
Each dish displays:
- name
- description
- price
- photo
- Dietary Badges:
  - Vegetarian
  - Vegan
  - Gluten-Free
  - Dairy-Free
  - Halal
  - Spicy
  - Contains Nuts
  - Popular
  - New

If taxes are not included in the price, a GST/PST footnote is displayed.

### PR-6. Menu Categories
**Acceptance Criteria**
- browse categories
- switch between categories
- view dishes within a category

### PR-7. Dish Availability
**Acceptance Criteria**
Unavailable dishes have a clear visual indicator.

---

# Phase 3 — Restaurant Management

## Goal
Allow the owner to manage the website independently.

### PR-8. Authentication
**Acceptance Criteria**
- log in
- log out

### PR-9. Restaurant Information Management
**Acceptance Criteria**
The owner can change:
- name
- description
- phone number
- address
- email
- regular business hours
- special operating hours
- social media links
- main image

Supported platforms:
- Instagram
- Facebook
- TikTok
- Google Business Profile

After saving, changes are published automatically.

### PR-10. Phone Interaction
**Acceptance Criteria**
On mobile devices, the Call button initiates a phone call.

---

# Phase 4 — Menu Management

## Goal
Full menu management.

### PR-11. Category Management
**Acceptance Criteria**
- create a category
- rename
- delete
- reorder

### PR-12. Dish Management
**Acceptance Criteria**
- add a dish
- edit a dish
- delete a dish
- description
- photo
- tags:
  - Vegetarian
  - Vegan
  - Gluten-Free
  - Dairy-Free
  - Halal
  - Spicy
  - Contains Nuts
  - Popular
  - New

### PR-13. Price Management
**Acceptance Criteria**
- change price
- the new price is published after saving
- GST/PST information is displayed when applicable

### PR-14. Dish Availability
**Acceptance Criteria**
- Available
- Unavailable

---

# Phase 5 — Gallery

## Goal
Showcase the interior and dishes.

### PR-15. Public Gallery
**Acceptance Criteria**
- view photos

### PR-16. Gallery Management
**Acceptance Criteria**
- upload
- delete
- reorder

---

# Phase 6 — Search Visibility

## Goal
Increase organic traffic.

### PR-17. Search Engine Indexing
All public pages are available for indexing.

### PR-18. Structured Restaurant Information
Search engines receive structured information:
- name
- description
- address
- contacts
- business hours
- menu

### PR-19. Searchable Menu
The menu is indexed as text, not as a PDF.

---

# Phase 7 — Multi-Restaurant Platform

## Goal
Support multiple restaurants.

### PR-20. Independent Restaurants
Each restaurant has:
- its own website
- menu
- photos
- contacts
- settings

### PR-21. Independent Management
The owner manages only their own restaurant.

---

# Phase 8 — Product Polish

## Goal
Prepare the product for commercial use.

### PR-22. Error Handling
Clear error messages.

### PR-23. Performance
Fast loading of core pages.

### PR-24. Ease of Use
An owner without technical knowledge can:
- change a price
- add a dish
- change business hours
- change special hours
- upload photos
- change contact information

### PR-25. Content Publishing
After saving, changes are published automatically within a set time frame.

---

# Phase 9 — QR Code Menu Access (Future)

## Goal
Let visitors open the digital menu directly by scanning a QR code, without navigating the rest of the website first.

### PR-26. QR Code Menu Access
**Status:** Planned for a future phase, not part of the MVP scope. Current development must keep the menu page directly linkable so this can be added later without a redesign.

**Acceptance Criteria**
- The owner can generate a QR code that links directly to the restaurant's menu page.
- Scanning the QR code opens the menu section of the site, not the home page.
- The QR code links to a stable URL that keeps working across menu content updates.
- The QR code image can be downloaded or printed by the owner for use on tables, signage, or printed materials.
- The menu page opens correctly on scan without requiring login or app installation.
