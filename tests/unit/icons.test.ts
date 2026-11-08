/**
 * X-01: every icon the app names must ship in the client bundle. The CSP
 * blocks api.iconify.design (T-218) and `fallbackToApi` is off, so an icon
 * that @nuxt/icon's scan misses, or a misspelt one, renders as nothing and
 * logs a CSP violation. The scan reads app/**\/*.{vue,ts} (nuxt.config.ts);
 * this test checks the names resolve in the installed Lucide collection and
 * that nobody builds an icon name at runtime, which no scan can see.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import lucide from "@iconify-json/lucide/icons.json" with { type: "json" };

const ROOT = join(import.meta.dirname, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(vue|ts)$/.test(entry.name) ? [path] : [];
  });
}

const files = sourceFiles(join(ROOT, "app")).map((path) => ({
  path: path.slice(ROOT.length + 1),
  text: readFileSync(path, "utf8"),
}));

describe("icons", () => {
  it("nuxt.config.ts scans .vue and .ts files under app/", () => {
    const config = readFileSync(join(ROOT, "nuxt.config.ts"), "utf8");
    expect(config).toContain('globInclude: ["app/**/*.{vue,ts}"]');
  });

  it("every i-lucide-* name exists in @iconify-json/lucide", () => {
    const known = new Set([...Object.keys(lucide.icons), ...Object.keys(lucide.aliases ?? {})]);
    const missing = files.flatMap(({ path, text }) =>
      [...text.matchAll(/\bi-lucide-([a-z0-9]+(?:-[a-z0-9]+)*)/g)]
        .map((m) => m[1]!)
        .filter((name) => !known.has(name))
        .map((name) => `${path}: i-lucide-${name}`),
    );
    expect(missing).toEqual([]);
  });

  it("no icon name is built at runtime", () => {
    const dynamic = files.flatMap(({ path, text }) =>
      /i-lucide-\$\{|["'`]i-lucide-["'`]\s*\+/.test(text) ? [path] : [],
    );
    expect(dynamic).toEqual([]);
  });
});
