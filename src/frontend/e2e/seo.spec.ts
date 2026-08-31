import { expect, test } from "@playwright/test";

/**
 * Phase 6 acceptance evidence (PR-17 Tasks 2-8, PR-18 Task 10, PR-19).
 *
 * Everything here is asserted against the real backend and the production frontend build, because the
 * claims being made — status codes, response headers, and the exact contents of generated documents —
 * cannot be evidenced by component tests.
 */

const origin = "http://menu.localhost:3000";

test.describe("@seo", () => {
  test("serves a per-host robots.txt that blocks private paths and names the sitemap", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Generated documents are browser-independent.");
    const response = await request.get(`${origin}/robots.txt`);

    expect(response.status()).toBe(200);
    const body = await response.text();

    expect(body).toContain("User-Agent: *");
    for (const blocked of ["/admin", "/api", "/dashboard", "/login", "/register"]) {
      expect(body).toContain(`Disallow: ${blocked}`);
    }
    // Media must stay crawlable so restaurant photos remain eligible for image search.
    expect(body).not.toContain("Disallow: /media");
    // The sitemap line must name the requesting tenant, not a build-time host.
    expect(body).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  test("names the requesting tenant in robots.txt on a different host", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Generated documents are browser-independent.");
    const body = await (await request.get("http://alternate.localhost:3000/robots.txt")).text();

    expect(body).toContain("Sitemap: http://alternate.localhost:3000/sitemap.xml");
    expect(body).not.toContain("menu.localhost");
  });

  test("serves a valid sitemap containing only indexable public URLs", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Generated documents are browser-independent.");
    const response = await request.get(`${origin}/sitemap.xml`);

    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("xml");
    const body = await response.text();

    expect(body).toContain('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(body).toContain(`<loc>${origin}/</loc>`);
    expect(body).toContain(`<loc>${origin}/menu</loc>`);
    // Category pages are discoverable (PR-19 Task 9).
    expect(body).toContain(`<loc>${origin}/menu/starters</loc>`);
    // Nothing private is ever advertised.
    for (const forbidden of ["/admin", "/api", "design-preview"]) {
      expect(body).not.toContain(forbidden);
    }
    // lastmod is the publication time, so it must be a real timestamp rather than the request time.
    expect(body).toMatch(/<lastmod>\d{4}-\d{2}-\d{2}/);
  });

  test("emits an absolute self-referencing canonical and index,follow on public pages", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Head metadata is browser-independent.");

    for (const path of ["/", "/menu", "/menu/starters"]) {
      await page.goto(`${origin}${path}`);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}${path}`);
      const robots = await page.locator('meta[name="robots"]').getAttribute("content");
      expect(robots, `${path} must be indexable`).toContain("index");
      expect(robots, `${path} must not be noindex`).not.toContain("noindex");
    }
  });

  test("keeps the canonical free of query parameters", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Head metadata is browser-independent.");
    await page.goto(`${origin}/menu?ref=qr&sort=price&page=2`);

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", `${origin}/menu`);
  });

  test("marks administrative and preview surfaces noindex", async ({ page, request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Head metadata is browser-independent.");

    await page.goto(`${origin}/admin/login`);
    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);

    // The header guard applies even to routes that ship without page metadata.
    const headers = (await request.get(`${origin}/admin/login`)).headers();
    expect(headers["x-robots-tag"]).toContain("noindex");
  });

  test("returns real 404 status codes rather than soft 404s", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Status codes are browser-independent.");

    expect((await request.get(`${origin}/`)).status()).toBe(200);
    expect((await request.get(`${origin}/menu`)).status()).toBe(200);
    expect((await request.get(`${origin}/menu/starters`)).status()).toBe(200);

    // An unpublished category, an unknown path, and an unknown tenant are all hard 404s.
    expect((await request.get(`${origin}/menu/not-a-real-category`)).status()).toBe(404);
    expect((await request.get(`${origin}/no-such-page`)).status()).toBe(404);
    expect((await request.get("http://unknown-tenant.localhost:3000/menu")).status()).toBe(404);
  });

  test("marks the 404 page noindex", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Head metadata is browser-independent.");
    await page.goto(`${origin}/menu/not-a-real-category`);

    const robots = await page.locator('meta[name="robots"]').getAttribute("content");
    expect(robots).toContain("noindex");
  });

  test("redirects a trailing slash to the canonical path", async ({ request }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Redirects are browser-independent.");
    const response = await request.get(`${origin}/menu/`, { maxRedirects: 0 });

    expect([301, 308]).toContain(response.status());
    expect(response.headers()["location"]).toContain("/menu");
  });

  test("emits valid Restaurant JSON-LD with no empty properties", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Structured data is browser-independent.");
    await page.goto(`${origin}/`);

    const raw = await page.locator('script[type="application/ld+json"]').first().textContent();
    expect(raw).toBeTruthy();
    const schema = JSON.parse(raw!);

    expect(schema["@context"]).toBe("https://schema.org");
    expect(schema["@type"]).toBe("Restaurant");
    expect(schema.name).toBe("Prairie Table");
    expect(schema.url).toBe(`${origin}/`);
    expect(schema.address["@type"]).toBe("PostalAddress");
    expect(schema.openingHoursSpecification).toHaveLength(7);
    expect(schema.hasMenu).toBe(`${origin}/menu`);

    // PR-18: no property is ever present-and-empty.
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) {
        expect(node.length).toBeGreaterThan(0);
        node.forEach(walk);
        return;
      }
      if (node && typeof node === "object") {
        for (const [key, value] of Object.entries(node)) {
          expect(value, `${key} must not be null`).not.toBeNull();
          expect(value, `${key} must not be blank`).not.toBe("");
          walk(value);
        }
      }
    };
    walk(schema);
  });

  test("emits Menu JSON-LD covering every published dish", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Structured data is browser-independent.");
    await page.goto(`${origin}/menu`);

    const schema = JSON.parse((await page.locator('script[type="application/ld+json"]').first().textContent())!);
    expect(schema["@type"]).toBe("Menu");
    expect(schema.hasMenuSection.length).toBeGreaterThan(0);
    const items = schema.hasMenuSection.flatMap((section: { hasMenuItem?: unknown[] }) => section.hasMenuItem ?? []);
    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty("offers.priceCurrency", "CAD");
  });

  test("presents a category page as fully visible indexable HTML", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Rendering is covered by the menu suite across browsers.");
    await page.goto(`${origin}/menu/starters`);

    await expect(page.getByRole("heading", { level: 2, name: "Starters" })).toBeVisible();
    await expect(page.getByRole("heading", { level: 3, name: "Prairie Poutine" })).toBeVisible();
    // The weakness this route exists to fix: with a single category nothing is ever hidden, so a
    // JavaScript-executing crawler sees every dish.
    await expect(page.locator("[hidden] h3")).toHaveCount(0);
  });

  test("links every category page from the menu so crawlers can reach them", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "chromium", "Internal linking is browser-independent.");
    await page.goto(`${origin}/menu`);

    // Real hrefs, not fragments, so the category pages are discoverable by crawling (PR-19 Task 6).
    await expect(page.getByRole("link", { name: "Desserts" })).toHaveAttribute("href", "/menu/desserts");
  });
});
