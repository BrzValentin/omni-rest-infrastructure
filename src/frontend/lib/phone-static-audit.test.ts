import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry.name) && !entry.name.includes(".test.") ? [full] : [];
  }));
  return nested.flat();
}

describe("telephone URI static policy", () => {
  it("keeps every raw telephone URI literal in the audited utility", async () => {
    const root = path.resolve(".");
    const files = [...await sourceFiles(path.join(root, "app")), ...await sourceFiles(path.join(root, "components")), ...await sourceFiles(path.join(root, "lib"))];
    const offenders: string[] = [];
    for (const file of files) {
      if (file.endsWith(`${path.sep}lib${path.sep}phone.ts`)) continue;
      if ((await readFile(file, "utf8")).includes("tel:")) offenders.push(path.relative(root, file));
    }
    expect(offenders).toEqual([]);
  });
});
