import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the real menu accessibly without horizontal clipping", async ({ page }) => {
  await page.goto("/menu");

  await expect(page.getByRole("heading", { level: 1, name: "Prairie Table" })).toBeVisible();
  await expect(page.getByText("All Day Menu")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Starters" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3, name: "Prairie Poutine" })).toBeVisible();
  await expect(page.getByText("$12.50")).toBeVisible();
  await expect(page.getByText("Unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("Prices exclude applicable taxes.")).toBeVisible();
  await expect(page.getByText(/Dietary and allergen badges are informational/)).toBeVisible();

  await expect
    .poll(() => page.locator("[data-enhanced]").getAttribute("data-enhanced"))
    .toBe("true");
  await expect(page.locator("#desserts").locator("xpath=..")).toBeHidden();

  const seriousOrCritical = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(seriousOrCritical.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const target = await page.getByRole("link", { name: "Desserts" }).boundingBox();
  expect(target?.height ?? 0).toBeGreaterThanOrEqual(44);
});

test("changes categories locally and preserves hash history", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser covers history and zero-refetch semantics.");
  let browserApiRequests = 0;
  page.on("request", (request) => {
    if (new URL(request.url()).pathname === "/api/v1/public/menu") browserApiRequests += 1;
  });

  await page.goto("/menu#mains");
  await expect(page.getByRole("heading", { level: 2, name: "Mains" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Mains" })).toHaveAttribute("aria-current", "true");

  await page.getByRole("link", { name: "Desserts" }).click();
  await expect(page).toHaveURL(/#desserts$/);
  await expect(page.getByText("No dishes in this category.")).toBeVisible();

  await page.getByRole("link", { name: "Starters" }).click();
  await expect(page).toHaveURL(/#starters$/);
  await page.goBack();
  await expect(page).toHaveURL(/#desserts$/);
  await expect(page.getByRole("heading", { level: 2, name: "Desserts" })).toBeVisible();
  expect(browserApiRequests).toBe(0);
});

test("server HTML remains complete when JavaScript is disabled", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser verifies the progressive-enhancement baseline.");
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 768, height: 1_024 } });
  const page = await context.newPage();

  await page.goto("http://menu.localhost:3000/menu#desserts");
  await expect(page.getByRole("heading", { level: 2, name: "Starters" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Mains" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Desserts" })).toBeVisible();
  await expect(page.getByRole("heading", { level: 3 })).toHaveCount(3);

  await context.close();
});

test("renders tenant, empty, not-found, loading, and recoverable error states", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "State matrix is host-driven and browser-independent.");

  await page.goto("http://no-menu.localhost:3000/menu");
  await expect(page.getByRole("heading", { name: "Coming Soon", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Menu coming soon", level: 2 })).toBeVisible();

  await page.goto("http://no-active.localhost:3000/menu");
  await expect(page.getByRole("heading", { name: "No categories available", level: 2 })).toBeVisible();

  await page.goto("http://active-empty.localhost:3000/menu");
  await expect(page.getByRole("heading", { name: "Seasonal", level: 2 })).toBeVisible();
  await expect(page.getByText("No dishes in this category.")).toBeVisible();

  const missingResponse = await page.goto("http://unknown.localhost:3000/menu");
  expect(missingResponse?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Restaurant not found", level: 1 })).toBeVisible();

  await page.goto("http://error.localhost:3000/menu");
  await expect(page.getByRole("heading", { name: "We could not load the menu", level: 1 })).toBeVisible();
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();

  await page.goto("http://slow.localhost:3000/");
  await page.getByRole("link", { name: "Browse the menu" }).click();
  await expect(page.getByRole("status")).toHaveText("Loading menu…");
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();
});

test("supports text zoom, reduced motion, and forced colours", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium-minimum", "Minimum Chromium viewport covers these media preferences.");
  await page.emulateMedia({ reducedMotion: "reduce", forcedColors: "active" });
  await page.goto("/menu");
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });

  await expect(page.getByRole("link", { name: "Starters" })).toHaveAttribute("aria-current", "true");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
