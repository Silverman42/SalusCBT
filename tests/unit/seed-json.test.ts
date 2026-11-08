// T-108: the committed seed JSON stays in step with the source, and the CLI
// fails loudly with `file:line: message` on a broken exam.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExam } from "../../scripts/lib/parseExam";

const SOURCE_PATH = "content/source/secplus-701-mock-exam.md";
const SEED_PATH = "content/seed/sy0-701.json";
const BROKEN_PATH = "tests/fixtures/broken-exam.md";

/** Run the parser CLI the way `npm run seed:json` does. */
function cli(...args: string[]) {
  const run = spawnSync(process.execPath, ["--import", "tsx", "scripts/parse-exam.ts", ...args], {
    encoding: "utf8",
  });
  return { status: run.status, stdout: run.stdout, stderr: run.stderr };
}

describe(`committed ${SEED_PATH}`, () => {
  const committed: unknown = JSON.parse(readFileSync(SEED_PATH, "utf8"));

  it("matches a fresh parse of the source (run `npm run seed:json` if this fails)", () => {
    const result = parseExam(readFileSync(SOURCE_PATH, "utf8"));
    if (!result.ok) throw new Error(result.errors.map((e) => `${e.line}: ${e.message}`).join("\n"));
    expect(committed).toEqual(JSON.parse(JSON.stringify(result.exam)));
  });

  it("is what the CLI prints for the source", () => {
    const run = cli(SOURCE_PATH);
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual(committed);
  }, 30_000);

  it("is never bundled or served by Nuxt/Nitro (SE-1)", () => {
    expect(SEED_PATH.startsWith("public/")).toBe(false);
    const nuxtConfig = readFileSync("nuxt.config.ts", "utf8");
    expect(nuxtConfig).not.toMatch(/content\/seed|sy0-701\.json/);
  });
});

describe("parser CLI on a broken fixture", () => {
  it("exits 1, writes nothing to stdout and reports file:line: message", () => {
    const run = cli(BROKEN_PATH);
    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    const lines = run.stderr.trimEnd().split("\n");
    expect(lines.at(-1)).toMatch(/^\d+ problem\(s\) found; no output written\.$/);
    for (const l of lines.slice(0, -1))
      expect(l).toMatch(new RegExp(`^${BROKEN_PATH.replace(/\./g, "\\.")}(:\\d+)?: \\S`));
    // Specific problems in the fixture, at their source lines.
    expect(lines).toContain(`${BROKEN_PATH}:7: PBQ 1: has no introduction text`);
    expect(lines).toContain(`${BROKEN_PATH}:11: Q6: has 2 options, expected 4–6`);
    expect(lines).toContain(`${BROKEN_PATH}:25: Part 5: no lab steps found`);
    expect(lines.some((l) => l.startsWith(`${BROKEN_PATH}:31: Part 6: missing`))).toBe(true);
  }, 30_000);

  it("the same errors come back from parseExam with line numbers", () => {
    const result = parseExam(readFileSync(BROKEN_PATH, "utf8"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContainEqual({ line: 11, message: "Q6: has 2 options, expected 4–6" });
    // Q6 is followed by Q8; reported although Part 6 is incomplete (T-109).
    expect(result.errors).toContainEqual({ line: 16, message: "Q8: expected question 7 here" });
    expect(result.errors.every((e) => typeof e.line === "number" && e.line > 0)).toBe(true);
  });

  it("prints usage and exits 2 without an argument", () => {
    const run = cli();
    expect(run.status).toBe(2);
    expect(run.stderr).toMatch(/^usage: /);
  }, 30_000);
});
