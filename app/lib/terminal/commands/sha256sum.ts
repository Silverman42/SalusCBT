// sha256sum and sha256sum -c for Lab B (T-705, LLD §13.2, LB-2, LB-5).
//
// Real SHA-256 over the stored bytes (Web Crypto, via seedLab's sha256Hex).
// Output and messages follow GNU coreutils 9.x:
//
//   <hex>  <name>                      (text mode, default; -b gives " *<name>")
//   <name>: OK | FAILED | FAILED open or read
//   sha256sum: WARNING: 1 computed checksum did NOT match       (stderr)
//   sha256sum: WARNING: 2 listed files could not be read        (stderr)
//   sha256sum: WARNING: 1 line is improperly formatted          (stderr)
//   sha256sum: <file>: no properly formatted checksum lines found
//
// Names containing `\`, newline or CR are escaped and the line starts with `\`.

import { fail, parseOptions, readOperand, type CommandContext, type CommandSpec } from "../command";
import { contentBytes } from "../vfs";
import { sha256Hex } from "../seedLab";

const HEX64 = /^[0-9a-fA-F]{64}$/;

function needsEscape(name: string): boolean {
  return /[\\\n\r]/.test(name);
}

function escapeName(name: string): string {
  return name.replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/\r/g, "\\r");
}

/** Undo escapeName; undefined for an invalid escape (a misformatted line). */
function unescapeName(name: string): string | undefined {
  let out = "";
  for (let i = 0; i < name.length; i++) {
    const c = name[i]!;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = name[++i];
    if (n === "\\") out += "\\";
    else if (n === "n") out += "\n";
    else if (n === "r") out += "\r";
    else return undefined;
  }
  return out;
}

/** `\name` form for output if needed. */
function shown(name: string): { prefix: string; name: string } {
  return needsEscape(name) ? { prefix: "\\", name: escapeName(name) } : { prefix: "", name };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface CheckLine {
  hex: string;
  name: string;
}

/** Parse one line of a checksum file (GNU or BSD `SHA256 (name) = hex` form). */
function parseCheckLine(raw: string): CheckLine | undefined {
  let line = raw.replace(/^[ \t]+/, "");
  let escaped = false;
  if (line.startsWith("\\")) {
    escaped = true;
    line = line.slice(1);
  }
  let hex: string;
  let name: string;
  const bsd = /^SHA256 ?\((.*)\) ?= ?([0-9a-fA-F]{64})$/.exec(line);
  if (bsd) {
    name = bsd[1]!;
    hex = bsd[2]!;
  } else {
    hex = line.slice(0, 64);
    const sep = line.slice(64, 66);
    if (!HEX64.test(hex) || (sep !== "  " && sep !== " *")) return undefined;
    name = line.slice(66);
  }
  if (name === "") return undefined;
  if (escaped) {
    const unescaped = unescapeName(name);
    if (unescaped === undefined) return undefined;
    name = unescaped;
  }
  return { hex: hex.toLowerCase(), name };
}

interface CheckOptions {
  quiet: boolean;
  status: boolean;
  strict: boolean;
  warn: boolean;
  ignoreMissing: boolean;
}

/** Verify one checksum file. Returns true if everything matched. */
async function checkFile(ctx: CommandContext, file: string, opts: CheckOptions): Promise<boolean> {
  const display = file === "-" ? "'standard input'" : file;
  const read = readOperand(ctx, file);
  if (!read.ok) {
    fail(ctx, `${file}: ${read.error.message}`);
    return false;
  }
  const text = new TextDecoder().decode(contentBytes(read.content));
  const lines = text.split("\n");
  if (lines[lines.length - 1] === "") lines.pop();

  let formatted = 0;
  let misformatted = 0;
  let readFailures = 0;
  let mismatched = 0;
  let matched = 0;

  for (const [index, rawLine] of lines.entries()) {
    if (rawLine.startsWith("#")) continue;
    const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
    if (line === "") continue;
    const entry = parseCheckLine(line);
    if (!entry) {
      misformatted++;
      if (opts.warn)
        fail(ctx, `${display}: ${index + 1}: improperly formatted SHA256 checksum line`);
      continue;
    }
    formatted++;
    const out = shown(entry.name);
    const target = readOperand(ctx, entry.name);
    if (!target.ok) {
      if (opts.ignoreMissing && target.error.code === "ENOENT") continue;
      readFailures++;
      fail(ctx, `${entry.name}: ${target.error.message}`);
      if (!opts.status) ctx.stdout.write(`${out.prefix}${out.name}: FAILED open or read\n`);
      continue;
    }
    const actual = await sha256Hex(contentBytes(target.content));
    if (actual === entry.hex) {
      matched++;
      if (!opts.quiet && !opts.status) ctx.stdout.write(`${out.prefix}${out.name}: OK\n`);
    } else {
      mismatched++;
      if (!opts.status) ctx.stdout.write(`${out.prefix}${out.name}: FAILED\n`);
    }
  }

  if (formatted === 0) {
    fail(ctx, `${display}: no properly formatted checksum lines found`);
    return false;
  }
  if (!opts.status) {
    const warn = (msg: string) => fail(ctx, `WARNING: ${msg}`);
    if (misformatted > 0) {
      warn(plural(misformatted, "line is improperly formatted", "lines are improperly formatted"));
    }
    if (readFailures > 0) {
      warn(plural(readFailures, "listed file could not be read", "listed files could not be read"));
    }
    if (mismatched > 0) {
      warn(
        plural(mismatched, "computed checksum did NOT match", "computed checksums did NOT match"),
      );
    }
    if (opts.ignoreMissing && matched + mismatched === 0)
      fail(ctx, `${display}: no file was verified`);
  }
  return (
    mismatched === 0 &&
    readFailures === 0 &&
    (!opts.strict || misformatted === 0) &&
    (!opts.ignoreMissing || matched + mismatched > 0)
  );
}

export const sha256sum: CommandSpec = {
  name: "sha256sum",
  summary: "print or check SHA-256 hashes (-c FILE)",
  async run(ctx) {
    const opts = parseOptions(ctx, {
      flags: "bctw",
      long: {
        binary: { key: "b" },
        check: { key: "c" },
        text: { key: "t" },
        warn: { key: "w" },
        quiet: { key: "quiet" },
        status: { key: "status" },
        strict: { key: "strict" },
        "ignore-missing": { key: "ignore-missing" },
      },
    });
    if (!opts) return 2;
    const { flags } = opts;
    const files = opts.operands.length > 0 ? opts.operands : ["-"];

    if (flags.has("c")) {
      if (flags.has("b") || flags.has("t")) {
        fail(ctx, "the --binary and --text options are meaningless when verifying checksums");
        ctx.stderr.write("Try 'sha256sum --help' for more information.\n");
        return 1;
      }
      const checkOpts: CheckOptions = {
        quiet: flags.has("quiet"),
        status: flags.has("status"),
        strict: flags.has("strict"),
        warn: flags.has("w"),
        ignoreMissing: flags.has("ignore-missing"),
      };
      let ok = true;
      for (const file of files) ok = (await checkFile(ctx, file, checkOpts)) && ok;
      return ok ? 0 : 1;
    }

    for (const flag of ["quiet", "status", "strict", "w", "ignore-missing"]) {
      if (flags.has(flag)) {
        const long = flag === "w" ? "warn" : flag;
        fail(ctx, `the --${long} option is meaningful only when verifying checksums`);
        ctx.stderr.write("Try 'sha256sum --help' for more information.\n");
        return 1;
      }
    }

    const marker = flags.has("b") ? "*" : " ";
    let code = 0;
    for (const file of files) {
      const read = readOperand(ctx, file);
      if (!read.ok) {
        code = fail(ctx, `${file}: ${read.error.message}`);
        continue;
      }
      const hex = await sha256Hex(contentBytes(read.content));
      const out = shown(file);
      ctx.stdout.write(`${out.prefix}${hex} ${marker}${out.name}\n`);
    }
    return code;
  },
};
