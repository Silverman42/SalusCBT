// cat for the terminal lab (T-703, LB-2): concatenate files (or stdin, `-`).
// Flags: -n (number lines), -b (number non-blank lines), -s (squeeze blank
// lines), -E (`$` at line ends), -T (`^I` for tabs), -A (= -ET here). Line
// numbers run on across files, like GNU. Without flags the bytes are copied
// as stored, so `cat x.exe | sha256sum` hashes the real installer.

import { fail, parseOptions, readOperand, type CommandSpec } from "../command";
import { contentText, type FileContent } from "../vfs";
import { quoteIfNeeded, splitLines } from "./fileUtil";

export const cat: CommandSpec = {
  name: "cat",
  summary: "print files (-n -b -s -E -T -A)",
  run(ctx) {
    const parsed = parseOptions(ctx, {
      flags: "nbsETA",
      long: {
        number: { key: "n" },
        "number-nonblank": { key: "b" },
        "squeeze-blank": { key: "s" },
        "show-ends": { key: "E" },
        "show-tabs": { key: "T" },
        "show-all": { key: "A" },
      },
    });
    if (!parsed) return 2;
    const f = parsed.flags;
    const nonblank = f.has("b");
    const number = nonblank || f.has("n");
    const squeeze = f.has("s");
    const ends = f.has("E") || f.has("A");
    const tabs = f.has("T") || f.has("A");
    const plain = !number && !squeeze && !ends && !tabs;

    let code = 0;
    let lineNo = 0;
    let prevBlank = false;
    const files = parsed.operands.length > 0 ? parsed.operands : ["-"];
    for (const file of files) {
      const r = readOperand(ctx, file);
      if (!r.ok) {
        code = fail(ctx, `${quoteIfNeeded(file)}: ${r.error.message}`);
        continue;
      }
      if (plain) {
        ctx.stdout.write(r.content);
        continue;
      }
      const out: string[] = [];
      for (const piece of splitLines(r.content)) {
        let line = contentText(piece as FileContent);
        const hasNl = line.endsWith("\n");
        if (hasNl) line = line.slice(0, -1);
        const blank = line === "" && hasNl;
        if (squeeze && blank && prevBlank) continue;
        prevBlank = blank;
        if (tabs) line = line.replace(/\t/g, "^I");
        if (number && !(nonblank && blank)) line = `${String(++lineNo).padStart(6)}\t${line}`;
        if (hasNl) line += ends ? "$\n" : "\n";
        out.push(line);
      }
      ctx.stdout.write(out.join(""));
    }
    return code;
  },
};
