import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chunksDirectory = join(frontendRoot, ".next", "static", "chunks");
const serverChunksDirectory = join(frontendRoot, ".next", "server", "chunks");
const homeManifestPath = join(frontendRoot, ".next", "server", "app", "page_client-reference-manifest.js");
const menuManifestPath = join(frontendRoot, ".next", "server", "app", "menu", "page_client-reference-manifest.js");

for (const requiredPath of [chunksDirectory, serverChunksDirectory, homeManifestPath, menuManifestPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`Missing production build artifact: ${requiredPath}. Run npm run build first.`);
  }
}

const homeManifest = readFileSync(homeManifestPath, "utf8");
const menuManifest = readFileSync(menuManifestPath, "utf8");
// Phase 8 moved both renderers back across the server boundary, so neither may appear in a client
// reference manifest at all. Before, each was a client entry point that pulled its whole design tree
// into the browser bundle; the manifests are now the cheapest proof that regression has not returned.
assertExcludes(homeManifest, "components/designs/HomeDesignRenderer.tsx", "Home route registry");
assertExcludes(homeManifest, "components/designs/MenuDesignRenderer.tsx", "Home route registry");
assertExcludes(menuManifest, "components/designs/HomeDesignRenderer.tsx", "Menu route registry");
assertExcludes(menuManifest, "components/designs/MenuDesignRenderer.tsx", "Menu route registry");
// DesignMenuBrowser is the one genuine interactive island on the menu route: it owns hash-driven
// category switching. It must stay a client entry there, and must not leak onto the home route.
assertIncludes(menuManifest, "DesignMenuBrowser", "Menu route registry");
assertExcludes(homeManifest, "DesignMenuBrowser", "Home route registry");

// The invariant is that a design's stylesheet stays an external, selected-only resource and is never
// bundled into Next's own CSS. Every design stylesheet is fully namespaced (asserted further down), so
// its namespace prefix is the exact signature of "this design's CSS got bundled".
//
// This previously grepped for raw colour values (#0e0f0d and friends). That was a proxy, and a leaky
// one: the admin design picker paints each design's swatch with the same brand colours on purpose, so
// the check fired on `.designThumbnail_night` in admin.module.css — admin CSS, not design CSS, and a
// false positive that says nothing about whether a design stylesheet leaked.
const forbiddenBundledDesignSignatures = [
  "legacy-current-v1__",
  "quiet-elegance-v1__",
  "nightfall-v1__",
  "broadsheet-v1__",
  "sunroom-v1__",
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
// The invariant inverted in Phase 8. It used to be "each design's markup sits in exactly one client
// chunk", which assumed the designs shipped to the browser at all. They no longer do: the renderers are
// server components, so design markup must appear in NO client chunk and must be present in the server
// build. That is strictly stronger — the old check would still pass if a design were re-clientified into
// its own chunk, and this one will not.
const clientJavascript = readJavascript(chunksDirectory);
const serverJavascript = readJavascript(serverChunksDirectory);
const markerServerChunks = new Map();
for (const marker of rendererMarkers) {
  const clientMatches = clientJavascript.filter(({ content }) => content.includes(marker));
  if (clientMatches.length > 0) {
    throw new Error(
      `Design markup for ${marker} reached the client bundle in ${clientMatches
        .map(({ name }) => name)
        .join(", ")}. The design renderers must stay server components.`,
    );
  }
  const serverMatches = serverJavascript.filter(({ content }) => content.includes(marker));
  if (serverMatches.length === 0) {
    throw new Error(`Design markup for ${marker} is absent from the server build; it renders nowhere.`);
  }
  markerServerChunks.set(marker, serverMatches.map(({ name }) => name));
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
  const css = stylesheet.toString("utf8");
  const selectors = new Set(
    [...css.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)]
      .map((match) => match[1]),
  );
  const expectedPrefix = `${designId}__`;
  const unscopedSelectors = [...selectors]
    .filter((selector) => !selector.startsWith(expectedPrefix));
  const unscopedRules = extractCssSelectors(css)
    .filter((selector) => !selector.includes(`.${expectedPrefix}`));
  // Animation names share one global namespace, so they are scoped exactly like the class selectors are.
  const unscopedKeyframes = [...css.matchAll(/@(?:-[A-Za-z]+-)?keyframes\s+([^\s{]+)/g)]
    .map((match) => match[1])
    .filter((name) => !name.startsWith(expectedPrefix));
  if (selectors.size === 0 || unscopedSelectors.length > 0 || unscopedRules.length > 0
    || unscopedKeyframes.length > 0) {
    throw new Error(
      `${designId} stylesheet has selectors outside its immutable namespace: ${[
        ...unscopedSelectors,
        ...unscopedRules,
        ...unscopedKeyframes,
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
  designMarkupInClientChunks: 0,
  rendererServerChunks: Object.fromEntries(markerServerChunks),
  selectedStylesheets: styleIds,
  isolatedSelectorCounts,
}, null, 2));

/** Every `.js` under a build directory, recursively — server chunks are nested, client chunks are not. */
function readJavascript(directory) {
  const entries = [];
  for (const entry of readdirSync(directory, { withFileTypes: true, recursive: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const absolute = join(entry.parentPath ?? directory, entry.name);
    entries.push({
      name: absolute.slice(frontendRoot.length + 1),
      content: readFileSync(absolute, "utf8"),
    });
  }
  return entries;
}

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
      // Keyframe steps (`from`, `to`, `0%`) are not selectors and cannot carry the design prefix; the animation
      // name is namespace-checked separately.
      if (context === "keyframes") {
        contexts.push("rule");
      } else if (value.startsWith("@")) {
        contexts.push(/^@(?:-[A-Za-z]+-)?keyframes\b/.test(value) ? "keyframes" : "at-rule");
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
