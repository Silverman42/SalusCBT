// build-lab.sh → seed JSON for the browser terminal lab (T-701, LLD §13).
//
//   npm run lab:seed
//
// Writes the LabSeed JSON to stdout. If the script uses a form the parser does
// not know, prints `build-lab.sh:<line>: <message>` to stderr and exits 1.
//
// The output holds only what build-lab.sh itself writes (the same script is a
// public download, LB-9), minus the Lab B answer file.

import { readFileSync } from "node:fs";
import { LabScriptError, parseLabScript } from "../shared/labScript";

const file = process.argv[2];
if (!file) {
  process.stderr.write("usage: tsx scripts/lab-seed.ts <build-lab.sh> > <labSeed.json>\n");
  process.exit(2);
}

try {
  process.stdout.write(JSON.stringify(parseLabScript(readFileSync(file, "utf8")), null, 2) + "\n");
} catch (e) {
  if (!(e instanceof LabScriptError)) throw e;
  process.stderr.write(`${e.message}\n`);
  process.exit(1);
}
