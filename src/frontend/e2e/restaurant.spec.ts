import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("renders the shared telephone action in server HTML and without JavaScript", async ({ browser }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "One browser verifies the server-rendered progressive enhancement baseline.");
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage();
  await page.goto("http://phone.localhost:3000/");
  await expect(page.getByRole("heading", { name: "Prairie Table" })).toBeVisible();
  const call = page.getByRole("link", { name: "Call (204) 555-0123" });
  await expect(call).toHaveAttribute("href", "tel:+12045550123");
  await expect(page.getByRole("link", { name: "Get directions" })).toBeVisible();
  await context.close();
});

test("owner signs in, edits the restaurant, and sees an isolated draft preview", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "chromium", "The authenticated workflow is browser-independent and covered once.");
  await page.goto("http://admin.localhost:3000/admin/restaurant");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.getByLabel("Email").fill("owner@prairietable.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin\/restaurant$/);
  await expect(page.getByRole("heading", { name: "Restaurant", level: 1 })).toBeVisible();

  await page.getByLabel("Description").fill("Updated seasonal food from the prairies.");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/Profile saved/)).toBeVisible();

  await page.getByRole("link", { name: "Preview draft" }).click();
  await expect(page.getByText("Draft preview", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Call (204) 555-0123" })).toHaveAttribute("href", "tel:+12045550123");
  const robots = await page.locator('meta[name="robots"]').getAttribute("content");
  expect(robots).toContain("noindex");

  const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(accessibility.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
});
