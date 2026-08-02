import http from "node:http";

const upstream = new URL("http://127.0.0.1:5279");
const seedPng = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
let recoverableErrorRequests = 0;

const adminRestaurant = {
  id: "11111111-1111-1111-1111-111111111111",
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
};

function json(response, status, body, headers = {}) {
  response.writeHead(status, { "content-type": "application/json", ...headers });
  response.end(JSON.stringify(body));
}

function mockAdmin(request, response) {
  const path = new URL(request.url ?? "/", "http://admin.localhost").pathname;
  const signedIn = request.headers.cookie?.includes("omni-e2e=1") ?? false;
  if (path === "/api/v1/auth/antiforgery") return json(response, 200, { token: "e2e-token", headerName: "X-CSRF-TOKEN" });
  if (path === "/api/v1/auth/login" && request.method === "POST") return json(response, 200, { userId: "owner-e2e", displayName: "Owner", memberships: [{ restaurantId: adminRestaurant.id, role: "owner" }], idleExpiresAt: "2026-08-01T12:00:00Z", absoluteExpiresAt: "2026-08-01T12:00:00Z", returnPath: "/admin/restaurant" }, { "set-cookie": "omni-e2e=1; Path=/; HttpOnly; SameSite=Lax" });
  if (path === "/api/v1/auth/logout" && request.method === "POST") return json(response, 204, null, { "set-cookie": "omni-e2e=; Path=/; Max-Age=0" });
  if (path === "/api/v1/auth/session") return signedIn ? json(response, 200, { userId: "owner-e2e", displayName: "Owner", memberships: [{ restaurantId: adminRestaurant.id, role: "owner" }], idleExpiresAt: "2026-08-01T12:00:00Z", absoluteExpiresAt: "2026-08-01T12:00:00Z", returnPath: "/admin" }) : json(response, 401, { code: "unauthorized" });
  if (!signedIn) return json(response, 401, { code: "unauthorized" });
  if (path === "/api/v1/admin/restaurant/preview") return json(response, 200, publicRestaurant);
  if (path === "/api/v1/admin/restaurant" && request.method === "GET") return json(response, 200, adminRestaurant, { etag: adminRestaurant.eTag });
  if (path.startsWith("/api/v1/admin/publication-status/") && request.method === "GET") return json(response, 200, adminRestaurant.publicationStatus);
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
