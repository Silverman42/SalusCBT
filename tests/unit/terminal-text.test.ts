// T-704: grep, awk, cut, sort, uniq, wc, sed — GNU output on the lab's files.
//
// 1. Every text-processing command in the lab steps (shared/lab.ts) on the
//    seeded VFS, with Lab A's answers (LB-4) and Lab C's sed fix.
// 2. An independent oracle (plain JS over auth.log) for the Lab A pipelines.
// 3. Each tool's flags, edge cases and error messages.
// 4. Where GNU grep/sed/coreutils and awk exist (CI: ubuntu-latest), the lab
//    commands are also run for real on a build-lab.sh tree and compared.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Shell } from "../../app/lib/terminal/runner";
import { LAB_ROOT, seedLab } from "../../app/lib/terminal/seedLab";
import { Vfs } from "../../app/lib/terminal/vfs";
import { LAB_STEPS } from "../../shared/lab";

const SCRIPT = readFileSync("content/source/build-lab.sh", "utf8");

async function labShell(): Promise<Shell> {
  const { vfs } = await seedLab();
  return new Shell({ vfs });
}

function makeShell(files: Record<string, string | Uint8Array> = {}): Shell {
  const vfs = new Vfs({ home: "/home/student", owner: "student", group: "student", now: () => 0 });
  vfs.mkdir("/home/student/lab/dir", { parents: true });
  vfs.chdir("/home/student/lab");
  for (const [name, content] of Object.entries(files)) vfs.writeFile(name, content);
  return new Shell({ vfs });
}

const run = async (sh: Shell, line: string) => {
  const r = await sh.run(line);
  return { stdout: r.stdout, stderr: r.stderr, code: r.code };
};

// ------------------------------------------------------------------ lab steps

/** The commands of one lab step, with Lab C's `???` placeholders filled in. */
function stepCommands(id: string): string[] {
  const step = LAB_STEPS.find((s) => s.id === id)!;
  return step
    .commands!.split("\n")
    .map((l) => l.replace(/\s+#.*$/, "").trim())
    .filter((l) => l !== "" && !l.startsWith("#"))
    .map((l) =>
      l
        .replace("chmod ??? etc/shadow", "chmod 640 etc/shadow")
        .replace("chmod ??? home/deploy/.ssh/id_rsa", "chmod 600 home/deploy/.ssh/id_rsa")
        .replace("PermitRootLogin ??/", "PermitRootLogin no/"),
    );
}

const MINE = new Set(["cd", "grep", "awk", "cut", "sort", "uniq", "wc", "sed"]);
/** Lines whose every pipeline stage is one of this task's commands (or cd). */
const isTextCommand = (line: string) =>
  line.split(" | ").every((stage) => MINE.has(stage.trim().split(/\s+/)[0]!));

const AUTH_LOG = (() => {
  const lines = SCRIPT.split("\n");
  const start = lines.indexOf("cat > log/auth.log <<'EOF'");
  const end = lines.indexOf("EOF", start);
  return lines.slice(start + 1, end);
})();

/** `sort | uniq -c | sort -nr` done by hand (GNU format, C-locale ties). */
function countSorted(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts]
    .map(([v, n]) => `${String(n).padStart(7)} ${v}`)
    .sort((a, b) => {
      const d = Number(b.trim().split(" ")[0]) - Number(a.trim().split(" ")[0]);
      return d !== 0 ? d : a < b ? 1 : a > b ? -1 : 0;
    })
    .map((l) => `${l}\n`)
    .join("");
}

const fields = (line: string) => line.trim().split(/[ \t]+/);

describe("Lab A (log): every command in the step", () => {
  it("gives the expected output and the Part 6 answers", async () => {
    const sh = await labShell();
    const cmds = stepCommands("lab-a").filter(isTextCommand);
    expect(cmds).toEqual([
      "cd ~/secplus-lab/log",
      "grep -c 'Failed password' auth.log",
      "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr",
      "grep 'Accepted' auth.log",
      "grep 'Invalid user' auth.log | awk '{print $8}' | sort | uniq -c | sort -nr",
    ]);
    const out: string[] = [];
    for (const c of cmds) {
      const r = await run(sh, c);
      expect(r, c).toMatchObject({ stderr: "", code: 0 });
      out.push(r.stdout);
    }
    const failed = AUTH_LOG.filter((l) => l.includes("Failed password"));
    expect(out[1]).toBe(`${failed.length}\n`);
    expect(out[2]).toBe("     50 185.220.101.47\n     12 45.155.205.233\n      2 102.89.34.12\n");
    expect(out[2]).toBe(countSorted(failed.map((l) => fields(l).at(-4)!)));
    expect(out[3]).toBe(
      AUTH_LOG.filter((l) => l.includes("Accepted"))
        .map((l) => `${l}\n`)
        .join(""),
    );
    expect(out[4]).toBe(
      countSorted(AUTH_LOG.filter((l) => l.includes("Invalid user")).map((l) => fields(l)[7]!)),
    );
    expect(out[4]).toBe(
      [
        "      9 ubuntu",
        "      9 test",
        "      9 oracle",
        "      9 admin",
        "      5 guest",
        "      2 user",
        "      2 postgres",
        "      1 pi",
        "",
      ].join("\n"),
    );

    // LB-4: attacker, compromised account, number of failures.
    const top = out[2]!.split("\n")[0]!.trim().split(" ");
    expect(top[1]).toBe("185.220.101.47");
    expect(top[0]).toBe("50");
    const accepted = out[3]!
      .split("\n")
      .filter((l) => l.includes("Accepted password") && l.includes(top[1]!));
    expect(accepted).toHaveLength(1);
    expect(accepted[0]!.match(/Accepted password for (\S+)/)![1]).toBe("backup");
  });

  it("answers the outro: grep '<IP>' | wc -l counts more than the failures", async () => {
    const sh = await labShell();
    await sh.run("cd ~/secplus-lab/log");
    const r = await run(sh, "grep '185.220.101.47' auth.log | wc -l");
    expect(r.stdout).toBe(`${AUTH_LOG.filter((l) => l.includes("185.220.101.47")).length}\n`);
    expect(Number(r.stdout)).toBeGreaterThan(50);
    expect((await run(sh, "grep -c 'Failed password.*185.220.101.47' auth.log")).stdout).toBe(
      "50\n",
    );
  });
});

describe("Lab C (permissions): the grep and sed commands", () => {
  it("finds the settings, fixes PermitRootLogin in place and verifies it", async () => {
    const sh = await labShell();
    const cmds = stepCommands("lab-c").filter(isTextCommand);
    expect(cmds).toEqual([
      "cd ~/secplus-lab",
      "grep -n 'PermitRootLogin\\|PasswordAuthentication' etc/ssh/sshd_config",
      "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' etc/ssh/sshd_config",
      "grep '^PermitRootLogin' etc/ssh/sshd_config",
    ]);
    const before = sh.vfs.readText(`${LAB_ROOT}/etc/ssh/sshd_config`);
    const mode = sh.vfs.stat(`${LAB_ROOT}/etc/ssh/sshd_config`).mode;
    const out: string[] = [];
    for (const c of cmds) {
      const r = await run(sh, c);
      expect(r, c).toMatchObject({ stderr: "", code: 0 });
      out.push(r.stdout);
    }
    expect(out[1]).toBe("9:PermitRootLogin yes\n12:PasswordAuthentication yes\n");
    expect(out[2]).toBe("");
    expect(out[3]).toBe("PermitRootLogin no\n");
    const after = sh.vfs.readText(`${LAB_ROOT}/etc/ssh/sshd_config`);
    expect(after).toBe(before.replace("\nPermitRootLogin yes\n", "\nPermitRootLogin no\n"));
    expect(after.split("\n")).toContain("PermitRootLogin no");
    expect(sh.vfs.stat(`${LAB_ROOT}/etc/ssh/sshd_config`).mode).toBe(mode);
  });

  it("the cheat sheet's cut example works on auth.log", async () => {
    const sh = await labShell();
    await sh.run("cd ~/secplus-lab/log");
    const r = await run(sh, "cut -d ' ' -f 1 auth.log | uniq -c");
    expect(r.stdout).toBe("    130 Nov\n");
  });
});

// ------------------------------------------------------------------ grep

describe("grep", () => {
  const files = {
    "a.txt": "Root login\nroot shell\nuser one\nrooted\n",
    "b.txt": "nothing\nroot\n",
  };

  it("supports -c -i -n -v -o and combinations", async () => {
    const sh = makeShell(files);
    expect((await run(sh, "grep root a.txt")).stdout).toBe("root shell\nrooted\n");
    expect((await run(sh, "grep -i root a.txt")).stdout).toBe("Root login\nroot shell\nrooted\n");
    expect((await run(sh, "grep -c root a.txt")).stdout).toBe("2\n");
    expect((await run(sh, "grep -n root a.txt")).stdout).toBe("2:root shell\n4:rooted\n");
    expect((await run(sh, "grep -v root a.txt")).stdout).toBe("Root login\nuser one\n");
    expect((await run(sh, "grep -vc root a.txt")).stdout).toBe("2\n");
    expect((await run(sh, "grep -o 'ro*t' a.txt")).stdout).toBe("root\nroot\n");
    expect((await run(sh, "grep -on 'o' a.txt")).stdout).toBe(
      "1:o\n1:o\n1:o\n2:o\n2:o\n3:o\n4:o\n4:o\n",
    );
    expect((await run(sh, "grep -inw ROOT a.txt")).stdout).toBe("1:Root login\n2:root shell\n");
    expect((await run(sh, "grep -x root b.txt")).stdout).toBe("root\n");
  });

  it("prefixes file names for several files (-h/-H), counts per file, -l lists", async () => {
    const sh = makeShell(files);
    expect((await run(sh, "grep -n root a.txt b.txt")).stdout).toBe(
      "a.txt:2:root shell\na.txt:4:rooted\nb.txt:2:root\n",
    );
    expect((await run(sh, "grep -c root a.txt b.txt")).stdout).toBe("a.txt:2\nb.txt:1\n");
    expect((await run(sh, "grep -h root a.txt b.txt")).stdout).toBe("root shell\nrooted\nroot\n");
    expect((await run(sh, "grep -H root b.txt")).stdout).toBe("b.txt:root\n");
    expect((await run(sh, "grep -l user a.txt b.txt")).stdout).toBe("a.txt\n");
    expect((await run(sh, "grep -H user < a.txt")).stdout).toBe("(standard input):user one\n");
  });

  it("uses BRE by default, ERE with -E and fixed strings with -F", async () => {
    const sh = makeShell({ "t.txt": "a+b\naab\na|b\nab\n" });
    expect((await run(sh, "grep 'a+b' t.txt")).stdout).toBe("a+b\n");
    expect((await run(sh, "grep -E 'a+b' t.txt")).stdout).toBe("aab\nab\n");
    expect((await run(sh, "grep 'a|b' t.txt")).stdout).toBe("a|b\n");
    expect((await run(sh, "grep -c 'a\\|b' t.txt")).stdout).toBe("4\n");
    expect((await run(sh, "grep -F 'a|b' t.txt")).stdout).toBe("a|b\n");
    expect((await run(sh, "grep -F -o '+' t.txt")).stdout).toBe("+\n");
    expect((await run(sh, "grep -e aab -e 'a|b' t.txt")).stdout).toBe("aab\na|b\n");
  });

  it("exit status: 0 selected, 1 none, 2 error; -q and -s", async () => {
    const sh = makeShell(files);
    expect(await run(sh, "grep zzz a.txt")).toEqual({ stdout: "", stderr: "", code: 1 });
    expect(await run(sh, "grep root nope a.txt")).toEqual({
      stdout: "a.txt:root shell\na.txt:rooted\n",
      stderr: "grep: nope: No such file or directory\n",
      code: 2,
    });
    expect(await run(sh, "grep -s root nope")).toEqual({ stdout: "", stderr: "", code: 2 });
    expect(await run(sh, "grep -q root a.txt")).toEqual({ stdout: "", stderr: "", code: 0 });
    expect(await run(sh, "grep root dir")).toEqual({
      stdout: "",
      stderr: "grep: dir: Is a directory\n",
      code: 2,
    });
    expect(await run(sh, "grep")).toEqual({
      stdout: "",
      stderr:
        "Usage: grep [OPTION]... PATTERNS [FILE]...\nTry 'grep --help' for more information.\n",
      code: 2,
    });
  });

  it("prints regex errors and GNU 3.11 warnings", async () => {
    const sh = makeShell(files);
    expect(await run(sh, "grep '[a' a.txt")).toEqual({
      stdout: "",
      stderr: "grep: Unmatched [, [^, [:, [., or [=\n",
      code: 2,
    });
    expect((await run(sh, "grep '[:alpha:]' a.txt")).stderr).toBe(
      "grep: character class syntax is [[:alpha:]], not [:alpha:]\n",
    );
    expect(await run(sh, "grep '\\d' b.txt")).toEqual({
      stdout: "",
      stderr: "grep: warning: stray \\ before d\n",
      code: 1,
    });
    expect((await run(sh, "grep '\\(r\\)\\1' a.txt")).stderr).toBe(
      "grep: back-references are not available in this lab\n",
    );
  });

  it("reports binary files instead of printing them", async () => {
    const sh = makeShell({ "bin.exe": new Uint8Array([0, 1, 104, 105, 10, 255, 0]) });
    expect(await run(sh, "grep hi bin.exe")).toEqual({
      stdout: "",
      stderr: "grep: bin.exe: binary file matches\n",
      code: 0,
    });
    expect((await run(sh, "grep -c hi bin.exe")).stdout).toBe("1\n");
  });

  it("refuses options the lab leaves out", async () => {
    const sh = makeShell(files);
    expect(await run(sh, "grep -r root .")).toEqual({
      stdout: "",
      stderr: "grep: option '-r' is not available in this lab\n",
      code: 2,
    });
    expect((await run(sh, "grep -P x a.txt")).code).toBe(2);
  });

  it("stops a pathological search with a clear message", async () => {
    const sh = makeShell({ "long.txt": "a".repeat(20_000) + "\n" });
    const t0 = performance.now();
    const r = await run(sh, "grep -oE 'a|a.*b' long.txt | wc -l");
    expect(performance.now() - t0).toBeLessThan(10_000);
    expect(r.stderr).toBe("grep: regular expression too complex for the lab\n");
  }, 20_000);
});

// ------------------------------------------------------------------ awk

describe("awk", () => {
  const sh = () =>
    makeShell({
      "auth.txt":
        "Nov  3 02:13:02 web01 sshd[1880]: Failed password for root from 185.220.101.47 port 48743 ssh2\n",
      passwd:
        "root:x:0:0:root:/root:/bin/bash\nadaeze:x:1002:1002:Adaeze O.:/home/adaeze:/bin/bash\n",
      "nums.txt": "3 4\n10 2\n",
    });

  it("prints fields: $N, $NF, $(NF-k), $0 and lists", async () => {
    const s = sh();
    expect((await run(s, "awk '{print $(NF-3)}' auth.txt")).stdout).toBe("185.220.101.47\n");
    expect((await run(s, "awk '{print $NF}' auth.txt")).stdout).toBe("ssh2\n");
    expect((await run(s, "awk '{print $1, $2}' auth.txt")).stdout).toBe("Nov 3\n");
    expect((await run(s, "awk '{print $1 $2}' auth.txt")).stdout).toBe("Nov3\n");
    expect((await run(s, "awk '{print $20}' auth.txt")).stdout).toBe("\n");
    expect((await run(s, "awk '{print}' nums.txt")).stdout).toBe("3 4\n10 2\n");
    expect((await run(s, "awk '{print NR \": \" $0}' nums.txt")).stdout).toBe("1: 3 4\n2: 10 2\n");
  });

  it("splits on -F (a char, a regex, \\t, t)", async () => {
    const s = sh();
    expect((await run(s, "awk -F: '{print $1, $5}' passwd")).stdout).toBe(
      "root root\nadaeze Adaeze O.\n",
    );
    expect((await run(s, "awk -F '[:/]' '{print $NF}' passwd")).stdout).toBe("bash\nbash\n");
    expect((await run(s, "echo 'a\tb c' | awk -F '\\t' '{print $2}'")).stdout).toBe("b c\n");
    expect((await run(s, "echo 'a\tb c' | awk -Ft '{print $2}'")).stdout).toBe("b c\n");
    expect((await run(s, "echo '  a   b  ' | awk '{print NF}'")).stdout).toBe("2\n");
    expect((await run(s, "awk 'BEGIN { FS = \":\" } { print $7 }' passwd")).stdout).toBe(
      "/bin/bash\n/bin/bash\n",
    );
  });

  it("supports patterns, BEGIN/END, variables and arithmetic", async () => {
    const s = sh();
    expect((await run(s, "awk -F: '$3 >= 1000 {print $1}' passwd")).stdout).toBe("adaeze\n");
    expect((await run(s, "awk '/sshd/' auth.txt passwd")).stdout).toBe(
      (await run(s, "grep sshd auth.txt")).stdout,
    );
    expect((await run(s, "awk '!/root/' passwd")).stdout).toBe(
      "adaeze:x:1002:1002:Adaeze O.:/home/adaeze:/bin/bash\n",
    );
    expect((await run(s, "awk '$1 ~ /^1/ {print $2}' nums.txt")).stdout).toBe("2\n");
    expect((await run(s, "awk '{s += $1} END {print s, s / NR}' nums.txt")).stdout).toBe(
      "13 6.5\n",
    );
    expect((await run(s, "awk 'END {print NR}' nums.txt")).stdout).toBe("2\n");
    expect((await run(s, "awk '{n++} END {print n}' nums.txt")).stdout).toBe("2\n");
    expect((await run(s, "awk '{print $1/$2, $1*$2, $1^$2, $1%$2, -2^2}' nums.txt")).stdout).toBe(
      "0.75 12 81 3 -4\n5 20 100 0 -4\n",
    );
    expect((await run(s, "awk 'BEGIN {print 1/3, 1e6, 100000 * 10, 0.1 + 0.2}'")).stdout).toBe(
      "0.333333 1000000 1000000 0.3\n",
    );
    expect((await run(s, "awk -v n=5 'BEGIN {print n * 2}'")).stdout).toBe("10\n");
    expect((await run(s, "awk 'NR == 2 {next} {print $1}' nums.txt")).stdout).toBe("3\n");
    expect(
      (await run(s, 'awk \'{ if ($1 > 5) print "big"; else print "small" }\' nums.txt')).stdout,
    ).toBe("small\nbig\n");
  });

  it("compares numbers as numbers and strings as strings", async () => {
    const s = sh();
    // Fields are strnum: 10 > 9 numerically. String constants compare as strings.
    expect((await run(s, "echo '10 9' | awk '{print ($1 > $2), (\"10\" > \"9\")}'")).stdout).toBe(
      "1 0\n",
    );
    expect((await run(s, "echo 'abc 9' | awk '{print ($1 > $2)}'")).stdout).toBe("1\n");
  });

  it("assigns fields and NF, and has printf and string functions", async () => {
    const s = sh();
    expect((await run(s, "echo 'a b c' | awk '{$2 = \"X\"; print; print NF}'")).stdout).toBe(
      "a X c\n3\n",
    );
    expect((await run(s, "echo 'a b c' | awk '{NF = 2; print}'")).stdout).toBe("a b\n");
    expect((await run(s, "echo 'a b c' | awk -v OFS=- '{$1 = $1; print}'")).stdout).toBe("a-b-c\n");
    expect(
      (
        await run(
          s,
          'awk \'BEGIN {printf "%5.2f|%-4d|%x|%s|%c|%e|%g|%05d\\n", 0.75, 4, 255, "s", 65, 1234.5, 0.0001, -42}\'',
        )
      ).stdout,
    ).toBe(" 0.75|4   |ff|s|A|1.234500e+03|0.0001|-0042\n");
    expect(
      (
        await run(
          s,
          "echo 'Hello World' | awk '{print length, length($1), substr($0, 7), index($0, \"o\"), toupper($1), tolower($2), int(3.9)}'",
        )
      ).stdout,
    ).toBe("11 5 World 5 HELLO world 3\n");
  });

  it("exit runs END and sets the status", async () => {
    const s = sh();
    expect(await run(s, "awk 'BEGIN { exit 3 } END { print \"end\" }'")).toEqual({
      stdout: "end\n",
      stderr: "",
      code: 3,
    });
  });

  it("prints gawk-style errors", async () => {
    const s = sh();
    expect(await run(s, "awk '{print $(NF-30)}' passwd")).toEqual({
      stdout: "",
      stderr: "awk: cmd. line:1: (FILENAME=passwd FNR=1) fatal: attempt to access field -29\n",
      code: 2,
    });
    expect(await run(s, "awk '{print $1' passwd")).toEqual({
      stdout: "",
      stderr: "awk: cmd. line:1: {print $1\nawk: cmd. line:1:          ^ syntax error\n",
      code: 1,
    });
    expect((await run(s, "awk 'BEGIN {print 1/0}'")).stderr).toBe(
      "awk: cmd. line:1: fatal: division by zero attempted\n",
    );
    expect((await run(s, "awk '{print}' nope")).stderr).toBe(
      "awk: cmd. line:1: fatal: cannot open file `nope' for reading: No such file or directory\n",
    );
  });

  it("refuses what the lab leaves out (no loops, arrays, system, redirection)", async () => {
    const s = sh();
    const cases: [string, string][] = [
      ["awk '{for (i = 0; i < 9; i++) print}' nums.txt", "the 'for' loop"],
      ["awk '{while (1) print}' nums.txt", "the 'while' loop"],
      ["awk '{a[$1]++}' nums.txt", "an array (a[k])"],
      ["awk 'BEGIN {system(\"ls\")}'", "the system() function"],
      ["awk '{print > \"out\"}' nums.txt", "output redirection (> file)"],
      ["awk '{print | \"sh\"}' nums.txt", "a pipe to a command (| cmd)"],
      ["awk '{getline}' nums.txt", "getline"],
      ["awk 'function f() {}'", "a user-defined function"],
      ["awk -f prog.awk", "option '-f' (program files)"],
    ];
    for (const [line, feature] of cases) {
      expect(await run(s, line), line).toEqual({
        stdout: "",
        stderr: `awk: ${feature} is not available in this lab\n`,
        code: 2,
      });
    }
    expect(s.vfs.exists("out")).toBe(false);
  });

  it("caps runaway string growth", async () => {
    const s = makeShell({ "many.txt": "x\n".repeat(40) });
    const r = await run(s, "awk '{s = s s \"ab\"} END {print length(s)}' many.txt");
    expect(r.code).toBe(2);
    expect(r.stderr).toMatch(/fatal: string too long for the lab/);
  });
});

// ------------------------------------------------------------------ sort / uniq

describe("sort", () => {
  const data = "b\na\nB\n10\n9\n";

  it("sorts bytewise, -n numerically, -r, -f, -u", async () => {
    const sh = makeShell({ "d.txt": data, "dup.txt": "b\na\nb\na\n" });
    expect((await run(sh, "sort d.txt")).stdout).toBe("10\n9\nB\na\nb\n");
    expect((await run(sh, "sort -n d.txt")).stdout).toBe("B\na\nb\n9\n10\n");
    expect((await run(sh, "sort -nr d.txt")).stdout).toBe("10\n9\nb\na\nB\n");
    expect((await run(sh, "sort -rn d.txt")).stdout).toBe("10\n9\nb\na\nB\n");
    expect((await run(sh, "sort -f d.txt")).stdout).toBe("10\n9\na\nB\nb\n");
    expect((await run(sh, "sort -u dup.txt")).stdout).toBe("a\nb\n");
    expect((await run(sh, "sort -r dup.txt")).stdout).toBe("b\nb\na\na\n");
  });

  it("sorts by key with -k and -t", async () => {
    const sh = makeShell({
      "p.txt": "root:x:0\ndeploy:x:1001\nsshd:x:110\nadaeze:x:1002\n",
      "c.txt": "      9 test\n     12 b\n      9 admin\n     50 a\n",
    });
    expect((await run(sh, "sort -t: -k3 -n p.txt")).stdout).toBe(
      "root:x:0\nsshd:x:110\ndeploy:x:1001\nadaeze:x:1002\n",
    );
    expect((await run(sh, "sort -t: -k3,3nr p.txt")).stdout).toBe(
      "adaeze:x:1002\ndeploy:x:1001\nsshd:x:110\nroot:x:0\n",
    );
    expect((await run(sh, "sort -k2 c.txt")).stdout).toBe(
      "     50 a\n      9 admin\n     12 b\n      9 test\n",
    );
    expect((await run(sh, "sort -k1,1n -k2,2r c.txt")).stdout).toBe(
      "      9 test\n      9 admin\n     12 b\n     50 a\n",
    );
  });

  it("adds a missing final newline and prints coreutils errors", async () => {
    const sh = makeShell({ "x.txt": "b\na" });
    expect((await run(sh, "sort x.txt")).stdout).toBe("a\nb\n");
    expect(await run(sh, "sort nope")).toEqual({
      stdout: "",
      stderr: "sort: cannot read: nope: No such file or directory\n",
      code: 2,
    });
    expect((await run(sh, "sort -k 0 x.txt")).stderr).toBe(
      "sort: field number is zero: invalid field specification '0'\n",
    );
    expect((await run(sh, "sort -t ab x.txt")).stderr).toBe("sort: multi-character tab 'ab'\n");
    expect((await run(sh, "sort -R x.txt")).stderr).toBe(
      "sort: option '-R' is not available in this lab\n",
    );
  });
});

describe("uniq", () => {
  const data = "a\na\nb\nc\nc\nc\na\n";

  it("collapses adjacent lines; -c pads counts to 7; -d, -u, -i", async () => {
    const sh = makeShell({ "d.txt": data, "i.txt": "A\na\nb\n" });
    expect((await run(sh, "uniq d.txt")).stdout).toBe("a\nb\nc\na\n");
    expect((await run(sh, "uniq -c d.txt")).stdout).toBe(
      "      2 a\n      1 b\n      3 c\n      1 a\n",
    );
    expect((await run(sh, "uniq -d d.txt")).stdout).toBe("a\nc\n");
    expect((await run(sh, "uniq -u d.txt")).stdout).toBe("b\na\n");
    expect((await run(sh, "uniq -cd d.txt")).stdout).toBe("      2 a\n      3 c\n");
    expect((await run(sh, "uniq -i i.txt")).stdout).toBe("A\nb\n");
    expect((await run(sh, "sort d.txt | uniq -c")).stdout).toBe(
      "      3 a\n      1 b\n      3 c\n",
    );
  });

  it("skips fields and characters, writes an output operand, reports errors", async () => {
    const sh = makeShell({ "f.txt": "1 x\n2 x\n3 y\n" });
    expect((await run(sh, "uniq -f 1 f.txt")).stdout).toBe("1 x\n3 y\n");
    expect((await run(sh, "uniq -s 2 f.txt")).stdout).toBe("1 x\n3 y\n");
    expect((await run(sh, "uniq -w 1 f.txt")).stdout).toBe("1 x\n2 x\n3 y\n");
    expect(await run(sh, "uniq f.txt out.txt")).toEqual({ stdout: "", stderr: "", code: 0 });
    expect(sh.vfs.readText("out.txt")).toBe("1 x\n2 x\n3 y\n");
    expect((await run(sh, "uniq nope")).stderr).toBe("uniq: nope: No such file or directory\n");
    expect((await run(sh, "uniq a b c")).stderr).toBe(
      "uniq: extra operand 'c'\nTry 'uniq --help' for more information.\n",
    );
  });
});

// ------------------------------------------------------------------ wc / cut

describe("wc", () => {
  it("prints one bare number for one input and one count", async () => {
    const sh = makeShell({ "a.txt": "one two\nthree\n" });
    expect((await run(sh, "wc -l a.txt")).stdout).toBe("2 a.txt\n");
    expect((await run(sh, "wc -l < a.txt")).stdout).toBe("2\n");
    expect((await run(sh, "wc -w < a.txt")).stdout).toBe("3\n");
    expect((await run(sh, "wc -c a.txt")).stdout).toBe("14 a.txt\n");
  });

  it("pads columns like GNU: file sizes, or 7 for stdin", async () => {
    const sh = makeShell({ "a.txt": "one two\nthree\n", "b.txt": "x\n" });
    expect((await run(sh, "wc a.txt")).stdout).toBe(" 2  3 14 a.txt\n");
    expect((await run(sh, "grep -v zzz a.txt | wc")).stdout).toBe("      2       3      14\n");
    expect((await run(sh, "wc -l a.txt b.txt")).stdout).toBe(" 2 a.txt\n 1 b.txt\n 3 total\n");
    expect((await run(sh, "echo -n 'a b' | wc")).stdout).toBe("      0       2       3\n");
    expect((await run(sh, "echo 'héllo' | wc -m -c")).stdout).toBe("      6       7\n");
  });

  it("reports missing files and directories", async () => {
    const sh = makeShell({ "a.txt": "x\n" });
    expect(await run(sh, "wc -l nope a.txt")).toEqual({
      stdout: "1 a.txt\n1 total\n",
      stderr: "wc: nope: No such file or directory\n",
      code: 1,
    });
    expect(await run(sh, "wc dir")).toEqual({
      stdout: "      0       0       0 dir\n",
      stderr: "wc: dir: Is a directory\n",
      code: 1,
    });
  });
});

describe("cut", () => {
  it("cuts fields with -d/-f (default tab) and characters with -c", async () => {
    const sh = makeShell({
      "p.txt": "root:x:0:0:root:/root:/bin/bash\nnodelim\n",
      "t.txt": "a\tb\tc\n",
      "s.txt": "Nov  3 01:48:56 web01\n",
    });
    expect((await run(sh, "cut -d: -f1,7 p.txt")).stdout).toBe("root:/bin/bash\nnodelim\n");
    expect((await run(sh, "cut -d: -f 3- p.txt")).stdout).toBe(
      "0:0:root:/root:/bin/bash\nnodelim\n",
    );
    expect((await run(sh, "cut -d: -f-2 -s p.txt")).stdout).toBe("root:x\n");
    expect((await run(sh, "cut -f2 t.txt")).stdout).toBe("b\n");
    expect((await run(sh, "cut -d ' ' -f 3 s.txt")).stdout).toBe("3\n");
    expect((await run(sh, "cut -d ' ' -f 2 s.txt")).stdout).toBe("\n");
    expect((await run(sh, "cut -c 1-3,5 s.txt")).stdout).toBe("Nov \n");
    expect((await run(sh, "cut -d: -f1,2 --output-delimiter=' ' p.txt")).stdout).toBe(
      "root x\nnodelim\n",
    );
    expect((await run(sh, "cut -d: --complement -f1-6 p.txt")).stdout).toBe("/bin/bash\nnodelim\n");
  });

  it("prints coreutils errors", async () => {
    const sh = makeShell({ "p.txt": "a\n" });
    const tryLine = "Try 'cut --help' for more information.\n";
    expect((await run(sh, "cut p.txt")).stderr).toBe(
      `cut: you must specify a list of bytes, characters, or fields\n${tryLine}`,
    );
    expect((await run(sh, "cut -f 0 p.txt")).stderr).toBe(
      `cut: fields are numbered from 1\n${tryLine}`,
    );
    expect((await run(sh, "cut -f 3-1 p.txt")).stderr).toBe(
      `cut: invalid decreasing range\n${tryLine}`,
    );
    expect((await run(sh, "cut -d ab -f 1 p.txt")).stderr).toBe(
      `cut: the delimiter must be a single character\n${tryLine}`,
    );
    expect((await run(sh, "cut -f 1 nope")).stderr).toBe("cut: nope: No such file or directory\n");
  });
});

// ------------------------------------------------------------------ sed

describe("sed", () => {
  const conf = "Port 22\nPermitRootLogin yes\nPasswordAuthentication yes\n";

  it("substitutes: first match, g, Nth, &, groups, I, other delimiters", async () => {
    const sh = makeShell({ "c.txt": conf });
    expect((await run(sh, "sed 's/yes/no/' c.txt")).stdout).toBe(
      "Port 22\nPermitRootLogin no\nPasswordAuthentication no\n",
    );
    expect((await run(sh, "echo aaa | sed 's/a/b/'")).stdout).toBe("baa\n");
    expect((await run(sh, "echo aaa | sed 's/a/b/g'")).stdout).toBe("bbb\n");
    expect((await run(sh, "echo aaa | sed 's/a/b/2'")).stdout).toBe("aba\n");
    expect((await run(sh, "echo aaa | sed 's/a/b/2g'")).stdout).toBe("abb\n");
    expect((await run(sh, "echo abc | sed 's/b/[&]/'")).stdout).toBe("a[b]c\n");
    expect((await run(sh, "echo abc | sed 's/b/\\&/'")).stdout).toBe("a&c\n");
    expect(
      (await run(sh, "echo 'hello world' | sed 's/\\(hello\\) \\(world\\)/\\2 \\1/'")).stdout,
    ).toBe("world hello\n");
    expect((await run(sh, "echo 'hello world' | sed -E 's/(\\w+) (\\w+)/\\2 \\1/'")).stdout).toBe(
      "world hello\n",
    );
    expect((await run(sh, "echo HELLO | sed 's/hello/bye/I'")).stdout).toBe("bye\n");
    expect((await run(sh, "echo /etc/ssh | sed 's|/etc|/opt|'")).stdout).toBe("/opt/ssh\n");
    expect((await run(sh, "echo abc | sed 's/b*/-/g'")).stdout).toBe("-a-c-\n");
    expect((await run(sh, "echo abc | sed 's/x*/-/g'")).stdout).toBe("-a-b-c-\n");
    expect((await run(sh, "echo 'a b' | sed 's/ /\\n/'")).stdout).toBe("a\nb\n");
  });

  it("edits in place with -i, keeping the mode, with an optional backup suffix", async () => {
    const sh = makeShell({ "c.txt": conf });
    sh.vfs.chmod("c.txt", 0o600);
    expect(await run(sh, "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' c.txt")).toEqual({
      stdout: "",
      stderr: "",
      code: 0,
    });
    expect(sh.vfs.readText("c.txt")).toBe(
      "Port 22\nPermitRootLogin no\nPasswordAuthentication yes\n",
    );
    expect(sh.vfs.stat("c.txt").mode).toBe(0o600);
    await run(sh, "sed -i.bak 's/22/2222/' c.txt");
    expect(sh.vfs.readText("c.txt")).toMatch(/^Port 2222\n/);
    expect(sh.vfs.readText("c.txt.bak")).toMatch(/^Port 22\n/);
    // The anchor matters: only a line starting with the text changes.
    await run(sh, "sed -i 's/^yes/no/' c.txt");
    expect(sh.vfs.readText("c.txt")).toContain("PasswordAuthentication yes");
  });

  it("supports -n, p, d, q, =, addresses, ranges and !", async () => {
    const sh = makeShell({ "n.txt": "1\n2\n3\n4\n" });
    expect((await run(sh, "sed -n '2p' n.txt")).stdout).toBe("2\n");
    expect((await run(sh, "sed -n '$p' n.txt")).stdout).toBe("4\n");
    expect((await run(sh, "sed -n '2,3p' n.txt")).stdout).toBe("2\n3\n");
    expect((await run(sh, "sed -n '/2/,/3/p' n.txt")).stdout).toBe("2\n3\n");
    expect((await run(sh, "sed '2,3d' n.txt")).stdout).toBe("1\n4\n");
    expect((await run(sh, "sed '2!d' n.txt")).stdout).toBe("2\n");
    expect((await run(sh, "sed 2q n.txt")).stdout).toBe("1\n2\n");
    expect((await run(sh, "sed -n '$=' n.txt")).stdout).toBe("4\n");
    expect((await run(sh, "sed -n 's/3/three/p' n.txt")).stdout).toBe("three\n");
    expect((await run(sh, "sed -e 's/1/one/' -e 's/2/two/' n.txt")).stdout).toBe(
      "one\ntwo\n3\n4\n",
    );
    expect((await run(sh, "sed '1d;3d' n.txt")).stdout).toBe("2\n4\n");
  });

  it("keeps a missing final newline, like GNU", async () => {
    const sh = makeShell({ "x.txt": "a\nb" });
    expect((await run(sh, "sed 's/b/c/' x.txt")).stdout).toBe("a\nc");
    expect((await run(sh, "sed p x.txt")).stdout).toBe("a\na\nb\nb");
  });

  it("prints GNU errors and refuses the rest", async () => {
    const sh = makeShell({ "c.txt": conf });
    expect(await run(sh, "sed 's/a/b' c.txt")).toEqual({
      stdout: "",
      stderr: "sed: -e expression #1, char 5: unterminated `s' command\n",
      code: 1,
    });
    expect((await run(sh, "sed 's/a/b/z' c.txt")).stderr).toBe(
      "sed: -e expression #1, char 7: unknown option to `s'\n",
    );
    expect((await run(sh, "sed k c.txt")).stderr).toBe(
      "sed: -e expression #1, char 1: unknown command: `k'\n",
    );
    expect((await run(sh, "sed 's/a/\\1/' c.txt")).stderr).toMatch(
      /^sed: -e expression #1, char \d+: invalid reference \\1 on `s' command's RHS\n$/,
    );
    expect(await run(sh, "sed p nope c.txt")).toMatchObject({
      stderr: "sed: can't read nope: No such file or directory\n",
      code: 2,
    });
    expect((await run(sh, "sed -i s/a/b/")).stderr).toBe("sed: no input files\n");
    expect((await run(sh, "sed 'y/a/b/' c.txt")).stderr).toBe(
      "sed: the 'y' command is not available in this lab\n",
    );
    expect((await run(sh, "sed 's/a/b/w out' c.txt")).stderr).toBe(
      "sed: the 'w' option to 's' is not available in this lab\n",
    );
  });
});

describe("help lists the text commands", () => {
  it("has a summary for each", async () => {
    const sh = makeShell();
    const out = (await run(sh, "help")).stdout;
    for (const name of MINE) if (name !== "cd") expect(out).toContain(name);
  });
});

// ------------------------------------------------------------------ real GNU tools

function gnu(cmd: string, versionNeedle: string): boolean {
  const r = spawnSync("sh", ["-c", `${cmd} --version 2>&1`], { encoding: "utf8" });
  return r.status === 0 && r.stdout.includes(versionNeedle);
}

const haveGnu =
  gnu("grep", "GNU grep") &&
  gnu("sed", "GNU sed") &&
  gnu("sort", "GNU coreutils") &&
  gnu("uniq", "GNU coreutils") &&
  gnu("wc", "GNU coreutils") &&
  spawnSync("sh", ["-c", "command -v awk && command -v sha256sum && command -v shuf"], {
    stdio: "ignore",
  }).status === 0;

describe.skipIf(!haveGnu)("lab commands against GNU tools on a real build-lab.sh tree", () => {
  it("matches stdout and status byte for byte", async () => {
    const home = mkdtempSync(join(tmpdir(), "salus-text-"));
    try {
      const scriptPath = join(home, "build-lab.sh");
      writeFileSync(scriptPath, SCRIPT);
      const build = spawnSync("bash", [scriptPath], {
        env: { ...process.env, HOME: home },
        encoding: "utf8",
      });
      expect(build.status).toBe(0);

      const sh = await labShell();
      const lines = [...stepCommands("lab-a"), ...stepCommands("lab-c")].filter(isTextCommand);
      const extra = [
        "cd ~/secplus-lab/log",
        "grep '185.220.101.47' auth.log | wc -l",
        "grep -o 'from [0-9.]*' auth.log | sort | uniq -c | sort -nr",
        "cut -d ' ' -f 5 auth.log | cut -d '[' -f 1 | sort | uniq -c",
        "awk '{print $1, $NF}' auth.log | sort -u",
        "grep -iv 'session' auth.log | wc",
        "wc auth.log",
        "sed -n '/Accepted password/p' auth.log",
        "awk -F'for ' '/Failed/ {print $2}' auth.log | awk '{print $1}' | sort | uniq -c | sort -k1,1nr -k2",
      ];
      let script = "";
      for (const line of [...lines, ...extra]) {
        // Real shell: run each command and mark its output boundary.
        script += `${line}\necho "--- $?"\n`;
      }
      const real = spawnSync("bash", ["-c", script], {
        env: { ...process.env, HOME: home, LC_ALL: "C" },
        encoding: "utf8",
      });
      let ours = "";
      for (const line of [...lines, ...extra]) {
        const r = await sh.run(line);
        ours += `${r.stdout}--- ${r.code}\n`;
      }
      expect(ours).toBe(real.stdout);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 30_000);
});
