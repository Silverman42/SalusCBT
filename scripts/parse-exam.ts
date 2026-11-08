// Markdown exam → seed JSON (LLD §6, T-107).
//
//   npx tsx scripts/parse-exam.ts content/source/secplus-701-mock-exam.md > content/seed/sy0-701.json
//
// Writes the SeedExam JSON to stdout. On any format drift it prints every
// problem as `<file>:<line>: <message>` to stderr and exits 1.
//
// SE-1: the output contains answer keys. It is a build/seed-time artefact only;
// nothing under app/ may import this script, its lib or the JSON.

import { readFileSync } from "node:fs";
import { parseExam } from "./lib/parseExam";

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: tsx scripts/parse-exam.ts <exam.md> > <seed.json>\n");
  process.exit(2);
}

const result = parseExam(readFileSync(file, "utf8"));
if (!result.ok) {
  for (const e of result.errors)
    process.stderr.write(`${file}${e.line === null ? "" : `:${e.line}`}: ${e.message}\n`);
  process.stderr.write(`${result.errors.length} problem(s) found; no output written.\n`);
  process.exit(1);
}
process.stdout.write(JSON.stringify(result.exam, null, 2) + "\n");
