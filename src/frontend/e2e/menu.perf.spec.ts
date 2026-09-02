import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The two ceilings asserted below are mirrored by `scripts/perf-report.mjs`, which fails the run when
 * either is exceeded. They inherit that script's scope note: this is a local production build, not a
 * staging or a field measurement.
 *
 * `navigationMilliseconds` is wall-clock around `page.goto` plus the first heading becoming visible,
 * so it includes Playwright's driver overhead as well as the page load. That makes it an
 * order-of-magnitude guard — it fails when the fixture stops rendering in a browser's worth of time —
 * rather than a target. `categorySwitchMilliseconds` is measured inside the page and is the tight one.
 */
const navigationBudgetMilliseconds = 5_000;
const categorySwitchBudgetMilliseconds = 100;

test("@perf renders and switches the 30 category by 1000 dish fixture", async ({ page }) => {
  const startedAt = performance.now();
  await page.goto("http://large-menu.localhost:3000/menu", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "Large Fixture" })).toBeVisible();
  const navigationMilliseconds = performance.now() - startedAt;
  expect(navigationMilliseconds).toBeLessThan(navigationBudgetMilliseconds);

  await expect(page.getByRole("link", { name: /^Category \d+$/ })).toHaveCount(30);
  await expect(page.getByRole("heading", { level: 3, includeHidden: true })).toHaveCount(1_000);

  const categorySwitchMilliseconds = await page.evaluate(async () => {
    // The category nav links to the real `/menu/<slug>` page so a crawler can discover every
    // category (PR-19 Task 6); the click handler switches panels in place and pushes the `#slug`
    // hash. The measurement follows the link element, not the hash it writes.
    const link = document.querySelector<HTMLAnchorElement>('a[href="/menu/category-30"]');
    if (!link) throw new Error("Category 30 link is missing.");
    const switchStartedAt = performance.now();
    link.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const heading = document.querySelector<HTMLElement>("#category-30");
    if (!heading || heading.closest("section")?.hidden) throw new Error("Category 30 did not become visible.");
    return performance.now() - switchStartedAt;
  });
  await expect(page).toHaveURL(/#category-30$/);
  await expect(page.getByRole("heading", { level: 2, name: "Category 30" })).toBeVisible();
  expect(categorySwitchMilliseconds).toBeLessThan(categorySwitchBudgetMilliseconds);

  const outputDirectory = path.resolve("test-results");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "frontend-performance.json"),
    `${JSON.stringify({ navigationMilliseconds, categorySwitchMilliseconds, categories: 30, dishes: 1_000 }, null, 2)}\n`,
  );
});
