import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chunksDirectory = join(frontendRoot, ".next", "static", "chunks");
const homeManifestPath = join(frontendRoot, ".next", "server", "app", "page_client-reference-manifest.js");
const menuManifestPath = join(frontendRoot, ".next", "server", "app", "menu", "page_client-reference-manifest.js");

for (const requiredPath of [chunksDirectory, homeManifestPath, menuManifestPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Missing production build artifact: ${requiredPath}. Run npm run build first.`);
  }
}

const homeManifest = readFileSync(homeManifestPath, "utf8");
const menuManifest = readFileSync(menuManifestPath, "utf8");
assertIncludes(homeManifest, "components/designs/HomeDesignRenderer.tsx", "Home route registry");
assertExcludes(homeManifest, "components/designs/MenuDesignRenderer.tsx", "Home route registry");
assertExcludes(homeManifest, "DesignMenuBrowser", "Home route registry");
assertExcludes(homeManifest, "CategoryBrowser", "Home route registry");
assertIncludes(menuManifest, "components/designs/MenuDesignRenderer.tsx", "Menu route registry");
assertExcludes(menuManifest, "components/designs/HomeDesignRenderer.tsx", "Menu route registry");
assertExcludes(menuManifest, "CategoryBrowser", "Menu route registry");

const forbiddenBundledDesignSignatures = [
  "#0e0f0d",
  "#dce7e9",
  "#f4f1e8",
  ".sunShape",
  ".categoryHeading",
];
for (const [routeName, manifest] of [["home", homeManifest], ["menu", menuManifest]]) {
  const cssFiles = routeStaticAssets(manifest, "css");
  if (cssFiles.length === 0) throw new Error(`${routeName} route has no shared CSS asset.`);
  const css = cssFiles
    .map((asset) => readFileSync(join(frontendRoot, ".next", asset), "utf8"))
    .join("\n");
  for (const signature of forbiddenBundledDesignSignatures) {
    assertExcludes(css, signature, `${routeName} linked Next CSS`);
  }
}

const rendererMarkers = [
  "quiet-title",
  "nightfall-title",
  "broadsheet-title",
  "sunroom-title",
  "quiet-no-menu",
  "night-no-menu",
  "sheet-no-menu",
  "sun-no-menu",
];
const javascriptFiles = readdirSync(chunksDirectory)
  .filter((name) => name.endsWith(".js"))
  .map((name) => ({
    name,
    content: readFileSync(join(chunksDirectory, name), "utf8"),
  }));
const markerChunks = new Map();
for (const marker of rendererMarkers) {
  const matches = javascriptFiles.filter(({ content }) => content.includes(marker));
  if (matches.length !== 1) {
    throw new Error(`Expected exactly one production chunk for ${marker}; found ${matches.length}.`);
  }
  markerChunks.set(marker, matches[0].name);
}
if (new Set(markerChunks.values()).size !== rendererMarkers.length) {
  throw new Error("Design Home/Menu renderers were coalesced instead of remaining selected-only chunks.");
}

const styleDirectory = join(frontendRoot, "public", "design-previews", "styles");
const styleIds = [
  "legacy-current-v1",
  "quiet-elegance-v1",
  "nightfall-v1",
  "broadsheet-v1",
  "sunroom-v1",
];
const styleHashes = new Set();
const isolatedSelectorCounts = {};
for (const designId of styleIds) {
  const stylesheet = readFileSync(join(styleDirectory, `${designId}.css`));
  if (stylesheet.byteLength < 1000) {
    throw new Error(`${designId} stylesheet is unexpectedly empty.`);
  }
  styleHashes.add(createHash("sha256").update(stylesheet).digest("hex"));
  const selectors = new Set(
    [...stylesheet.toString("utf8").matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)]
      .map((match) => match[1]),
  );
  const expectedPrefix = `${designId}__`;
  const unscopedSelectors = [...selectors]
    .filter((selector) => !selector.startsWith(expectedPrefix));
  const unscopedRules = extractCssSelectors(stylesheet.toString("utf8"))
    .filter((selector) => !selector.includes(`.${expectedPrefix}`));
  if (selectors.size === 0 || unscopedSelectors.length > 0 || unscopedRules.length > 0) {
    throw new Error(
      `${designId} stylesheet has selectors outside its immutable namespace: ${[
        ...unscopedSelectors,
        ...unscopedRules,
      ].join(", ")}`,
    );
  }
  isolatedSelectorCounts[designId] = selectors.size;
}
if (styleHashes.size !== styleIds.length) {
  throw new Error("Design stylesheets must remain materially distinct resources.");
}

console.log(JSON.stringify({
  homeLinkedCssBytes: linkedCssBytes(homeManifest),
  menuLinkedCssBytes: linkedCssBytes(menuManifest),
  rendererChunks: Object.fromEntries(markerChunks),
  selectedStylesheets: styleIds,
  isolatedSelectorCounts,
}, null, 2));

function routeStaticAssets(manifest, extension) {
  return [...new Set(
    [...manifest.matchAll(new RegExp(`(?:/_next/)?(static/chunks/[^"]+\\.${extension})`, "g"))]
      .map((match) => match[1]),
  )];
}

function linkedCssBytes(manifest) {
  return routeStaticAssets(manifest, "css")
    .reduce((total, asset) => total + readFileSync(join(frontendRoot, ".next", asset)).byteLength, 0);
}

function extractCssSelectors(css) {
  const selectors = [];
  const contexts = [];
  let prelude = "";
  for (const character of css) {
    const context = contexts.at(-1);
    if (character === "{") {
      if (context === "rule") continue;
      const value = prelude.trim();
      prelude = "";
      if (value.startsWith("@")) {
        contexts.push("at-rule");
      } else {
        selectors.push(...value.split(",").map((selector) => selector.trim()));
        contexts.push("rule");
      }
    } else if (character === "}") {
      contexts.pop();
      prelude = "";
    } else if (context !== "rule") {
      prelude += character;
    }
  }
  return selectors.filter(Boolean);
}

function assertIncludes(value, expected, label) {
  if (!value.includes(expected)) throw new Error(`${label} is missing ${expected}.`);
}

function assertExcludes(value, unexpected, label) {
  if (value.includes(unexpected)) throw new Error(`${label} unexpectedly contains ${unexpected}.`);
}
