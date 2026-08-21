import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const OWNER_EMAIL = "real.owner@example.test";
const OWNER_PASSWORD = "Real-Stack-Owner-9!Password";
const OTHER_TENANT_MEDIA_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const VALID_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

async function expectSaved(page: Page, label: string) {
  await expect(page.getByText(new RegExp(`${label} saved`))).toBeVisible();
}

async function expectNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(result.violations.filter(({ impact }) => impact === "serious" || impact === "critical")).toEqual([]);
}

test("real owner workflow persists and publishes every Phase 3 restaurant field", async ({ page }) => {
  test.setTimeout(120_000);

  await page.goto("/admin/restaurant/preview?from=deep-link&section=hours");
  await expect(page).toHaveURL(/\/admin\/login\?returnPath=%2Fadmin%2Frestaurant%2Fpreview%3Ffrom%3Ddeep-link%26section%3Dhours$/);
  await page.getByLabel("Email").fill(OWNER_EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(OWNER_PASSWORD);
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin\/restaurant\/preview\?from=deep-link&section=hours$/);
  await page.getByRole("link", { name: "Back to editor" }).click();
  await expect(page).toHaveURL(/\/admin\/restaurant$/);

  await page.getByLabel("Name").fill("Real Prairie Kitchen");
  await page.getByLabel("Description").fill("Real full-stack seasonal kitchen.");
  await page.getByLabel("Phone (E.164)").fill("+12045550199");
  await page.getByLabel("Phone display").fill("(204) 555-0199");
  await page.getByLabel("Email").fill("hello@realprairie.test");
  await page.getByLabel("Time zone").fill("America/Winnipeg");
  await page.getByLabel("Address line 1").fill("123 Real Stack Avenue");
  await page.getByLabel("Address line 2").fill("Suite 7");
  await page.getByLabel("City").fill("Winnipeg");
  await page.getByLabel("Province or state").fill("MB");
  await page.getByLabel("Postal code").fill("R3C 0A1");
  await page.getByLabel("Country code").fill("CA");
  await page.getByLabel("Latitude").fill("49.8951");
  await page.getByLabel("Longitude").fill("-97.1384");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expectSaved(page, "Profile");

  const monday = page.getByRole("group", { name: "Monday" });
  await monday.getByRole("button", { name: "Add period" }).click();
  await monday.getByRole("button", { name: "Add period" }).click();
  await monday.getByLabel("Opens").nth(0).fill("09:00");
  await monday.getByLabel("Closes").nth(0).fill("14:00");
  await monday.getByLabel("Opens").nth(1).fill("17:00");
  await monday.getByLabel("Closes").nth(1).fill("01:00");
  await page.getByRole("button", { name: "Save regular hours" }).click();
  await expectSaved(page, "Regular hours");

  const specialHours = page.locator("section").filter({ has: page.getByRole("heading", { name: "Special hours" }) });
  await specialHours.getByLabel("Date").fill("2026-12-31");
  await specialHours.getByLabel("Opens").nth(0).fill("10:00");
  await specialHours.getByLabel("Closes").nth(0).fill("14:00");
  await specialHours.getByRole("button", { name: "Add special period" }).click();
  await specialHours.getByLabel("Opens").nth(1).fill("17:00");
  await specialHours.getByLabel("Closes").nth(1).fill("23:00");
  await specialHours.getByLabel("Note").fill("New Year's Eve service");
  await specialHours.getByRole("button", { name: "Add special date" }).click();
  await expectSaved(page, "Special hours");

  const deleteTrigger = page.getByRole("button", { name: "Delete special hours for 2026-12-31" });
  await deleteTrigger.click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete special hours?" });
  const cancelDelete = deleteDialog.getByRole("button", { name: "Cancel" });
  const confirmDelete = deleteDialog.getByRole("button", { name: "Confirm delete" });
  const background = page.locator("body > div").filter({ has: page.locator("#main-content") });
  await expect(cancelDelete).toBeFocused();
  await expect(background).toHaveAttribute("inert", "");
  await expect(background).toHaveAttribute("aria-hidden", "true");
  await page.keyboard.press("Tab");
  await expect(confirmDelete).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(cancelDelete).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(deleteDialog).toHaveCount(0);
  await expect(deleteTrigger).toBeFocused();
  await expect(background).not.toHaveAttribute("inert", "");
  await expect(background).not.toHaveAttribute("aria-hidden", "true");

  const socialLinks = page.locator("section").filter({ has: page.getByRole("heading", { name: "Social links" }) });
  await socialLinks.getByRole("button", { name: "Add link" }).click();
  await socialLinks.getByLabel("Platform").fill("instagram");
  await socialLinks.getByLabel("URL").fill("https://www.instagram.com/real_prairie");
  await socialLinks.getByRole("button", { name: "Save social links" }).click();
  await expectSaved(page, "Social links");

  const mainImage = page.locator("section").filter({ has: page.getByRole("heading", { name: "Main image" }) });
  await mainImage.getByLabel("Upload alt text").fill("Real dining room");
  await mainImage.getByLabel("Upload image").setInputFiles({ name: "real-dining-room.png", mimeType: "image/png", buffer: VALID_PNG });
  await mainImage.locator("button", { hasText: "Upload image" }).click();
  await expect(page.getByText("Image uploaded and ready to select.")).toBeVisible();
  await mainImage.getByLabel("Selected image alt text").fill("Accessible real dining room");
  await mainImage.getByRole("button", { name: "Save alt text" }).click();
  await expectSaved(page, "Image alt text");
  await mainImage.getByRole("button", { name: "Select image" }).click();
  await expectSaved(page, "Main image");

  const request = page.context().request;
  const adminResponse = await request.get("/api/v1/admin/restaurant");
  expect(adminResponse.status()).toBe(200);
  const admin = await adminResponse.json() as { eTag: string };
  const tokenResponse = await request.get("/api/v1/auth/antiforgery");
  expect(tokenResponse.status()).toBe(200);
  const { token } = await tokenResponse.json() as { token: string };
  const crossTenant = await request.put("/api/v1/admin/restaurant/main-image", {
    headers: { "X-CSRF-TOKEN": token, "If-Match": admin.eTag },
    data: { mediaAssetId: OTHER_TENANT_MEDIA_ID },
  });
  expect(crossTenant.status()).toBe(404);
  expect((await crossTenant.json()).code).toBe("admin_resource_not_found");

  await page.getByRole("link", { name: "Preview draft" }).click();
  await expect(page.getByRole("heading", { name: "Real Prairie Kitchen" })).toBeVisible();
  await expect(page.getByText("Real full-stack seasonal kitchen.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call (204) 555-0199" })).toHaveAttribute("href", "tel:+12045550199");
  await expect(page.getByRole("link", { name: "hello@realprairie.test" })).toHaveAttribute("href", "mailto:hello@realprairie.test");
  await expect(page.getByText(/123 Real Stack Avenue, Suite 7, Winnipeg, MB, R3C 0A1, CA/)).toBeVisible();
  await expect(page.getByText("09:00–14:00, 17:00–01:00 next day")).toBeVisible();
  await expect(page.getByText(/2026-12-31.*10:00–14:00, 17:00–23:00.*New Year's Eve service/)).toBeVisible();
  await expect(page.getByRole("link", { name: "instagram" })).toHaveAttribute("href", "https://www.instagram.com/real_prairie");
  await expect(page.getByRole("img", { name: "Accessible real dining room" })).toBeVisible();
  expect(await page.locator('meta[name="robots"]').getAttribute("content")).toContain("noindex");
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Real Prairie Kitchen" })).toBeVisible();
  await expect(page.getByText("Real full-stack seasonal kitchen.")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call (204) 555-0199" })).toHaveAttribute("href", "tel:+12045550199");
  await expect(page.getByRole("link", { name: "hello@realprairie.test" })).toHaveAttribute("href", "mailto:hello@realprairie.test");
  await expect(page.getByText(/123 Real Stack Avenue, Suite 7, Winnipeg, MB, R3C 0A1, CA/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Get directions" })).toHaveAttribute("href", /49\.8951.*-97\.1384/);
  await expect(page.getByText("09:00–14:00, 17:00–01:00 next day")).toBeVisible();
  await expect(page.getByText(/2026-12-31.*10:00–14:00, 17:00–23:00.*New Year's Eve service/)).toBeVisible();
  await expect(page.getByRole("link", { name: "instagram" })).toHaveAttribute("href", "https://www.instagram.com/real_prairie");
  await expect(page.getByRole("img", { name: "Accessible real dining room" })).toBeVisible();
  await expectNoSeriousAccessibilityViolations(page);

  await page.goto("/admin/design");
  await expect(page.getByRole("heading", { name: "Choose a design" })).toBeVisible();
  await page.locator("article").filter({
    has: page.getByRole("heading", { name: "Quiet Elegance", level: 3 }),
  }).getByRole("button").click();
  const designPreview = page.frameLocator('iframe[title="Quiet Elegance home draft preview"]');
  await expect(designPreview.getByRole("heading", { name: "Real Prairie Kitchen" })).toBeVisible();
  await expect(designPreview.getByText("Real full-stack seasonal kitchen.")).toBeVisible();
  await page.getByRole("button", { name: "Menu" }).click();
  await expect(
    page.frameLocator('iframe[title="Quiet Elegance menu draft preview"]').getByRole("heading", { level: 1, name: "Real Prairie Kitchen" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Use this design" }).click();
  await page.getByRole("button", { name: "Confirm and publish" }).click();
  await expect(page.getByText(/Quiet Elegance saved as the draft design/)).toBeVisible();

  await page.goto("/");
  await expect(page.locator('[data-website-design="quiet-elegance-v1"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Real Prairie Kitchen" })).toBeVisible();
  await page.goto("/menu");
  await expect(page.locator('[data-website-design="quiet-elegance-v1"]')).toBeVisible();

  await page.goto("/admin");
  await page.getByRole("button", { name: "Sign Out" }).click();
  await expect(page).toHaveURL(/\/admin\/login$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Sign Out" })).toHaveCount(0);
  await page.goto("/admin/restaurant");
  await expect(page).toHaveURL(/\/admin\/login/);
  await page.reload();
  await expect(page).toHaveURL(/\/admin\/login/);
  await expect(page.getByRole("heading", { name: "Sign In" })).toBeVisible();
});
