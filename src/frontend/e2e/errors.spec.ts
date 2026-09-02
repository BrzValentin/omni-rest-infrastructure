import { expect, test, type Page } from "@playwright/test";

/**
 * The failure matrix `e2e/menu.spec.ts` does not cover.
 *
 * That spec already asserts the empty-menu, no-active-menu, empty-category, unknown-tenant,
 * one-shot-503, and slow-host states, and it owns `error.localhost` — a host that fails exactly
 * once and then recovers. A second consumer of that host would steal its one failure, so nothing
 * here touches it. These tests drive their own fault hosts in `e2e/api-proxy.mjs`, each switched
 * explicitly with `POST /__e2e/fault`, which is what makes "and then it recovered" assertable
 * rather than merely hoped for.
 *
 * The faults are server-side state shared by every test in this file, so the file runs serially.
 * It also runs in one browser: what is under test is how the *server* answers a broken upstream,
 * which no browser can change.
 */

test.describe.configure({ mode: "serial" });
// Every test here waits on a real server-side failure path rather than on a rendered page, so the
// default 30s leaves no room; the two that wait on a read deadline raise it further still.
test.setTimeout(60_000);

const CONTROL = "http://127.0.0.1:5290";
const ONE_BROWSER = "The fault hosts are shared server-side state, so one browser owns them.";

/** Arms or clears one fault host. */
async function setFault(page: Page, host: string, mode: string) {
  const response = await page.request.post(`${CONTROL}/__e2e/fault?host=${host}&mode=${mode}`);
  expect(response.ok(), `could not set ${host} to "${mode}"`).toBe(true);
}

async function resetOwnerFixture(page: Page, host: string) {
  const response = await page.request.post(`${CONTROL}/__e2e/owner-reset?host=${host}`);
  expect(response.ok(), `could not reset the ${host} fixture`).toBe(true);
}

/**
 * Nothing internal may reach the reader.
 *
 * These are checked against rendered text rather than `page.content()` on purpose: the framework's
 * own serialized payload is not something a person reads, and asserting against it would be
 * asserting about Next.js instead of about this application's copy.
 */
const forbiddenInErrorCopy: ReadonlyArray<Readonly<{ pattern: RegExp; why: string }>> = [
  { pattern: /\bat\s+\S+\s*\(.*:\d+:\d+\)/, why: "a stack frame" },
  { pattern: /\b[45]\d{2}\b/, why: "an HTTP status number" },
  { pattern: /[a-z]+_[a-z_]+/, why: "a machine-readable error code" },
  { pattern: /\bError\b/, why: "the word Error" },
  { pattern: /\b(?:ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|socket hang up)\b/i, why: "a transport fault name" },
  { pattern: /Internal Server|Bad Gateway|Service Unavailable|Gateway Timeout/i, why: "a raw status phrase" },
  { pattern: /\bdigest\b/i, why: "the boundary digest" },
];

async function expectNoInternalDetail(page: Page) {
  const rendered = await page.locator("body").innerText();
  for (const { pattern, why } of forbiddenInErrorCopy) {
    expect(rendered, `the page must never render ${why}`).not.toMatch(pattern);
  }
}

/**
 * The layout-stability check the rest of this suite uses: nothing an error state renders may push
 * the document sideways, at any width.
 */
async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test("a hard 500 renders the retryable menu error, and the retry recovers", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  await setFault(page, "fail500.localhost", "on");

  // A transient fault is a server error, never a 404: a 404 tells a crawler the page is
  // permanently gone (specifications/phase-6/page-indexing-classification.md).
  const response = await page.goto("http://fail500.localhost:3000/menu");
  expect(response?.status(), "a 500 upstream must not become a 404").toBeGreaterThanOrEqual(500);

  await expect(page.getByRole("heading", { name: "We could not load the menu", level: 1 })).toBeVisible();
  await expect(page.getByText("Please try again. If the problem continues, check back a little later.")).toBeVisible();
  // Reaching `/menu` means the tenant resolved, so this boundary keeps the public chrome and the
  // reader keeps their way out. (The root boundary deliberately does not — see below.)
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
  await expectNoInternalDetail(page);
  await expectNoHorizontalOverflow(page);

  await setFault(page, "fail500.localhost", "off");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();
});

test("the root error boundary names no restaurant and offers one unbranded way out", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  await setFault(page, "fail500.localhost", "on");

  const response = await page.goto("http://fail500.localhost:3000/");
  expect(response?.status()).toBeGreaterThanOrEqual(500);
  await expect(page.getByRole("heading", { name: "We could not load this page", level: 1 })).toBeVisible();

  // Deliberate, and not a gap to be filled in: when this boundary renders, the tenant is precisely
  // what could not be established, and the same file also serves the owner portal. Chrome here
  // would have to resolve a restaurant this render has no restaurant to resolve, so there is no
  // header, no navigation, and no brand mark.
  await expect(page.getByRole("banner")).toHaveCount(0);
  await expect(page.getByRole("navigation")).toHaveCount(0);
  expect(await page.content(), "no tenant may be named here").not.toContain("Prairie Table");

  // Exactly one link, unbranded, so the reader is never stranded on a page whose only control is a
  // retry that may keep failing.
  const links = page.locator("a");
  await expect(links).toHaveCount(1);
  await expect(links).toHaveAttribute("href", "/");
  await expect(links).toHaveText("Go to the homepage");

  await expectNoInternalDetail(page);
  await expectNoHorizontalOverflow(page);

  await setFault(page, "fail500.localhost", "off");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();
});

test("a host that never answers reaches the error state instead of hanging", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  // The server-side read gives up after 10s (`lib/menu-api.ts`), so this test is bounded by that
  // deadline rather than by anything the browser does. Generous, because the point of the test is
  // that a deadline exists at all.
  test.setTimeout(120_000);
  await setFault(page, "stall.localhost", "on");

  const response = await page.goto("http://stall.localhost:3000/menu", { timeout: 90_000 });
  expect(response?.status(), "a stalled upstream must not become a 404").toBeGreaterThanOrEqual(500);
  await expect(page.getByRole("heading", { name: "We could not load the menu", level: 1 })).toBeVisible();
  await expectNoInternalDetail(page);
  await expectNoHorizontalOverflow(page);

  await setFault(page, "stall.localhost", "off");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();
});

test("a connection lost after the response headers surfaces as a server error", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  test.setTimeout(120_000);
  await setFault(page, "cutoff.localhost", "on");

  // The reader-side listeners in `lib/menu-api.ts` and `lib/server-api.ts` exist for exactly this:
  // a fault that arrives *after* the headers used to leave the read promise unsettled, and the
  // render hung with nothing to show.
  const response = await page.goto("http://cutoff.localhost:3000/menu", { timeout: 60_000 });
  expect(response?.status()).toBeGreaterThanOrEqual(500);
  await expect(page.getByRole("heading", { name: "We could not load the menu", level: 1 })).toBeVisible();
  await expectNoInternalDetail(page);
  await expectNoHorizontalOverflow(page);

  await setFault(page, "cutoff.localhost", "off");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();
});

test("an unreadable response body renders the error card rather than crashing", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  // A 200 whose body is not JSON, and a 200 with no body at all. Both are parse failures rather
  // than status failures, which is the case a status-code-only fixture can never produce.
  for (const mode of ["garbage", "empty"] as const) {
    await setFault(page, "garbage.localhost", mode);
    const response = await page.goto("http://garbage.localhost:3000/menu");
    expect(response?.status(), `a "${mode}" body must not become a 404`).toBeGreaterThanOrEqual(500);
    await expect(page.getByRole("heading", { name: "We could not load the menu", level: 1 })).toBeVisible();
    await expectNoInternalDetail(page);
    await expectNoHorizontalOverflow(page);
  }

  await setFault(page, "garbage.localhost", "off");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Prairie Table", level: 1 })).toBeVisible();
});

test("an API that answers 404 takes the not-found path, with a real status and no retry", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);

  const response = await page.goto("http://notfound-api.localhost:3000/menu");
  expect(response?.status(), "an absent restaurant is a hard 404, not a soft one").toBe(404);
  await expect(page.getByRole("heading", { name: "Restaurant not found", level: 1 })).toBeVisible();
  await expect(page.getByText("We could not find a public restaurant for this address.")).toBeVisible();
  // A wrong address does not become right on a second try, so no retry is offered here.
  await expect(page.getByRole("button", { name: "Try again" })).toHaveCount(0);
  await expectNoInternalDetail(page);

  // An unknown path on a perfectly healthy restaurant is a different statement, and says so: this
  // page must not claim the restaurant itself does not exist.
  const unknownPath = await page.goto("http://menu.localhost:3000/no-such-page");
  expect(unknownPath?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Page not found", level: 1 })).toBeVisible();
  await expect(page.getByText("We could not find a public restaurant for this address.")).toHaveCount(0);

  // And an unknown API endpoint answers a problem document rather than a framework HTML page,
  // which a client expecting JSON cannot read.
  const endpoint = await request.get("http://127.0.0.1:3000/api/v1/not-an-endpoint", {
    headers: { host: "notfound-api.localhost:3000" },
  });
  expect(endpoint.status()).toBe(404);
  const body = await endpoint.text();
  expect(body).not.toContain("<html");
  expect(() => JSON.parse(body) as unknown).not.toThrow();
});

test("an admin section outage shows a retryable state, never a blank page and never a not-found", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  await resetOwnerFixture(page, "admin-outage.localhost");
  await setFault(page, "admin-outage.localhost", "sections");

  // Signing in still works while the sections are down. A backend that cannot answer is not a
  // signed-out owner, and must not be answered with a login form the owner has already completed.
  await page.goto("http://admin-outage.localhost:3000/admin/menu");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill("owner@riverbend.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);

  await expect(page.getByRole("heading", { name: "This section is temporarily unavailable", level: 1 })).toBeVisible();
  await expect(page.getByText("Nothing you have saved is affected")).toBeVisible();
  // Not "nothing here yet": the section exists and the read failed, which are different things an
  // owner has to be able to tell apart before deciding whether to wait.
  await expect(page.getByText("Nothing here yet")).toHaveCount(0);
  await expect(page.getByText("not found")).toHaveCount(0);
  // Not blank: the owner keeps the portal navigation, so an outage in one section does not cost
  // them the rest of the portal.
  await expect(page.getByRole("navigation", { name: "Owner navigation" })).toBeVisible();
  await expect(page.getByRole("link", { name: "My Restaurant", exact: true })).toBeVisible();
  await expectNoInternalDetail(page);
  await expectNoHorizontalOverflow(page);

  await setFault(page, "admin-outage.localhost", "off");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Menu categories", level: 1 })).toBeVisible();
});

test("every error surface fits a 375px viewport", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", ONE_BROWSER);
  await page.setViewportSize({ width: 375, height: 812 });
  await setFault(page, "fail500.localhost", "on");

  for (const path of ["/", "/menu"]) {
    await page.goto(`http://fail500.localhost:3000${path}`);
    await expectNoHorizontalOverflow(page);
    const card = page.locator("[data-state]").first();
    const box = await card.boundingBox();
    expect(box?.width ?? Number.POSITIVE_INFINITY, `the ${path} state card must fit the viewport`)
      .toBeLessThanOrEqual(375);
    // The retry is a real touch target, not a link-sized one.
    const retry = await page.getByRole("button", { name: "Try again" }).boundingBox();
    expect(retry?.height ?? 0).toBeGreaterThanOrEqual(44);
  }

  await page.goto("http://notfound-api.localhost:3000/menu");
  await expectNoHorizontalOverflow(page);

  await setFault(page, "fail500.localhost", "off");
});
