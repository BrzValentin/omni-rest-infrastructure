import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";

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
console.log(
  JSON.stringify(
    {
      scope: "local production build; not a staging or field measurement",
      javascript: { files: files.length, rawBytes: rawJavaScriptBytes, gzipBytes: gzipJavaScriptBytes },
      fixture: { categories: timings.categories, dishes: timings.dishes },
      navigationMilliseconds: Number(timings.navigationMilliseconds.toFixed(2)),
      categorySwitchMilliseconds: Number(timings.categorySwitchMilliseconds.toFixed(2)),
    },
    null,
    2,
  ),
);
