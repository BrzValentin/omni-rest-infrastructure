import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const designs = [
  {
    id: "quiet-elegance-v1",
    name: "Quiet Elegance",
    homeMarker: "quiet-title",
    menuMarker: "quiet-no-menu",
  },
  {
    id: "nightfall-v1",
    name: "Nightfall",
    homeMarker: "nightfall-title",
    menuMarker: "night-no-menu",
  },
  {
    id: "broadsheet-v1",
    name: "Broadsheet",
    homeMarker: "broadsheet-title",
    menuMarker: "sheet-no-menu",
  },
  {
    id: "sunroom-v1",
    name: "Sunroom",
    homeMarker: "sunroom-title",
    menuMarker: "sun-no-menu",
  },
] as const;

test.describe.configure({ mode: "serial" });
test.setTimeout(60_000);

for (const design of designs) {
  test(`${design.name} renders selected-only Home/Menu assets accessibly at desktop and mobile widths`, async ({ page }) => {
    await signIn(page);
    await setContentMode(page, "standard");

    for (const viewport of [
      { width: 1280, height: 900, label: "desktop" },
      { width: 375, height: 812, label: "mobile" },
    ]) {
      await page.setViewportSize(viewport);

      await page.goto(`/admin/design-preview/${design.id}/home`);
      await expect(page.locator(`[data-website-design="${design.id}"]`)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: "Prairie Table" })).toBeVisible();
      await assertNoHorizontalOverflow(page, `${design.name} Home ${viewport.label}`);
      await assertNoSeriousAccessibilityViolations(page);
      await assertSelectedStylesheet(page, design.id);
      if (viewport.label === "desktop") {
        await assertSelectedRendererChunk(
          page,
          design.homeMarker,
          designs.map(({ homeMarker }) => homeMarker),
        );
      }

      await page.goto(`/admin/design-preview/${design.id}/menu`);
      await expect(page.locator(`[data-website-design="${design.id}"]`)).toBeVisible();
      await expect(page.getByRole("heading", { name: "Prairie Poutine" })).toBeVisible();
      await expect(page.getByRole("link", { name: "Desserts" })).toBeVisible();
      await assertNoHorizontalOverflow(page, `${design.name} Menu ${viewport.label}`);
      await assertNoSeriousAccessibilityViolations(page);
      await assertSelectedStylesheet(page, design.id);
      if (viewport.label === "desktop") {
        await assertSelectedRendererChunk(
          page,
          design.menuMarker,
          designs.map(({ menuMarker }) => menuMarker),
        );
      }
    }
  });
}

test("all designs wrap long content and preserve minimal-content states", async ({ page }) => {
  await signIn(page);
  await page.setViewportSize({ width: 375, height: 812 });

  await setContentMode(page, "long");
  for (const design of designs) {
    await page.goto(`/admin/design-preview/${design.id}/home`);
    await expect(page.getByRole("heading", {
      level: 1,
      name: "The Prairie Table and Northern Harvest Dining Room",
    })).toBeVisible();
    await assertNoHorizontalOverflow(page, `${design.name} long Home`);

    await page.goto(`/admin/design-preview/${design.id}/menu`);
    await expect(page.getByRole("heading", {
      name: "Crispy Prairie Potato Poutine with Bothwell Cheese Curds and House Gravy",
    })).toBeVisible();
    await assertNoHorizontalOverflow(page, `${design.name} long Menu`);
  }

  await setContentMode(page, "minimal");
  for (const design of designs) {
    await page.goto(`/admin/design-preview/${design.id}/home`);
    await expect(page.getByRole("heading", { level: 1, name: "M" })).toBeVisible();
    await assertNoHorizontalOverflow(page, `${design.name} minimal Home`);

    await page.goto(`/admin/design-preview/${design.id}/menu`);
    await expect(page.getByRole("heading", { level: 2, name: "Menu coming soon" })).toBeVisible();
    await expect(page.getByRole("link", { name: /Call|Directions/ })).toHaveCount(0);
    await assertNoHorizontalOverflow(page, `${design.name} minimal Menu`);
  }
});

test("design selection is keyboard-safe and publication changes the public Home and Menu", async ({ page }) => {
  await signIn(page);
  await setContentMode(page, "standard");
  let designMutations = 0;
  page.on("request", (request) => {
    if (
      request.method() === "PUT" &&
      new URL(request.url()).pathname === "/api/v1/admin/restaurant/design"
    ) {
      designMutations += 1;
    }
  });

  await page.goto("/admin/design");
  await expect(page.getByRole("heading", { name: "Choose a design" })).toBeVisible();
  for (const { name } of designs) {
    await expect(page.getByRole("heading", { name, level: 3 })).toBeVisible();
  }

  const selectNightfall = page.getByRole("button", { name: "Select Nightfall" });
  await selectNightfall.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('iframe[title="Nightfall home draft preview"]')).toBeVisible();
  expect(designMutations).toBe(0);

  const useDesign = page.getByRole("button", { name: "Use this design" });
  await useDesign.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("alertdialog", { name: "Publish Nightfall?" });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.getByRole("button", { name: "Confirm and publish" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Cancel" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(useDesign).toBeFocused();
  expect(designMutations).toBe(0);

  await useDesign.click();
  await page.getByRole("button", { name: "Confirm and publish" }).click();
  await expect.poll(() => designMutations).toBe(1);
  await expect(page.getByText(/Nightfall saved as the draft design/)).toBeVisible();

  const adminAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    adminAccessibility.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);

  const previewResponse = await page.request.get(
    "http://127.0.0.1:3000/admin/design-preview/nightfall-v1/home",
    { headers: { host: "admin.localhost", cookie: "omni-e2e=1" } },
  );
  expect(previewResponse.headers()["cache-control"]).toContain("no-store");
  expect(previewResponse.headers()["x-robots-tag"]).toContain("noindex");
  expect(previewResponse.headers()["x-frame-options"]).toBe("SAMEORIGIN");

  await page.goto("/");
  await expect(page.locator('[data-website-design="nightfall-v1"]')).toBeVisible();
  await expect(page.getByRole("heading", { level: 1, name: "Prairie Table" })).toBeVisible();
  await assertSelectedStylesheet(page, "nightfall-v1");

  await page.goto("/menu");
  await expect(page.locator('[data-website-design="nightfall-v1"]')).toBeVisible();
  await expect(page.getByRole("heading", { name: "Prairie Poutine" })).toBeVisible();
  await assertSelectedStylesheet(page, "nightfall-v1");
});

test("retained design styles stay isolated across real public links and browser history", async ({ page }) => {
  await setContentMode(page, "standard");
  await setPublishedDesign(page, "legacy-current-v1");
  await page.goto("/?style-history=legacy");
  await expect(page.locator('[data-website-design="legacy-current-v1"]')).toBeVisible();
  const cleanLegacyHome = await designStyleSnapshot(page, "legacy-current-v1");

  await setPublishedDesign(page, "nightfall-v1");
  await page.getByRole("link", { name: "Browse the menu" }).click();
  await expect(page).toHaveURL(/\/menu$/);
  await expect(page.locator('[data-website-design="nightfall-v1"]')).toBeVisible();
  await expectRetainedStylesheets(page, ["legacy-current-v1", "nightfall-v1"]);
  const retainedNightfallMenu = await designStyleSnapshot(page, "nightfall-v1");

  const cleanNightfallPage = await page.context().newPage();
  await cleanNightfallPage.goto("/menu");
  await expect(cleanNightfallPage.locator('[data-website-design="nightfall-v1"]')).toBeVisible();
  await assertSelectedStylesheet(cleanNightfallPage, "nightfall-v1");
  const cleanNightfallMenu = await designStyleSnapshot(cleanNightfallPage, "nightfall-v1");
  await cleanNightfallPage.close();
  expect(retainedNightfallMenu).toEqual(cleanNightfallMenu);

  await page.goBack();
  await expect(page.locator('[data-website-design="legacy-current-v1"]')).toBeVisible();
  await expectRetainedStylesheets(page, ["legacy-current-v1", "nightfall-v1"]);
  expect(await designStyleSnapshot(page, "legacy-current-v1")).toEqual(cleanLegacyHome);

  await page.goForward();
  await expect(page.locator('[data-website-design="nightfall-v1"]')).toBeVisible();
  expect(await designStyleSnapshot(page, "nightfall-v1")).toEqual(cleanNightfallMenu);

  await setPublishedDesign(page, "sunroom-v1");
  await page.getByRole("link", { name: "Prairie Table home" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator('[data-website-design="sunroom-v1"]')).toBeVisible();
  await expectRetainedStylesheets(
    page,
    ["legacy-current-v1", "nightfall-v1", "sunroom-v1"],
  );
  const retainedSunroomHome = await designStyleSnapshot(page, "sunroom-v1");

  const cleanSunroomPage = await page.context().newPage();
  await cleanSunroomPage.goto("/");
  await expect(cleanSunroomPage.locator('[data-website-design="sunroom-v1"]')).toBeVisible();
  await assertSelectedStylesheet(cleanSunroomPage, "sunroom-v1");
  const cleanSunroomHome = await designStyleSnapshot(cleanSunroomPage, "sunroom-v1");
  await cleanSunroomPage.close();
  expect(retainedSunroomHome).toEqual(cleanSunroomHome);

  await page.goBack();
  await expect(page.locator('[data-website-design="nightfall-v1"]')).toBeVisible();
  expect(await designStyleSnapshot(page, "nightfall-v1")).toEqual(cleanNightfallMenu);
  await page.goForward();
  await expect(page.locator('[data-website-design="sunroom-v1"]')).toBeVisible();
  expect(await designStyleSnapshot(page, "sunroom-v1")).toEqual(cleanSunroomHome);
});

test("menu keyboard navigation honors reduced motion", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Element.prototype.scrollIntoView;
    (window as unknown as { __designScrollBehaviors: string[] }).__designScrollBehaviors = [];
    Element.prototype.scrollIntoView = function scrollIntoView(options?: boolean | ScrollIntoViewOptions) {
      const behavior = typeof options === "object" ? options.behavior ?? "auto" : "auto";
      (window as unknown as { __designScrollBehaviors: string[] }).__designScrollBehaviors.push(behavior);
      original.call(this, options);
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await signIn(page);
  await setContentMode(page, "standard");
  await page.goto("/admin/design-preview/quiet-elegance-v1/menu");

  const desserts = page.getByRole("link", { name: "Desserts" });
  await desserts.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#desserts$/);
  await expect(desserts).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("heading", { name: "Saskatoon Berry Tart" })).toBeVisible();
  const behavior = await page.evaluate(
    () => (window as unknown as { __designScrollBehaviors: string[] }).__designScrollBehaviors.at(-1),
  );
  expect(behavior).toBe("auto");
});

async function signIn(page: Page) {
  await page.goto("/admin/restaurant");
  await page.getByLabel("Email").fill("owner@prairietable.test");
  await page.getByLabel("Password", { exact: true }).fill("correct horse battery staple");
  await page.getByRole("button", { name: "Sign In" }).click();
  await expect(page).toHaveURL(/\/admin\/restaurant$/);
}

async function setContentMode(page: Page, mode: "standard" | "long" | "minimal") {
  const response = await page.request.post(
    `http://127.0.0.1:5290/__e2e/design-content?mode=${mode}`,
    { headers: { host: "admin.localhost" } },
  );
  expect(response.ok()).toBe(true);
}

async function setPublishedDesign(page: Page, designId: string) {
  const response = await page.request.post(
    "http://127.0.0.1:5290/__e2e/published-design?designId=" + encodeURIComponent(designId),
    { headers: { host: "admin.localhost" } },
  );
  expect(response.ok()).toBe(true);
}

async function expectRetainedStylesheets(page: Page, designIds: readonly string[]) {
  const stylesheets = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLLinkElement>(
      'link[rel="stylesheet"][href*="/design-previews/styles/"]',
    )].map((link) => new URL(link.href).pathname),
  );
  for (const designId of designIds) {
    expect(stylesheets).toContain("/design-previews/styles/" + designId + ".css");
  }
}

async function designStyleSnapshot(page: Page, designId: string) {
  return page.evaluate((resolvedDesignId) => {
    const root = document.querySelector<HTMLElement>(
      '[data-website-design="' + resolvedDesignId + '"]',
    );
    if (!root) throw new Error("Missing design root " + resolvedDesignId);
    const main = root.querySelector<HTMLElement>("main");
    const heading = root.querySelector<HTMLElement>("h1");
    const navigation = root.querySelector<HTMLElement>('header a[href="/"], header a[href="/menu"]');
    const category = root.querySelector<HTMLElement>('[data-selected="true"]');
    const snapshot = (element: HTMLElement | null, properties: readonly string[]) => {
      if (!element) return null;
      const style = getComputedStyle(element);
      return Object.fromEntries(properties.map((property) => [property, style.getPropertyValue(property)]));
    };
    return {
      root: snapshot(root, ["background-color", "color", "font-family", "min-height"]),
      main: snapshot(main, ["display", "width", "padding-top", "padding-bottom"]),
      heading: snapshot(heading, ["font-family", "font-size", "font-weight", "line-height"]),
      navigation: snapshot(navigation, [
        "display",
        "background-color",
        "border-radius",
        "color",
        "font-family",
      ]),
      category: snapshot(category, [
        "display",
        "background-color",
        "border-radius",
        "color",
        "min-height",
      ]),
    };
  }, designId);
}

async function assertNoHorizontalOverflow(page: Page, label: string) {
  const layout = await page.evaluate(() => {
    const main = document.querySelector("main")?.getBoundingClientRect();
    return {
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
      mainLeft: main?.left ?? -1,
      mainRight: main?.right ?? -1,
      mainHeight: main?.height ?? 0,
    };
  });
  expect(layout.documentWidth, `${label} document width`).toBeLessThanOrEqual(
    layout.viewportWidth + 1,
  );
  expect(layout.mainLeft, `${label} main left edge`).toBeGreaterThanOrEqual(-1);
  expect(layout.mainRight, `${label} main right edge`).toBeLessThanOrEqual(
    layout.viewportWidth + 1,
  );
  expect(layout.mainHeight, `${label} main visibility`).toBeGreaterThan(1);
}

async function assertNoSeriousAccessibilityViolations(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter(
      ({ impact }) => impact === "serious" || impact === "critical",
    ),
  ).toEqual([]);
}

async function assertSelectedStylesheet(page: Page, designId: string) {
  const stylesheets = await page.evaluate(() =>
    performance.getEntriesByType("resource")
      .map((entry) => new URL(entry.name).pathname)
      .filter((path) => path.startsWith("/design-previews/styles/")),
  );
  expect(stylesheets).toEqual([`/design-previews/styles/${designId}.css`]);
}

async function assertSelectedRendererChunk(
  page: Page,
  selectedMarker: string,
  rendererMarkers: readonly string[],
) {
  const loadedJavascript = await page.evaluate(async () => {
    const scriptUrls = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((url) => /\/_next\/static\/chunks\/.*\.js(?:\?|$)/.test(url));
    return (await Promise.all(
      scriptUrls.map(async (url) => {
        const response = await fetch(url);
        return response.text();
      }),
    )).join("\n");
  });
  expect(loadedJavascript).toContain(selectedMarker);
  for (const marker of rendererMarkers) {
    if (marker !== selectedMarker) expect(loadedJavascript).not.toContain(marker);
  }
}
