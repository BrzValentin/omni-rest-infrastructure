import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { expect, test } from "@playwright/test";

test("@perf renders and switches the 30 category by 1000 dish fixture", async ({ page }) => {
  const startedAt = performance.now();
  await page.goto("http://large-menu.localhost:3000/menu", { waitUntil: "load" });
  await expect(page.getByRole("heading", { level: 1, name: "Large Fixture" })).toBeVisible();
  const navigationMilliseconds = performance.now() - startedAt;

  await expect(page.getByRole("link", { name: /^Category \d+$/ })).toHaveCount(30);
  await expect(page.getByRole("heading", { level: 3, includeHidden: true })).toHaveCount(1_000);

  const categorySwitchMilliseconds = await page.evaluate(async () => {
    const link = document.querySelector<HTMLAnchorElement>('a[href="#category-30"]');
    if (!link) throw new Error("Category 30 link is missing.");
    const switchStartedAt = performance.now();
    link.click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const heading = document.querySelector<HTMLElement>("#category-30");
    if (!heading || heading.closest("section")?.hidden) throw new Error("Category 30 did not become visible.");
    return performance.now() - switchStartedAt;
  });
  await expect(page.getByRole("heading", { level: 2, name: "Category 30" })).toBeVisible();
  expect(categorySwitchMilliseconds).toBeLessThan(100);

  const outputDirectory = path.resolve("test-results");
  await mkdir(outputDirectory, { recursive: true });
  await writeFile(
    path.join(outputDirectory, "frontend-performance.json"),
    `${JSON.stringify({ navigationMilliseconds, categorySwitchMilliseconds, categories: 30, dishes: 1_000 }, null, 2)}\n`,
  );
});
