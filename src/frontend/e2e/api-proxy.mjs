import http from "node:http";

const upstream = new URL("http://127.0.0.1:5279");
const seedPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let recoverableErrorRequests = 0;
let designContentMode = "standard";
let publicationSequence = 3;
const websiteDesigns = [
  { id: "legacy-current-v1", name: "Current design", contractVersion: "1", availability: "grandfathered" },
  { id: "quiet-elegance-v1", name: "Quiet Elegance", contractVersion: "1", availability: "available" },
  { id: "nightfall-v1", name: "Nightfall", contractVersion: "1", availability: "available" },
  { id: "broadsheet-v1", name: "Broadsheet", contractVersion: "1", availability: "available" },
  { id: "sunroom-v1", name: "Sunroom", contractVersion: "1", availability: "available" },
];

const adminRestaurant = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Prairie Table",
  description: "Seasonal food from the prairies.",
  phoneE164: "+12045550123",
  phoneDisplay: "(204) 555-0123",
  email: "hello@prairietable.test",
  timeZone: "America/Winnipeg",
  address: { line1: "1 Main Street", line2: null, city: "Winnipeg", region: "MB", postalCode: "R3C 1A1", countryCode: "CA", latitude: null, longitude: null },
  regularHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({ dayOfWeek, intervals: dayOfWeek === 0 ? [] : [{ opensAt: "09:00:00", closesAt: "17:00:00", closesNextDay: false }] })),
  specialHours: [],
  socialLinks: [{ platform: "instagram", url: "https://instagram.com/prairietable" }],
  mainImage: null,
  draftDesignId: "legacy-current-v1",
  publishedDesignId: "legacy-current-v1",
  websiteDesigns,
  draftVersion: "3",
  eTag: '"draft-e2e-3"',
  publicationStatus: { operationId: "22222222-2222-2222-2222-222222222222", status: "published", draftVersion: "3", attemptCount: 1, errorCode: null, updatedAt: "2026-07-31T12:00:00Z" },
};

const publicRestaurant = {
  id: adminRestaurant.id,
  name: adminRestaurant.name,
  shortDescription: adminRestaurant.description,
  phone: { e164: adminRestaurant.phoneE164, display: adminRestaurant.phoneDisplay },
  email: adminRestaurant.email,
  timeZone: adminRestaurant.timeZone,
  address: { streetLine1: "1 Main Street", streetLine2: null, city: "Winnipeg", region: "MB", postalCode: "R3C 1A1", countryCode: "CA", formatted: "1 Main Street, Winnipeg, MB R3C 1A1", latitude: null, longitude: null, directionsUrl: "https://www.google.com/maps/dir/?api=1&destination=1%20Main%20Street" },
  regularHours: adminRestaurant.regularHours,
  specialHours: [],
  status: { state: "open", label: "Open", nextChangeAt: null, source: "regularHours" },
  socialLinks: adminRestaurant.socialLinks,
  mainImage: null,
  publicationVersion: "3",
  websiteDesignId: "legacy-current-v1",
};

const publicMenu = {
  restaurantId: adminRestaurant.id,
  restaurantName: adminRestaurant.name,
  locale: "en-CA",
  currency: "CAD",
  taxDisplayMode: "exclusive",
  taxNoticeKey: "menu.tax.exclusive",
  publicationVersion: "3",
  websiteDesignId: "legacy-current-v1",
  restaurant: publicRestaurant,
  menu: {
    id: "33333333-3333-4333-8333-333333333333",
    name: "All Day Menu",
    categories: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        slug: "starters",
        name: "Starters",
        description: "Small plates.",
        dishes: [{
          id: "55555555-5555-4555-8555-555555555555",
          name: "Prairie Poutine",
          description: "Crisp potatoes with cheese curds.",
          price: "12.50",
          availability: "available",
          media: null,
          badges: [{ code: "vegetarian", labelKey: "menu.badge.vegetarian", category: "dietary" }],
        }],
      },
      {
        id: "66666666-6666-4666-8666-666666666666",
        slug: "desserts",
        name: "Desserts",
        description: "Something sweet.",
        dishes: [{
          id: "77777777-7777-4777-8777-777777777777",
          name: "Saskatoon Berry Tart",
          description: "Buttery pastry with prairie berries.",
          price: "9.00",
          availability: "unavailable",
          media: null,
          badges: [{ code: "contains_nuts", labelKey: "menu.badge.containsNuts", category: "allergen" }],
        }],
      },
    ],
  },
};

function designPreview(designId) {
  const preview = structuredClone(publicMenu);
  preview.websiteDesignId = designId;
  preview.restaurant.websiteDesignId = designId;

  if (designContentMode === "minimal") {
    preview.restaurantName = "M";
    preview.restaurant = {
      ...preview.restaurant,
      name: "M",
      shortDescription: null,
      phone: null,
      email: null,
      address: null,
      regularHours: [],
      specialHours: [],
      socialLinks: [],
      mainImage: null,
    };
    preview.menu = null;
  }

  if (designContentMode === "long") {
    const longName = "The Prairie Table and Northern Harvest Dining Room";
    preview.restaurantName = longName;
    preview.restaurant = {
      ...preview.restaurant,
      name: longName,
      shortDescription: "Seasonal food from the prairies, thoughtfully prepared for neighbours, travellers, families, and every long-table gathering in the heart of Winnipeg.",
      address: {
        ...preview.restaurant.address,
        formatted: "12345 Extremely Long Prairie Boulevard, Historic Exchange District, Winnipeg, Manitoba R3C 1A1",
      },
    };
    preview.menu.name = "All Day Prairie Harvest, Supper, and Late Evening Menu";
    preview.menu.categories[0].name = "Small Plates, Shared Starters, and Prairie Favourites";
    preview.menu.categories[0].dishes[0].name = "Crispy Prairie Potato Poutine with Bothwell Cheese Curds and House Gravy";
    preview.menu.categories[0].dishes[0].description = "A deliberately long description that verifies every renderer wraps restaurant-owned menu copy without clipping, overlap, or horizontal overflow at narrow viewport widths.";
  }

  return preview;
}

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function publishDesign(designId) {
  publicationSequence += 1;
  const version = String(publicationSequence);
  adminRestaurant.draftDesignId = designId;
  adminRestaurant.publishedDesignId = designId;
  adminRestaurant.draftVersion = version;
  adminRestaurant.eTag = '"draft-e2e-' + version + '"';
  adminRestaurant.publicationStatus = {
    ...adminRestaurant.publicationStatus,
    status: "succeeded",
    draftVersion: version,
    updatedAt: "2026-08-20T12:00:00Z",
  };
  publicRestaurant.websiteDesignId = designId;
  publicRestaurant.publicationVersion = version;
  publicMenu.websiteDesignId = designId;
  publicMenu.publicationVersion = version;
}

function mockAdmin(request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://admin.localhost");
  const path = requestUrl.pathname;
  if (path === "/__e2e/published-design" && request.method === "POST") {
    const designId = requestUrl.searchParams.get("designId");
    if (!websiteDesigns.some((item) => item.id === designId)) {
      return json(response, 400, { code: "invalid_website_design" });
    }
    publishDesign(designId);
    return json(response, 200, {
      designId,
      publicationVersion: publicRestaurant.publicationVersion,
    });
  }
  if (path === "/__e2e/design-content" && request.method === "POST") {
    const mode = requestUrl.searchParams.get("mode");
    if (!["standard", "long", "minimal"].includes(mode ?? "")) {
      return json(response, 400, { code: "invalid_design_content_mode" });
    }
    designContentMode = mode;
    return json(response, 200, { mode });
  }
  const signedIn = request.headers.cookie?.includes("omni-e2e=1") ?? false;
  if (path === "/api/v1/public/restaurant") return json(response, 200, publicRestaurant);
  if (path === "/api/v1/public/menu") return json(response, 200, publicMenu);
  if (path === "/api/v1/auth/antiforgery") return json(response, 200, { token: "e2e-token", headerName: "X-CSRF-TOKEN" });
  if (path === "/api/v1/auth/login" && request.method === "POST") return json(response, 200, { userId: "owner-e2e", displayName: "Owner", memberships: [{ restaurantId: adminRestaurant.id, role: "owner" }], idleExpiresAt: "2026-08-01T12:00:00Z", absoluteExpiresAt: "2026-08-01T12:00:00Z", returnPath: "/admin/restaurant" }, { "set-cookie": "omni-e2e=1; Path=/; HttpOnly; SameSite=Lax" });
  if (path === "/api/v1/auth/logout" && request.method === "POST") return json(response, 204, null, { "set-cookie": "omni-e2e=; Path=/; Max-Age=0" });
  if (path === "/api/v1/auth/session") return signedIn ? json(response, 200, { userId: "owner-e2e", displayName: "Owner", memberships: [{ restaurantId: adminRestaurant.id, role: "owner" }], idleExpiresAt: "2026-08-01T12:00:00Z", absoluteExpiresAt: "2026-08-01T12:00:00Z", returnPath: "/admin" }) : json(response, 401, { code: "unauthorized" });
  if (!signedIn) return json(response, 401, { code: "unauthorized" });
  if (path === "/api/v1/admin/restaurant/preview") return json(response, 200, publicRestaurant);
  if (path.startsWith("/api/v1/admin/website-designs/") && path.endsWith("/preview")) {
    const designId = decodeURIComponent(path.split("/").at(-2) ?? "");
    if (!websiteDesigns.some((item) => item.id === designId)) {
      return json(response, 404, { code: "not_found" });
    }
    return json(response, 200, designPreview(designId));
  }
  if (path === "/api/v1/admin/restaurant" && request.method === "GET") return json(response, 200, adminRestaurant, { etag: adminRestaurant.eTag });
  if (path === "/api/v1/admin/restaurant/design" && request.method === "PUT") {
    let body = "";
    request.on("data", (chunk) => { body += chunk; });
    request.on("end", () => {
      const designId = JSON.parse(body).designId;
      if (!websiteDesigns.some((item) => item.id === designId && item.availability === "available")) {
        return json(response, 400, { code: "website_design_unavailable" });
      }
      publishDesign(designId);
      return json(response, 200, {
        restaurant: adminRestaurant,
        publication: adminRestaurant.publicationStatus,
      }, { etag: adminRestaurant.eTag });
    });
    return;
  }
  if (path.startsWith("/api/v1/admin/publication-status/") && request.method === "GET") return json(response, 200, adminRestaurant.publicationStatus);
  if (path.startsWith("/api/v1/admin/publication-status/") && path.endsWith("/retry") && request.method === "POST") {
    adminRestaurant.publicationStatus = {
      ...adminRestaurant.publicationStatus,
      status: "succeeded",
      attemptCount: (adminRestaurant.publicationStatus?.attemptCount ?? 0) + 1,
      errorCode: null,
      updatedAt: "2026-08-20T12:01:00Z",
    };
    adminRestaurant.publishedDesignId = adminRestaurant.draftDesignId;
    publicRestaurant.websiteDesignId = adminRestaurant.publishedDesignId;
    publicMenu.websiteDesignId = adminRestaurant.publishedDesignId;
    return json(response, 200, adminRestaurant.publicationStatus);
  }
  if (path.startsWith("/api/v1/admin/") && ["POST", "PUT"].includes(request.method ?? "")) return json(response, 200, { restaurant: adminRestaurant, publication: adminRestaurant.publicationStatus }, { etag: adminRestaurant.eTag });
  if (path.startsWith("/api/v1/admin/") && request.method === "DELETE") return json(response, 204, null, { etag: adminRestaurant.eTag });
  return json(response, 404, { code: "not_found" });
}

function sendTemporaryFailure(response) {
  response.writeHead(503, { "content-type": "application/problem+json" });
  response.end(JSON.stringify({ title: "Temporary test failure", status: 503 }));
}

/* ===========================================================================
 * Phase 8 fixtures: independent fault hosts, and a self-contained owner portal.
 *
 * Nothing below touches `error.localhost`. That host fails exactly ONCE and then
 * recovers, and `e2e/menu.spec.ts` is its single consumer (the reason is recorded
 * in `e2e/seo.spec.ts`): a second consumer would steal the one-shot failure and
 * make both specs unreliable. Every host here is independent of it and of every
 * other host here, and each is switched explicitly with
 *
 *     POST /__e2e/fault?host=<host>&mode=<mode>
 *
 * so a spec states the fault it wants, repeats it as often as it likes, and turns
 * it off again to prove the page recovers rather than merely fails politely.
 * ========================================================================= */

/**
 * Current fault mode per host. The seeded value is the fault, so a spec that forgets
 * to arm a host still sees the failure it was written for rather than a green pass.
 */
const faultModes = new Map([
  /** Hard `500` on every request. `error.localhost` only ever emits `503`. */
  ["fail500.localhost", "on"],
  /** Accepts the connection and never answers, so the caller has to give up on its own. */
  ["stall.localhost", "on"],
  /** Sends response headers and then drops the connection part-way through the body. */
  ["cutoff.localhost", "on"],
  /** `200` with a body that is not JSON (`garbage`), or with no body at all (`empty`). */
  ["garbage.localhost", "garbage"],
  /** Every API path answers `404`, so the frontend takes its not-found path. */
  ["notfound-api.localhost", "on"],
  /** The owner portal with its section reads failing (`sections`); sign-in keeps working. */
  ["admin-outage.localhost", "sections"],
]);

/** Every host above forwards to the real backend under `menu.localhost` once its fault is off. */
const forwardedFaultHosts = new Set([
  "error.localhost",
  "slow.localhost",
  "fail500.localhost",
  "stall.localhost",
  "cutoff.localhost",
  "garbage.localhost",
  "notfound-api.localhost",
]);

/** Responses being held open by `stall.localhost`, so shutdown does not wait on them. */
const stalledResponses = new Set();

/**
 * Applies the armed fault for `host`, or returns false when it is switched off.
 * `admin-outage.localhost` is not here: its fault is applied inside the owner portal,
 * because only its *section* reads fail while authentication keeps answering.
 */
function applyFault(host, response) {
  const mode = faultModes.get(host) ?? "off";
  if (mode === "off") return false;

  if (host === "fail500.localhost") {
    response.writeHead(500, { "content-type": "application/problem+json" });
    response.end(JSON.stringify({ title: "Injected upstream failure", status: 500 }));
    return true;
  }
  if (host === "stall.localhost") {
    // No write at all. The frontend's own 10s read deadline is what ends this.
    stalledResponses.add(response);
    response.on("close", () => stalledResponses.delete(response));
    return true;
  }
  if (host === "cutoff.localhost") {
    // Headers promise a body far longer than what is written, then the socket goes away.
    response.writeHead(200, { "content-type": "application/json", "content-length": "4096" });
    response.write('{"restaurantId":"a1111111-1111-4111-8111-1111');
    response.socket?.destroy();
    return true;
  }
  if (host === "garbage.localhost") {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(mode === "empty" ? "" : "<!doctype html><p>this is not the JSON you asked for</p>");
    return true;
  }
  if (host === "notfound-api.localhost") {
    response.writeHead(404, { "content-type": "application/problem+json" });
    response.end(JSON.stringify({ status: 404, code: "restaurant_not_found", title: "Restaurant not found." }));
    return true;
  }
  return false;
}

const ownerBadgeCatalog = {
  vegetarian: { labelKey: "menu.badge.vegetarian", category: "dietary" },
  vegan: { labelKey: "menu.badge.vegan", category: "dietary" },
  gluten_free: { labelKey: "menu.badge.glutenFree", category: "dietary" },
  dairy_free: { labelKey: "menu.badge.dairyFree", category: "dietary" },
  halal: { labelKey: "menu.badge.halal", category: "dietary" },
  spicy: { labelKey: "menu.badge.spicy", category: "heat" },
  contains_nuts: { labelKey: "menu.badge.containsNuts", category: "allergen" },
  popular: { labelKey: "menu.badge.popular", category: "promotional" },
  new: { labelKey: "menu.badge.new", category: "promotional" },
};

let ownerIdSequence = 0;

/** A fresh identifier in the shape `lib/menu-contract.ts` validates. */
function ownerId() {
  ownerIdSequence += 1;
  return `b0000000-0000-4000-8000-${String(ownerIdSequence).padStart(12, "0")}`;
}

const ownerTimestamp = "2026-08-01T12:00:00Z";

/** A complete, self-contained restaurant. Each portal instance owns its own copy. */
function ownerSeed() {
  const menuId = "a3333333-3333-4333-8333-333333333333";
  const categoryId = "a4444444-4444-4444-8444-444444444444";
  const dessertsId = "a9999999-9999-4999-8999-999999999999";
  const publication = {
    operationId: "a8888888-8888-4888-8888-888888888888",
    status: "succeeded",
    draftVersion: "4",
    attemptCount: 1,
    errorCode: null,
    updatedAt: ownerTimestamp,
  };

  return {
    version: 4,
    saveCount: 0,
    restaurant: {
      id: "a1111111-1111-4111-8111-111111111111",
      name: "Riverbend Diner",
      description: "Neighbourhood cooking beside the river.",
      phoneE164: "+12045550101",
      phoneDisplay: "(204) 555-0101",
      email: "hello@riverbend.test",
      websiteUrl: null,
      timeZone: "America/Winnipeg",
      restaurantType: null,
      priceRange: null,
      address: {
        line1: "42 River Road", line2: null, city: "Winnipeg", region: "MB",
        postalCode: "R3B 0T4", countryCode: "CA", latitude: null, longitude: null,
      },
      regularHours: Array.from({ length: 7 }, (_, dayOfWeek) => ({
        dayOfWeek,
        intervals: dayOfWeek === 0
          ? []
          : [{ opensAt: "09:00:00", closesAt: "17:00:00", closesNextDay: false }],
      })),
      specialHours: [{
        id: "a2222222-2222-4222-8222-222222222222",
        date: "2026-12-25",
        isClosed: false,
        note: "Christmas brunch",
        intervals: [{ opensAt: "10:00:00", closesAt: "14:00:00", closesNextDay: false }],
      }],
      socialLinks: [],
      mainImage: null,
      logo: null,
      coverImage: null,
      draftDesignId: "legacy-current-v1",
      publishedDesignId: "legacy-current-v1",
      websiteDesigns,
      draftVersion: "4",
      eTag: '"owner-draft-4"',
      publicationStatus: publication,
    },
    menu: {
      menuId,
      menuName: "All Day Menu",
      categories: [{
        id: categoryId,
        name: "Mains",
        description: "Plates that come with everything.",
        slug: "mains",
        displayOrder: 1,
        isActive: true,
        dishCount: 1,
        dishes: [{
          id: "a5555555-5555-4555-8555-555555555555",
          categoryId,
          name: "Prairie Poutine",
          description: "Crisp potatoes with cheese curds.",
          price: "12.50",
          availability: "available",
          isActive: true,
          displayOrder: 1,
          mediaAssetId: null,
          media: null,
          badges: ["vegetarian"],
          createdAt: ownerTimestamp,
          updatedAt: ownerTimestamp,
        }],
        createdAt: ownerTimestamp,
        updatedAt: ownerTimestamp,
      }, {
        // A second category exists so the dish editor's name filter has something to filter
        // *out*. With one dish the filter could pass without ever hiding anything.
        id: dessertsId,
        name: "Desserts",
        description: "Something sweet.",
        slug: "desserts",
        displayOrder: 2,
        isActive: true,
        dishCount: 1,
        dishes: [{
          id: "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          categoryId: dessertsId,
          name: "Saskatoon Berry Tart",
          description: "Buttery pastry with prairie berries.",
          price: "9.00",
          availability: "available",
          isActive: true,
          displayOrder: 1,
          mediaAssetId: null,
          media: null,
          badges: ["contains_nuts"],
          createdAt: ownerTimestamp,
          updatedAt: ownerTimestamp,
        }],
        createdAt: ownerTimestamp,
        updatedAt: ownerTimestamp,
      }],
      locale: "en-CA",
      currency: "CAD",
      taxDisplayMode: "exclusive",
      taxNoticeKey: "menu.tax.exclusive",
      availableBadges: Object.keys(ownerBadgeCatalog),
      draftVersion: "4",
      eTag: '"owner-draft-4"',
      publicationStatus: publication,
    },
    gallery: {
      images: [{
        id: "a6666666-6666-4666-8666-666666666666",
        mediaAssetId: "a7777777-7777-4777-8777-777777777777",
        altText: "Front counter",
        caption: null,
        displayOrder: 1,
        isActive: true,
        imageUrl: "/media/seed/front-counter.png",
        thumbnailUrl: "/media/seed/front-counter-thumb.png",
        width: 1_600,
        height: 1_200,
        fileSizeBytes: 240_000,
        createdAt: ownerTimestamp,
        updatedAt: ownerTimestamp,
      }],
      maximumImages: 50,
      draftVersion: "4",
      eTag: '"owner-draft-4"',
      publicationStatus: publication,
    },
    mediaAssets: [],
  };
}

/**
 * Advances the draft and reports a publication status.
 *
 * The reported status alternates on purpose. On the real stack the outbox worker can
 * claim the row before the inline dispatch reports on it, so a perfectly successful
 * save legitimately comes back `processing` rather than `succeeded`. Alternating here
 * means any spec that asserts one exact immediate status fails immediately instead of
 * flaking later. The draft itself is always applied, exactly as it is on the real
 * stack — only the status the save reports is in question, which is why the public
 * projection below reflects the change either way.
 */
function ownerPublish(state) {
  state.version += 1;
  state.saveCount += 1;
  const draftVersion = String(state.version);
  const eTag = `"owner-draft-${draftVersion}"`;
  const publication = {
    operationId: "a8888888-8888-4888-8888-888888888888",
    status: state.saveCount % 2 === 0 ? "processing" : "succeeded",
    draftVersion,
    attemptCount: 1,
    errorCode: null,
    updatedAt: new Date().toISOString(),
  };
  for (const aggregate of [state.restaurant, state.menu, state.gallery]) {
    aggregate.draftVersion = draftVersion;
    aggregate.eTag = eTag;
    aggregate.publicationStatus = publication;
  }
  return publication;
}

function ownerPublicRestaurant(state) {
  const restaurant = state.restaurant;
  const address = restaurant.address;
  return {
    id: restaurant.id,
    name: restaurant.name,
    shortDescription: restaurant.description,
    phone: restaurant.phoneE164 && restaurant.phoneDisplay
      ? { e164: restaurant.phoneE164, display: restaurant.phoneDisplay }
      : null,
    email: restaurant.email,
    timeZone: restaurant.timeZone,
    websiteUrl: restaurant.websiteUrl,
    address: address ? {
      streetLine1: address.line1,
      streetLine2: address.line2,
      city: address.city,
      region: address.region,
      postalCode: address.postalCode,
      countryCode: address.countryCode,
      formatted: `${address.line1}, ${address.city}, ${address.region} ${address.postalCode}`,
      directionsUrl: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(address.line1)}`,
      latitude: address.latitude,
      longitude: address.longitude,
    } : null,
    regularHours: restaurant.regularHours,
    specialHours: restaurant.specialHours.map(({ date, isClosed, note, intervals }) => ({
      date, isClosed, note, intervals,
    })),
    status: { state: "open", label: "Open", nextChangeAt: null, source: "regularHours" },
    socialLinks: restaurant.socialLinks,
    mainImage: null,
    // Deliberately empty even when the draft gallery holds photos: the public gallery renders
    // through the Next.js image optimizer, and a spec that counts failed network requests should
    // not be measuring the optimizer's opinion of a 1x1 fixture PNG. The gallery walkthrough
    // verifies its photo in the editor instead.
    gallery: [],
    restaurantType: null,
    priceRange: null,
    logo: null,
    coverImage: null,
    publishedAt: ownerTimestamp,
    publicationVersion: String(state.version),
    websiteDesignId: "legacy-current-v1",
  };
}

function ownerPublicMenu(state) {
  return {
    restaurantId: state.restaurant.id,
    restaurantName: state.restaurant.name,
    locale: state.menu.locale,
    currency: state.menu.currency,
    taxDisplayMode: state.menu.taxDisplayMode,
    taxNoticeKey: state.menu.taxNoticeKey,
    publicationVersion: String(state.version),
    publishedAt: ownerTimestamp,
    websiteDesignId: "legacy-current-v1",
    restaurant: ownerPublicRestaurant(state),
    menu: {
      id: state.menu.menuId,
      name: state.menu.menuName,
      categories: state.menu.categories.map((category) => ({
        id: category.id,
        slug: category.slug,
        name: category.name,
        description: category.description,
        dishes: category.dishes.map((dish) => ({
          id: dish.id,
          name: dish.name,
          description: dish.description,
          price: dish.price,
          availability: dish.availability,
          media: null,
          badges: dish.badges
            .filter((code) => code in ownerBadgeCatalog)
            .map((code) => ({ code, ...ownerBadgeCatalog[code] })),
        })),
      })),
    },
  };
}

function readBody(request) {
  return new Promise((resolve) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks)));
  });
}

/**
 * Pulls one text field out of a multipart body.
 *
 * Enough for a fixture: the specs post short ASCII alt text and captions, and the file
 * part is never read back. `latin1` keeps the binary part's bytes intact while the text
 * parts are sliced out by their boundaries.
 */
function multipartField(buffer, name) {
  const text = buffer.toString("latin1");
  const marker = `name="${name}"`;
  const at = text.indexOf(marker);
  if (at < 0) return null;
  const start = text.indexOf("\r\n\r\n", at);
  if (start < 0) return null;
  const end = text.indexOf("\r\n--", start + 4);
  if (end < 0) return null;
  return Buffer.from(text.slice(start + 4, end), "latin1").toString("utf8");
}

function ownerHours(days) {
  return Array.from({ length: 7 }, (_, dayOfWeek) => {
    const day = days.find((item) => item.dayOfWeek === dayOfWeek);
    return {
      dayOfWeek,
      intervals: (day?.intervals ?? []).map(({ opensAt, closesAt }) => ({
        opensAt, closesAt, closesNextDay: closesAt <= opensAt,
      })),
    };
  });
}

/**
 * A complete owner portal — authentication, the four draft editors, and the public
 * projection they publish to — backed by state this instance alone owns.
 *
 * Two instances run: `owner.localhost` for `e2e/admin-tasks.spec.ts`, and
 * `admin-outage.localhost` for the admin-outage case in `e2e/errors.spec.ts`. They
 * share no state, so neither spec can disturb the other, and neither touches the
 * `admin.localhost` fixture that `restaurant.spec.ts` and `design.spec.ts` mutate.
 */
function createOwnerPortal(cookieName) {
  let state = ownerSeed();

  function unauthorized(response) {
    return json(response, 401, { code: "unauthorized" });
  }

  async function handle(request, response, fault) {
    const requestUrl = new URL(request.url ?? "/", "http://portal.localhost");
    const path = requestUrl.pathname;
    const method = request.method ?? "GET";
    const signedIn = request.headers.cookie?.includes(`${cookieName}=1`) ?? false;
    const raw = method === "GET" || method === "HEAD" ? Buffer.alloc(0) : await readBody(request);
    const parsed = () => {
      try { return JSON.parse(raw.toString("utf8")); } catch { return {}; }
    };
    const segments = path.split("/").filter(Boolean);
    const last = segments.at(-1) ?? "";
    const secondLast = segments.at(-2) ?? "";
    const etag = { etag: state.restaurant.eTag };

    // Authentication answers normally even while the sections are faulted: an owner whose
    // restaurant is unreachable is not a signed-out owner, and the portal must be able to
    // tell the difference.
    if (path === "/api/v1/auth/antiforgery") {
      return json(response, 200, { token: "owner-e2e-token", headerName: "X-CSRF-TOKEN" });
    }
    if (path === "/api/v1/auth/login" && method === "POST") {
      const returnPath = typeof parsed().returnPath === "string" ? parsed().returnPath : "/admin";
      return json(response, 200, {
        userId: "owner-portal-e2e",
        displayName: "Owner",
        memberships: [{ restaurantId: state.restaurant.id, role: "owner" }],
        idleExpiresAt: "2026-09-01T12:00:00Z",
        absoluteExpiresAt: "2026-09-01T12:00:00Z",
        returnPath,
      }, { "set-cookie": `${cookieName}=1; Path=/; HttpOnly; SameSite=Lax` });
    }
    if (path === "/api/v1/auth/logout" && method === "POST") {
      return json(response, 204, null, { "set-cookie": `${cookieName}=; Path=/; Max-Age=0` });
    }
    if (path === "/api/v1/auth/session") {
      return signedIn ? json(response, 200, {
        userId: "owner-portal-e2e",
        displayName: "Owner",
        memberships: [{ restaurantId: state.restaurant.id, role: "owner" }],
        idleExpiresAt: "2026-09-01T12:00:00Z",
        absoluteExpiresAt: "2026-09-01T12:00:00Z",
        returnPath: "/admin",
      }) : unauthorized(response);
    }

    if (path === "/api/v1/public/restaurant") return json(response, 200, ownerPublicRestaurant(state));
    if (path === "/api/v1/public/menu") return json(response, 200, ownerPublicMenu(state));
    if (path === "/api/v1/public/restaurant/gallery") {
      return json(response, 200, { publicationVersion: String(state.version), images: [] });
    }

    if (!signedIn) return unauthorized(response);

    // The armed outage: every draft read fails, every write is never reached because the
    // editor it belongs to never rendered.
    if (fault === "sections" && path.startsWith("/api/v1/admin/")) {
      response.writeHead(500, { "content-type": "application/problem+json" });
      response.end(JSON.stringify({ title: "Injected section failure", status: 500 }));
      return undefined;
    }

    if (path === "/api/v1/admin/restaurant" && method === "GET") {
      return json(response, 200, state.restaurant, etag);
    }
    if (path === "/api/v1/admin/restaurant/preview") return json(response, 200, ownerPublicRestaurant(state));
    if (path === "/api/v1/admin/media-assets" && method === "GET") {
      return json(response, 200, state.mediaAssets, etag);
    }
    if (path === "/api/v1/admin/menu" && method === "GET") return json(response, 200, state.menu, etag);
    if (path === "/api/v1/admin/gallery" && method === "GET") return json(response, 200, state.gallery, etag);
    if (path.startsWith("/api/v1/admin/publication-status/") && method === "GET") {
      // The settled outcome. A portal that polls because a save reported `processing`
      // converges here, which is the only honest thing for a spec to assert on.
      return json(response, 200, {
        ...state.restaurant.publicationStatus,
        status: "succeeded",
        updatedAt: new Date().toISOString(),
      });
    }

    const restaurantResult = () => json(
      response, 200, { restaurant: state.restaurant, publication: ownerPublish(state) }, etag);
    const menuResult = () => json(
      response, 200, { menu: state.menu, publication: ownerPublish(state) }, etag);
    const galleryResult = () => json(
      response, 200, { gallery: state.gallery, publication: ownerPublish(state) }, etag);

    if (path === "/api/v1/admin/restaurant/profile" && method === "PUT") {
      const body = parsed();
      Object.assign(state.restaurant, {
        name: body.name ?? state.restaurant.name,
        description: body.description ?? null,
        phoneE164: body.phoneE164 ?? null,
        phoneDisplay: body.phoneDisplay ?? null,
        email: body.email ?? null,
        websiteUrl: body.websiteUrl ?? null,
        timeZone: body.timeZone ?? state.restaurant.timeZone,
        restaurantType: body.restaurantType ?? null,
        priceRange: body.priceRange ?? null,
        address: body.address ?? state.restaurant.address,
      });
      return restaurantResult();
    }
    if (path === "/api/v1/admin/restaurant/regular-hours" && method === "PUT") {
      state.restaurant.regularHours = ownerHours(parsed().days ?? []);
      return restaurantResult();
    }
    if (path === "/api/v1/admin/special-hours" && method === "POST") {
      const body = parsed();
      state.restaurant.specialHours = [...state.restaurant.specialHours, {
        id: ownerId(),
        date: body.date,
        isClosed: Boolean(body.isClosed),
        note: body.note ?? null,
        intervals: (body.intervals ?? []).map(({ opensAt, closesAt }) => ({
          opensAt, closesAt, closesNextDay: closesAt <= opensAt,
        })),
      }].sort((left, right) => left.date.localeCompare(right.date));
      return restaurantResult();
    }
    if (secondLast === "special-hours" && method === "PUT") {
      const body = parsed();
      state.restaurant.specialHours = state.restaurant.specialHours.map((item) => item.id !== last ? item : {
        ...item,
        date: body.date ?? item.date,
        isClosed: Boolean(body.isClosed),
        note: body.note ?? null,
        intervals: (body.intervals ?? []).map(({ opensAt, closesAt }) => ({
          opensAt, closesAt, closesNextDay: closesAt <= opensAt,
        })),
      });
      return restaurantResult();
    }
    if (secondLast === "special-hours" && method === "DELETE") {
      state.restaurant.specialHours = state.restaurant.specialHours.filter((item) => item.id !== last);
      return restaurantResult();
    }
    if (path === "/api/v1/admin/media-assets" && method === "POST") {
      const asset = {
        id: ownerId(),
        altText: multipartField(raw, "altText") ?? "Uploaded image",
        processingStatus: "ready",
        variants: [{ url: `/media/seed/${ownerId()}.png`, width: 480, height: 360 }],
      };
      state.mediaAssets = [...state.mediaAssets, asset];
      return json(response, 200, asset);
    }

    const findDish = (id) => {
      for (const category of state.menu.categories) {
        const dish = category.dishes.find((item) => item.id === id);
        if (dish) return { category, dish };
      }
      return null;
    };
    const recount = () => {
      for (const category of state.menu.categories) category.dishCount = category.dishes.length;
    };

    if (path === "/api/v1/admin/menu/dishes" && method === "POST") {
      const body = parsed();
      const category = state.menu.categories.find((item) => item.id === body.categoryId)
        ?? state.menu.categories[0];
      category.dishes = [...category.dishes, {
        id: ownerId(),
        categoryId: category.id,
        name: body.name,
        description: body.description ?? null,
        price: Number(body.price ?? 0).toFixed(2),
        availability: body.availability ?? "available",
        isActive: true,
        displayOrder: category.dishes.length + 1,
        mediaAssetId: body.mediaAssetId ?? null,
        media: null,
        badges: body.badges ?? [],
        createdAt: ownerTimestamp,
        updatedAt: ownerTimestamp,
      }];
      recount();
      return menuResult();
    }
    if (last === "price" && method === "PATCH") {
      const found = findDish(secondLast);
      if (!found) return json(response, 404, { code: "dish_not_found" });
      found.dish.price = Number(parsed().price ?? 0).toFixed(2);
      return menuResult();
    }
    if (last === "availability" && method === "PATCH") {
      const found = findDish(secondLast);
      if (!found) return json(response, 404, { code: "dish_not_found" });
      found.dish.availability = parsed().status ?? found.dish.availability;
      return menuResult();
    }
    if (path === "/api/v1/admin/menu/dishes/reorder" && method === "PATCH") {
      const body = parsed();
      const category = state.menu.categories.find((item) => item.id === body.categoryId);
      if (category) {
        category.dishes = (body.dishIds ?? [])
          .map((id) => category.dishes.find((dish) => dish.id === id))
          .filter(Boolean)
          .map((dish, index) => ({ ...dish, displayOrder: index + 1 }));
      }
      return menuResult();
    }
    if (secondLast === "dishes" && method === "PATCH") {
      const found = findDish(last);
      if (!found) return json(response, 404, { code: "dish_not_found" });
      const body = parsed();
      Object.assign(found.dish, {
        name: body.name ?? found.dish.name,
        description: body.description ?? null,
        price: body.price === null || body.price === undefined
          ? found.dish.price
          : Number(body.price).toFixed(2),
        availability: body.availability ?? found.dish.availability,
        badges: body.badges ?? found.dish.badges,
      });
      return menuResult();
    }
    if (secondLast === "dishes" && method === "DELETE") {
      for (const category of state.menu.categories) {
        category.dishes = category.dishes.filter((dish) => dish.id !== last);
      }
      recount();
      return menuResult();
    }

    if (path === "/api/v1/admin/gallery" && method === "POST") {
      if (state.gallery.images.length >= state.gallery.maximumImages) {
        return json(response, 409, { code: "gallery_limit_reached" });
      }
      const id = ownerId();
      const caption = multipartField(raw, "caption");
      state.gallery.images = [...state.gallery.images, {
        id,
        mediaAssetId: ownerId(),
        altText: multipartField(raw, "altText") ?? "Uploaded photo",
        caption: caption === null || caption === "" ? null : caption,
        displayOrder: state.gallery.images.length + 1,
        isActive: true,
        imageUrl: `/media/seed/${id}.png`,
        thumbnailUrl: `/media/seed/${id}-thumb.png`,
        width: 1_600,
        height: 1_200,
        fileSizeBytes: 180_000,
        createdAt: ownerTimestamp,
        updatedAt: ownerTimestamp,
      }];
      return galleryResult();
    }
    if (path === "/api/v1/admin/gallery/reorder" && method === "PATCH") {
      const order = parsed().imageIds ?? [];
      state.gallery.images = order
        .map((id) => state.gallery.images.find((image) => image.id === id))
        .filter(Boolean)
        .map((image, index) => ({ ...image, displayOrder: index + 1 }));
      return galleryResult();
    }
    if (secondLast === "gallery" && method === "PATCH") {
      const body = parsed();
      state.gallery.images = state.gallery.images.map((image) => image.id !== last ? image : {
        ...image,
        altText: body.altText ?? image.altText,
        caption: body.caption ?? null,
        isActive: body.isActive ?? image.isActive,
      });
      return galleryResult();
    }
    if (secondLast === "gallery" && method === "DELETE") {
      state.gallery.images = state.gallery.images
        .filter((image) => image.id !== last)
        .map((image, index) => ({ ...image, displayOrder: index + 1 }));
      return galleryResult();
    }

    return json(response, 404, { code: "not_found" });
  }

  return {
    reset() { state = ownerSeed(); },
    handle(request, response, fault) {
      void handle(request, response, fault);
    },
  };
}

const ownerPortal = createOwnerPortal("omni-owner");
const outagePortal = createOwnerPortal("omni-outage");

/** `POST /__e2e/fault?host=…&mode=…` and `POST /__e2e/owner-reset?host=…`. */
function handleFixtureControl(request, response) {
  const requestUrl = new URL(request.url ?? "/", "http://control.localhost");
  const host = requestUrl.searchParams.get("host") ?? "";

  if (requestUrl.pathname === "/__e2e/fault" && request.method === "POST") {
    if (!faultModes.has(host)) return json(response, 400, { code: "unknown_fault_host" });
    faultModes.set(host, requestUrl.searchParams.get("mode") ?? "off");
    return json(response, 200, { host, mode: faultModes.get(host) });
  }
  if (requestUrl.pathname === "/__e2e/owner-reset" && request.method === "POST") {
    if (host === "owner.localhost") ownerPortal.reset();
    else if (host === "admin-outage.localhost") outagePortal.reset();
    else return json(response, 400, { code: "unknown_owner_host" });
    return json(response, 200, { host, reset: true });
  }
  return json(response, 404, { code: "not_found" });
}

function forward(request, response, host) {
  const upstreamRequest = http.request(
    {
      hostname: upstream.hostname,
      port: upstream.port,
      method: request.method,
      path: request.url,
      headers: { ...request.headers, host },
    },
    (upstreamResponse) => {
      response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
      upstreamResponse.pipe(response);
    },
  );

  upstreamRequest.on("error", (error) => {
    response.writeHead(502, { "content-type": "application/problem+json" });
    response.end(JSON.stringify({ title: "Test proxy upstream failure", detail: error.message, status: 502 }));
  });
  request.pipe(upstreamRequest);
}

const server = http.createServer((request, response) => {
  const host = request.headers.host?.split(":", 1)[0]?.toLowerCase() ?? "";

  // Control first, and host-independent: a spec dials 127.0.0.1:5290 directly to arm or
  // clear a fault, so the request never carries the host it is talking about.
  if (request.url?.startsWith("/__e2e/fault") || request.url?.startsWith("/__e2e/owner-reset")) {
    handleFixtureControl(request, response);
    return;
  }

  if (request.url?.startsWith("/media/seed/")) {
    response.writeHead(200, { "content-type": "image/png", "content-length": seedPng.length });
    response.end(seedPng);
    return;
  }

  if (host === "admin.localhost") {
    mockAdmin(request, response);
    return;
  }

  if (host === "owner.localhost") {
    ownerPortal.handle(request, response, "off");
    return;
  }

  if (host === "admin-outage.localhost") {
    outagePortal.handle(request, response, faultModes.get(host) ?? "off");
    return;
  }

  if (faultModes.has(host) && applyFault(host, response)) return;

  if (host === "phone.localhost" && request.url === "/api/v1/public/restaurant") {
    json(response, 200, publicRestaurant);
    return;
  }

  if (host === "error.localhost" && recoverableErrorRequests++ === 0) {
    sendTemporaryFailure(response);
    return;
  }

  const upstreamHost = forwardedFaultHosts.has(host) ? "menu.localhost" : host;
  if (host === "slow.localhost") {
    setTimeout(() => forward(request, response, upstreamHost), 1_500);
    return;
  }

  forward(request, response, upstreamHost);
});

server.listen(5290, "127.0.0.1");

function stop() {
  // `stall.localhost` holds its responses open on purpose, so shutdown has to let go of
  // them explicitly — otherwise `server.close` waits for connections that never end.
  for (const held of stalledResponses) held.destroy();
  stalledResponses.clear();
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
