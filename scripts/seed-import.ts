// Load the committed seed into Convex (LLD §6.3, T-109).
//
//   npm run seed:import                         # dev deployment
//   npm run seed:import -- --prod               # extra args go to `convex run`
//   npx tsx scripts/seed-import.ts <seed.json> [convex run options]
//
// This is `npx convex run seed:importExam '{"seed": <json>}'` with the JSON
// compacted first: the pretty-printed file is ~150 KB, over Linux's 128 KiB
// limit for a single command-line argument; compact it is ~120 KB. Each run
// creates the next default version (it never overwrites one).

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";

const DEFAULT_SEED = "content/seed/sy0-701.json";
/** Linux MAX_ARG_STRLEN is 128 KiB; keep a margin. */
const MAX_ARG_BYTES = 125 * 1024;

const args = process.argv.slice(2);
const file = args[0] && !args[0].startsWith("-") ? args.shift()! : DEFAULT_SEED;

const seed: unknown = JSON.parse(readFileSync(file, "utf8"));
const arg = JSON.stringify({ seed });
const bytes = Buffer.byteLength(arg);
if (bytes > MAX_ARG_BYTES) {
  process.stderr.write(
    `${file}: ${Math.round(bytes / 1024)} KB is too large for one \`convex run\` argument ` +
      `(limit ${MAX_ARG_BYTES / 1024} KB). Split the import into per-section calls (LLD §6.3).\n`,
  );
  process.exit(1);
}

const run = spawnSync("npx", ["convex", "run", "seed:importExam", arg, ...args], {
  stdio: "inherit",
});
process.exit(run.status ?? 1);
