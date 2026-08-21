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

  if (request.url?.startsWith("/media/seed/")) {
    response.writeHead(200, { "content-type": "image/png", "content-length": seedPng.length });
    response.end(seedPng);
    return;
  }

  if (host === "admin.localhost") {
    mockAdmin(request, response);
    return;
  }

  if (host === "phone.localhost" && request.url === "/api/v1/public/restaurant") {
    json(response, 200, publicRestaurant);
    return;
  }

  if (host === "error.localhost" && recoverableErrorRequests++ === 0) {
    sendTemporaryFailure(response);
    return;
  }

  const upstreamHost = host === "error.localhost" || host === "slow.localhost" ? "menu.localhost" : host;
  if (host === "slow.localhost") {
    setTimeout(() => forward(request, response, upstreamHost), 1_500);
    return;
  }

  forward(request, response, upstreamHost);
});

server.listen(5290, "127.0.0.1");

function stop() {
  server.close(() => process.exit(0));
}

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
