// T-707 (Stage 7 gate): every lab-step command, replayed in the in-browser
// terminal, prints exactly what a real build-lab.sh run on Ubuntu printed.
//
// tests/fixtures/lab/ holds stdout, stderr and exit status per command, from
// scripts/capture-lab-fixtures.sh (one bash session on a fresh build, GNU
// coreutils/grep/sed/gawk, LC_ALL=C, TZ=UTC, mtimes = LAB_MTIME, owner
// `root root`, home /root; Lab B with fixed installer bytes and victim). The
// `lab-fixtures` CI job re-captures them on ubuntu-latest and fails on any
// difference, so this test does not need GNU tools on the machine running it.
//
// Lab D (nmap, ss) is not in the browser lab and depends on the machine, so it
// has no fixtures.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { checkLabB, checkLabC } from "../../app/lib/terminal/checks";
import { Shell } from "../../app/lib/terminal/runner";
import { LAB_MTIME, LAB_SEED, seedLab } from "../../app/lib/terminal/seedLab";
import { browserLabStep, LAB_STEPS } from "../../shared/lab";

const DIR = "tests/fixtures/lab";
const CAPTURE = readFileSync("scripts/capture-lab-fixtures.sh", "utf8");
const EXAM = readFileSync("content/source/secplus-701-mock-exam.md", "utf8");
const ANSWER_FILE_CMD = /^cat ~\/secplus-lab\/\.answer-lab-b\b/;

/** Part 6 answers for the `???` placeholders in Lab C. */
const LAB_C_FIXES: [string, string][] = [
  ["chmod ??? etc/shadow", "chmod 640 etc/shadow"],
  ["chmod ??? home/deploy/.ssh/id_rsa", "chmod 600 home/deploy/.ssh/id_rsa"],
  ["PermitRootLogin ??/", "PermitRootLogin no/"],
];

/** A step's command lines as typed: no blanks or comment-only lines, answers filled in. */
function typed(commands: string | undefined): string[] {
  return (commands ?? "")
    .split("\n")
    .filter((l) => l.trim() !== "" && !l.trim().startsWith("#"))
    .map((l) => LAB_C_FIXES.reduce((acc, [from, to]) => acc.replace(from, to), l));
}

const STEP_IDS = ["lab-a", "lab-b", "lab-c"];
const steps = STEP_IDS.map((id) => LAB_STEPS.find((s) => s.id === id)!);

const fixture = (name: string) => readFileSync(join(DIR, name), "utf8");
const COMMANDS = fixture("commands.txt").split("\n").slice(0, -1);

interface Captured {
  line: string;
  stdout: string;
  stderr: string;
  code: number;
}

const CAPTURED: Captured[] = COMMANDS.map((line, i) => {
  const n = String(i + 1).padStart(2, "0");
  return {
    line,
    stdout: fixture(`${n}.stdout`),
    stderr: fixture(`${n}.stderr`),
    code: Number(fixture(`${n}.status`).trim()),
  };
});

const byLine = (line: string) => {
  const c = CAPTURED.find((x) => x.line === line);
  if (!c) throw new Error(`no fixture for ${line}`);
  return c;
};

/** The capture script's constants, so the test seeds the same lab. */
function captureConst(name: string): string {
  const m = new RegExp(`^${name}=(\\S+)`, "m").exec(CAPTURE);
  if (!m) throw new Error(`no ${name} in capture-lab-fixtures.sh`);
  return m[1]!;
}
const VICTIM = captureConst("VICTIM");

/** seedLab() with the capture's Lab B: installer k is 2 MiB of byte k, fixed victim. */
async function fixtureLab() {
  let k = 0;
  return seedLab({
    randomBytes: (buf) => {
      k++;
      buf.fill(k);
    },
    pickVictim: () => VICTIM,
  });
}

describe("lab fixtures (captured from a real build-lab.sh run)", () => {
  it("cover every Lab A–C command in shared/lab.ts, in order", () => {
    expect(COMMANDS).toEqual(steps.flatMap((s) => typed(s.commands)));
    // Every line the browser lab shows is replayed below.
    for (const step of steps) {
      for (const line of typed(browserLabStep(step).commands)) expect(COMMANDS).toContain(line);
    }
  });

  it("were captured with the seed's mtime, installers and a real victim", () => {
    expect(Number(captureConst("LAB_MTIME_S")) * 1000).toBe(LAB_MTIME);
    expect(LAB_SEED.installers.names).toContain(VICTIM);
    expect(LAB_SEED.installers.names).toHaveLength(4);
    expect(fixture("build.stdout")).toBe("Lab ready in /root/secplus-lab\n");
  });

  it("the in-browser terminal prints the same stdout, stderr and status for every command", async () => {
    const { vfs, tamperedFile } = await fixtureLab();
    const sh = new Shell({ vfs });
    const browserLines = new Set(steps.flatMap((s) => typed(browserLabStep(s).commands)));
    for (const want of CAPTURED) {
      if (ANSWER_FILE_CMD.test(want.line)) {
        // Download-only: the browser lab has no answer file (seedLab.ts).
        expect(browserLines.has(want.line)).toBe(false);
        expect(want).toMatchObject({ stdout: `${tamperedFile}\n`, stderr: "", code: 0 });
        continue;
      }
      const r = await sh.run(want.line);
      expect({ line: want.line, stdout: r.stdout, stderr: r.stderr, code: r.code }).toEqual(want);
    }
  });
});

describe("Labs A–C give the Part 6 answers (Stage 7 gate)", () => {
  const part6 = (() => {
    const start = EXAM.indexOf("## Part 5 hands-on lab answers");
    return EXAM.slice(start, EXAM.indexOf("\n## ", start + 1));
  })();

  it("Lab A: 185.220.101.47, backup, 50", () => {
    const m =
      /Lab A: attacker \*\*([\d.]+)\*\*, compromised account \*\*(\w+)\*\*, \*\*(\d+)\*\*/.exec(
        part6,
      );
    expect(m?.slice(1)).toEqual(["185.220.101.47", "backup", "50"]);
    const [, ip, account, failures] = m!;
    const top = byLine(
      "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr",
    ).stdout.split("\n")[0];
    expect(top).toBe(`     ${failures} ${ip}`);
    const accepted = byLine("grep 'Accepted' auth.log").stdout;
    expect(accepted).toContain(`Accepted password for ${account} from ${ip} `);
    expect(accepted.split("\n").filter((l) => l.includes(ip))).toHaveLength(1);
  });

  it("Lab B: sha256sum -c fails only the tampered file, and the answer file names it", async () => {
    expect(part6).toContain("cat ~/secplus-lab/.answer-lab-b");
    const check = byLine("sha256sum -c vendor_hashes.txt");
    expect(check.stdout.split("\n").filter((l) => l.endsWith(": FAILED"))).toEqual([
      `${VICTIM}: FAILED`,
    ]);
    expect(check.stderr).toBe("sha256sum: WARNING: 1 computed checksum did NOT match\n");
    expect(check.code).toBe(1);
    const answer = CAPTURED.find((c) => ANSWER_FILE_CMD.test(c.line))!.stdout;
    const { tamperedFile } = await fixtureLab();
    expect(checkLabB(answer, tamperedFile).ok).toBe(true);
  });

  it("Lab C: 640, 600, PermitRootLogin no, and the page's check passes", async () => {
    for (const fix of ["chmod 640 etc/shadow", "chmod 600 home/deploy/.ssh/id_rsa"]) {
      expect(part6).toContain(`\`${fix}\``);
    }
    expect(part6).toContain("`PermitRootLogin no`");
    expect(byLine("stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa").stdout).toBe(
      "640 etc/shadow\n600 home/deploy/.ssh/id_rsa\n",
    );
    expect(byLine("grep '^PermitRootLogin' etc/ssh/sshd_config").stdout).toBe(
      "PermitRootLogin no\n",
    );

    const { vfs } = await fixtureLab();
    const sh = new Shell({ vfs });
    for (const line of COMMANDS.slice(COMMANDS.indexOf("cd ~/secplus-lab"))) await sh.run(line);
    expect((await checkLabC(vfs)).map((r) => [r.item, r.ok, r.current])).toEqual([
      ["shadow", true, "640"],
      ["idRsa", true, "600"],
      ["permitRootLogin", true, "no"],
    ]);
  });
});

// The GNU comparisons in terminal-seed, terminal-files and terminal-text skip
// where GNU tools are missing (macOS). On CI they must run, not skip.
const onCi = process.env.GITHUB_ACTIONS === "true" && process.platform === "linux";

describe.runIf(onCi)("CI has the GNU tools the real-tool comparisons need", () => {
  it.each([
    ["ls", "GNU coreutils"],
    ["grep", "GNU grep"],
    ["sed", "GNU sed"],
    ["awk", "GNU Awk"],
    ["sha256sum", "GNU coreutils"],
    ["shuf", "GNU coreutils"],
  ])("%s is %s", (cmd, needle) => {
    const r = spawnSync(cmd, ["--version"], { encoding: "utf8" });
    expect(r.stdout).toContain(needle);
  });
});
