import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

/**
 * Budgets for the public site's shipped JavaScript and for the two timings `e2e/menu.perf.spec.ts`
 * records against the 30-category by 1,000-dish fixture.
 *
 * Every number below was measured on the build this file ships with, then given headroom; none is
 * aspirational. They inherit the `scope` disclaimer printed with the report — a local production
 * build is not a staging or a field measurement — so they are sized to catch a structural regression
 * (a design tree falling back into the client bundle, hydration returning to all 1,000 dishes),
 * not to police a few percent of drift.
 *
 * - `javascriptRawBytes` / `javascriptGzipBytes`: PR-21 measured 969,353 raw and 305,485 gzip across
 *   27 chunks after moving the five design renderers onto the server; the same build before that
 *   change was 1,177,938 raw and 375,618 gzip across 49 chunks. Roughly 8% of headroom over the
 *   measured figure leaves room for ordinary feature work while a re-clientified design tree — worth
 *   more than 200 KB — cannot fit under it.
 * - `categorySwitchMilliseconds`: 100, the same ceiling the spec has asserted since Phase 6.
 * - `navigationMilliseconds`: the spec times `page.goto` plus the first heading becoming visible, so
 *   it carries Playwright's own driver overhead on top of the page load. The page load itself
 *   measured about 0.5 s for the full fixture against a local production server, but the driver
 *   overhead is not separable from outside the harness, so this ceiling is deliberately loose: it
 *   exists to fail on an order-of-magnitude regression, not to certify a target.
 */
const budgets = {
  javascriptRawBytes: 1_050_000,
  javascriptGzipBytes: 330_000,
  navigationMilliseconds: 5_000,
  categorySwitchMilliseconds: 100,
};

async function javascriptFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return javascriptFiles(target);
      return entry.isFile() && entry.name.endsWith(".js") ? [target] : [];
    }),
  );
  return nested.flat();
}

const files = await javascriptFiles(path.resolve(".next/static/chunks"));
let rawJavaScriptBytes = 0;
let gzipJavaScriptBytes = 0;
for (const file of files) {
  const contents = await readFile(file);
  rawJavaScriptBytes += (await stat(file)).size;
  gzipJavaScriptBytes += gzipSync(contents).byteLength;
}

const timings = JSON.parse(await readFile(path.resolve("test-results/frontend-performance.json"), "utf8"));
const measured = {
  javascriptRawBytes: rawJavaScriptBytes,
  javascriptGzipBytes: gzipJavaScriptBytes,
  navigationMilliseconds: Number(timings.navigationMilliseconds.toFixed(2)),
  categorySwitchMilliseconds: Number(timings.categorySwitchMilliseconds.toFixed(2)),
};

const breaches = Object.entries(budgets)
  .filter(([name, budget]) => measured[name] > budget)
  .map(([name, budget]) => ({ metric: name, measured: measured[name], budget }));

console.log(
  JSON.stringify(
    {
      scope: "local production build; not a staging or field measurement",
      javascript: { files: files.length, rawBytes: rawJavaScriptBytes, gzipBytes: gzipJavaScriptBytes },
      fixture: { categories: timings.categories, dishes: timings.dishes },
      navigationMilliseconds: measured.navigationMilliseconds,
      categorySwitchMilliseconds: measured.categorySwitchMilliseconds,
      budgets,
      breaches,
    },
    null,
    2,
  ),
);

if (breaches.length > 0) {
  for (const { metric, measured: value, budget } of breaches) {
    console.error(`Performance budget exceeded: ${metric} was ${value}, budget is ${budget}.`);
  }
  process.exitCode = 1;
}
