// T-702: terminal lab lexer, globbing, pipeline runner and builtins.

import { describe, expect, it } from "vitest";
import {
  CommandRegistry,
  parseOptions,
  readOperand,
  type CommandSpec,
} from "../../app/lib/terminal/command";
import { DEFAULT_COMMANDS } from "../../app/lib/terminal/commands";
import { activePattern, expandGlob, matchComponent } from "../../app/lib/terminal/glob";
import { parse, ShellSyntaxError, tokenize, type Word } from "../../app/lib/terminal/lexer";
import { Shell, type ShellLimits } from "../../app/lib/terminal/runner";
import { seedLab } from "../../app/lib/terminal/seedLab";
import { Vfs } from "../../app/lib/terminal/vfs";

// ---- helpers ---------------------------------------------------------------

/** Words of a one-command line, as plain strings (segments joined). */
function words(line: string): string[] {
  return tokenize(line).map((t) => {
    if (t.type !== "word") return `<${t.type === "op" ? t.op : `${t.fd}${t.op}`}>`;
    return t.word.map((s) => (s.kind === "text" ? s.text : `$${s.name}`)).join("");
  });
}

function syntaxError(line: string): string {
  try {
    parse(line);
  } catch (e) {
    if (e instanceof ShellSyntaxError) return e.message;
    throw e;
  }
  throw new Error(`no syntax error for ${line}`);
}

// Test-only commands, written against the same contract T-703/T-704 use.
const testCommands: CommandSpec[] = [
  {
    name: "tcat",
    summary: "cat for tests",
    run(ctx) {
      const files = ctx.args.length ? ctx.args : ["-"];
      let code = 0;
      for (const f of files) {
        const r = readOperand(ctx, f);
        if (r.ok) ctx.stdout.write(r.content);
        else {
          ctx.stderr.write(`tcat: ${f}: ${r.error.message}\n`);
          code = 1;
        }
      }
      return code;
    },
  },
  {
    name: "upper",
    summary: "uppercase stdin",
    run(ctx) {
      ctx.stdout.write(ctx.stdin.text().toUpperCase());
      return 0;
    },
  },
  {
    name: "lines",
    summary: "count stdin lines",
    run(ctx) {
      ctx.stdout.write(`${ctx.stdin.text().split("\n").length - 1}\n`);
      return 0;
    },
  },
  {
    name: "rev",
    summary: "reverse each line",
    run(ctx) {
      const out = ctx.stdin
        .text()
        .split("\n")
        .map((l) => [...l].reverse().join(""))
        .join("\n");
      ctx.stdout.write(out);
      return 0;
    },
  },
  {
    name: "args",
    summary: "print each argument in [brackets]",
    run(ctx) {
      ctx.stdout.write(ctx.args.map((a) => `[${a}]`).join("") + "\n");
      return 0;
    },
  },
  {
    name: "exit3",
    summary: "exit with status 3, writing to stderr",
    run(ctx) {
      ctx.stderr.write("exit3: oops\n");
      return 3;
    },
  },
  {
    name: "later",
    summary: "async command",
    async run(ctx) {
      await new Promise((r) => setTimeout(r, 1));
      ctx.stdout.write(`later:${ctx.stdin.text()}`);
      return 0;
    },
  },
  {
    name: "flood",
    summary: "write forever (until the limit stops it)",
    run(ctx) {
      for (;;) ctx.stdout.write("y\n".repeat(1024));
    },
  },
  {
    name: "boom",
    summary: "throws",
    run() {
      throw new Error("kaboom");
    },
  },
  {
    name: "opts",
    summary: "parseOptions demo",
    run(ctx) {
      const o = parseOptions(ctx, {
        flags: "nrv",
        values: "kF",
        numeric: "n",
        long: { lines: { key: "n", value: true }, reverse: { key: "r" } },
      });
      if (!o) return 2;
      ctx.stdout.write(
        JSON.stringify({
          flags: [...o.flags].sort(),
          values: Object.fromEntries(o.values),
          operands: o.operands,
        }) + "\n",
      );
      return 0;
    },
  },
];

function makeVfs(): Vfs {
  const vfs = new Vfs({ home: "/home/student", owner: "student", group: "student", now: () => 0 });
  vfs.mkdir("/home/student/lab/log", { parents: true });
  vfs.mkdir("/home/student/lab/etc/ssh", { parents: true });
  vfs.chdir("/home/student/lab");
  vfs.writeFile("log/auth.log", "one\ntwo\nthree\n");
  vfs.writeFile("log/syslog", "sys\n");
  vfs.writeFile("etc/passwd", "root:x:0:0\n");
  vfs.writeFile("etc/shadow", "root:*:1\n");
  vfs.writeFile("etc/ssh/sshd_config", "PermitRootLogin yes\n");
  vfs.writeFile("a.txt", "A\n");
  vfs.writeFile("b.txt", "B\n");
  vfs.writeFile("c1.md", "C\n");
  vfs.writeFile(".hidden", "secret\n");
  vfs.writeFile("my file.txt", "spaced\n");
  return vfs;
}

function makeShell(limits: Partial<ShellLimits> = {}): Shell {
  return new Shell({
    vfs: makeVfs(),
    commands: new CommandRegistry([...DEFAULT_COMMANDS, ...testCommands]),
    limits,
  });
}

// ---- lexer ---------------------------------------------------------------

describe("tokenize", () => {
  it("splits words on blanks and keeps quoted spaces", () => {
    expect(words("grep  'Failed password'\tauth.log")).toEqual([
      "grep",
      "Failed password",
      "auth.log",
    ]);
    expect(words('echo "a  b" c')).toEqual(["echo", "a  b", "c"]);
    expect(words("echo a'b'\"c\"d")).toEqual(["echo", "abcd"]);
    expect(words("echo '' \"\"")).toEqual(["echo", "", ""]);
  });

  it("keeps everything literal inside single quotes", () => {
    expect(words("awk '{print $(NF-3)}'")).toEqual(["awk", "{print $(NF-3)}"]);
    expect(words("grep -n 'PermitRootLogin\\|PasswordAuthentication' f")).toEqual([
      "grep",
      "-n",
      "PermitRootLogin\\|PasswordAuthentication",
      "f",
    ]);
    expect(words("echo 'a|b;c&&d>e #f'")).toEqual(["echo", "a|b;c&&d>e #f"]);
  });

  it("handles backslash escapes outside and inside double quotes", () => {
    expect(words("echo a\\ b \\| \\'x")).toEqual(["echo", "a b", "|", "'x"]);
    expect(words('echo "a\\"b" "c\\$d" "e\\nf" "g\\\\h"')).toEqual([
      "echo",
      'a"b',
      "c$d",
      "e\\nf",
      "g\\h",
    ]);
  });

  it("marks quoted text so globs and ~ stay literal", () => {
    const [, word] = tokenize("ls '*.txt'");
    expect(word).toEqual({ type: "word", word: [{ kind: "text", text: "*.txt", quoted: true }] });
  });

  it("reads $VAR, ${VAR} and $? as variables, in and out of double quotes", () => {
    const t = tokenize('echo $HOME "${USER}x" $? a$ $1x');
    const segs = t.map((x) => (x.type === "word" ? x.word : [])) as Word[];
    expect(segs[1]).toEqual([{ kind: "var", name: "HOME", quoted: false }]);
    expect(segs[2]).toEqual([
      { kind: "var", name: "USER", quoted: true },
      { kind: "text", text: "x", quoted: true },
    ]);
    expect(segs[3]).toEqual([{ kind: "var", name: "?", quoted: false }]);
    expect(segs[4]).toEqual([{ kind: "text", text: "a$", quoted: false }]);
    expect(segs[5]).toEqual([{ kind: "text", text: "$1x", quoted: false }]);
  });

  it("recognises operators with or without spaces", () => {
    expect(words("a|b||c&&d;e")).toEqual(["a", "<|>", "b", "<||>", "c", "<&&>", "d", "<;>", "e"]);
    expect(words("a>f 2>>g <h 2>&1 &>i")).toEqual([
      "a",
      "<1>>",
      "f",
      "<2>>>",
      "g",
      "<0<>",
      "h",
      "<2>&>",
      "1",
      "<1&>>",
      "i",
    ]);
    // `a2>f` is the word a2 then `>`; `2 >f` is the word 2 then `>`.
    expect(words("echo a2>f")).toEqual(["echo", "a2", "<1>>", "f"]);
    expect(words("echo 2 >f")).toEqual(["echo", "2", "<1>>", "f"]);
  });

  it("drops comments that start a word", () => {
    expect(words("cat ~/x    # check your answer")).toEqual(["cat", "~/x"]);
    expect(words("echo a#b '#c'")).toEqual(["echo", "a#b", "#c"]);
    expect(words("# only a comment")).toEqual([]);
  });

  it("rejects unterminated quotes with bash's wording", () => {
    expect(syntaxError("echo 'abc")).toBe("unexpected EOF while looking for matching `''");
    expect(syntaxError('echo "abc')).toBe("unexpected EOF while looking for matching `\"'");
  });

  it("rejects shell features the lab does not run", () => {
    expect(syntaxError("sleep 1 &")).toBe("background jobs (&) are not available in this lab");
    expect(syntaxError("echo $(whoami)")).toMatch(
      /command substitution .* not available in this lab/,
    );
    expect(syntaxError("echo `whoami`")).toMatch(/not available in this lab/);
    expect(syntaxError("(cd /)")).toMatch(/subshells .* not available in this lab/);
    expect(syntaxError("cat <<EOF")).toMatch(/here-documents .* not available/);
  });
});

describe("parse", () => {
  it("builds lists, and/or chains and pipelines", () => {
    const s = parse("a | b | c && d || e; f");
    expect(s.lists).toHaveLength(2);
    expect(s.lists[0]!.first.commands).toHaveLength(3);
    expect(s.lists[0]!.rest.map((r) => r.op)).toEqual(["&&", "||"]);
    expect(s.lists[1]!.first.commands).toHaveLength(1);
  });

  it("accepts empty lines, a trailing ; and comments", () => {
    expect(parse("").lists).toEqual([]);
    expect(parse("   ").lists).toEqual([]);
    expect(parse("echo hi;").lists).toHaveLength(1);
    expect(parse("# nothing").lists).toEqual([]);
  });

  it("collects redirections separately from words", () => {
    const [cmd] = parse("sort < in > out 2>/dev/null").lists[0]!.first.commands;
    expect(cmd!.words).toHaveLength(1);
    expect(cmd!.redirects.map((r) => `${r.fd}${r.op}`)).toEqual(["0<", "1>", "2>"]);
  });

  it("reports syntax errors like bash", () => {
    expect(syntaxError("| grep x")).toBe("syntax error near unexpected token `|'");
    expect(syntaxError("ls | | wc")).toBe("syntax error near unexpected token `|'");
    expect(syntaxError("ls ;; ls")).toBe("syntax error near unexpected token `;;'");
    expect(syntaxError("; ls")).toBe("syntax error near unexpected token `;'");
    expect(syntaxError("&& ls")).toBe("syntax error near unexpected token `&&'");
    expect(syntaxError("ls |")).toBe("syntax error: unexpected end of file");
    expect(syntaxError("ls &&")).toBe("syntax error: unexpected end of file");
    expect(syntaxError("echo >")).toBe("syntax error near unexpected token `newline'");
    expect(syntaxError("echo > | x")).toBe("syntax error near unexpected token `|'");
  });
});

// ---- globbing --------------------------------------------------------------

describe("glob", () => {
  const m = (pattern: string, name: string) => matchComponent(activePattern(pattern), name);

  it("matches *, ? and bracket expressions", () => {
    expect(m("*.exe", "agent-installer-v4.2.exe")).toBe(true);
    expect(m("*.exe", "vpn-client-3.1.msi")).toBe(false);
    expect(m("a?c", "abc")).toBe(true);
    expect(m("a?c", "ac")).toBe(false);
    expect(m("[ab]*", "b.txt")).toBe(true);
    expect(m("[!ab]*", "b.txt")).toBe(false);
    expect(m("[^ab]*", "c1.md")).toBe(true);
    expect(m("c[0-9].md", "c1.md")).toBe(true);
    expect(m("c[[:digit:]].md", "c1.md")).toBe(true);
    expect(m("[]]", "]")).toBe(true);
    expect(m("a[", "a[")).toBe(true); // unterminated [ is literal
    expect(m("*a*a*a*a*a*a*a*b", "a".repeat(200))).toBe(false); // no blow-up
  });

  it("does not match a leading dot unless the pattern has one", () => {
    expect(m("*", ".hidden")).toBe(false);
    expect(m(".*", ".hidden")).toBe(true);
    expect(m(".*", "..")).toBe(false);
  });

  it("expands against the VFS, sorted, keeping relative paths", () => {
    const vfs = makeVfs();
    expect(expandGlob(vfs, activePattern("*.txt"), 100)).toEqual(["a.txt", "b.txt", "my file.txt"]);
    expect(expandGlob(vfs, activePattern("log/*"), 100)).toEqual(["log/auth.log", "log/syslog"]);
    expect(expandGlob(vfs, activePattern("*/*/sshd_*"), 100)).toEqual(["etc/ssh/sshd_config"]);
    expect(expandGlob(vfs, activePattern("/home/student/lab/e*/p*"), 100)).toEqual([
      "/home/student/lab/etc/passwd",
    ]);
    expect(expandGlob(vfs, activePattern("*/"), 100)).toEqual(["etc/", "log/"]);
    expect(expandGlob(vfs, activePattern("../lab/?.txt"), 100)).toEqual([
      "../lab/a.txt",
      "../lab/b.txt",
    ]);
    expect(expandGlob(vfs, activePattern("*.nope"), 100)).toEqual([]);
  });

  it("caps the number of matches", () => {
    const vfs = makeVfs();
    for (let i = 0; i < 20; i++) vfs.writeFile(`f${i}`, "");
    expect(() => expandGlob(vfs, activePattern("f*"), 10)).toThrow(/too many matches/);
  });
});

// ---- runner ----------------------------------------------------------------

describe("Shell word expansion", () => {
  it("expands globs, leaves unmatched and quoted patterns alone", async () => {
    const sh = makeShell();
    expect((await sh.run("args *.txt")).stdout).toBe("[a.txt][b.txt][my file.txt]\n");
    expect((await sh.run("args '*.txt' \"*\".txt \\*.txt")).stdout).toBe("[*.txt][*.txt][*.txt]\n");
    expect((await sh.run("args *.nope")).stdout).toBe("[*.nope]\n");
    expect((await sh.run("args log/*.log")).stdout).toBe("[log/auth.log]\n");
  });

  it("expands ~ only when unquoted at the start", async () => {
    const sh = makeShell();
    expect((await sh.run("args ~ ~/lab '~' a~ ~\"/x\"")).stdout).toBe(
      "[/home/student][/home/student/lab][~][a~][~/x]\n",
    );
    expect((await sh.run("args ~/lab/*.md")).stdout).toBe("[/home/student/lab/c1.md]\n");
  });

  it("expands variables and $?", async () => {
    const sh = makeShell();
    expect((await sh.run('args $HOME "$USER" $PWD')).stdout).toBe(
      "[/home/student][student][/home/student/lab]\n",
    );
    // Unset unquoted → no word; quoted → empty word.
    expect((await sh.run('args $NOPE "$NOPE" x')).stdout).toBe("[][x]\n");
    expect((await sh.run("false; echo $?")).stdout).toBe("1\n");
    expect((await sh.run("echo $?")).stdout).toBe("0\n");
    expect((await sh.run("nope; echo $?")).stdout).toBe("127\n");
  });
});

describe("Shell pipelines and lists", () => {
  it("runs pipelines of three or more commands", async () => {
    const sh = makeShell();
    const r = await sh.run("tcat log/auth.log | upper | rev | lines");
    expect(r).toMatchObject({ stdout: "3\n", stderr: "", code: 0 });
    expect((await sh.run("tcat log/auth.log | upper | rev")).stdout).toBe("ENO\nOWT\nEERHT\n");
  });

  it("supports async commands anywhere in a pipeline", async () => {
    const sh = makeShell();
    expect((await sh.run("echo hi | later | upper")).stdout).toBe("LATER:HI\n");
  });

  it("gives terminal stdin as empty", async () => {
    const sh = makeShell();
    expect((await sh.run("lines")).stdout).toBe("0\n");
  });

  it("uses the last command's status for a pipeline", async () => {
    const sh = makeShell();
    expect((await sh.run("exit3 | true")).code).toBe(0);
    const r = await sh.run("true | exit3");
    expect(r.code).toBe(3);
    expect(r.stderr).toBe("exit3: oops\n");
  });

  it("short-circuits && and || and runs ; lists in order", async () => {
    const sh = makeShell();
    expect((await sh.run("true && echo a || echo b")).stdout).toBe("a\n");
    expect((await sh.run("false && echo a || echo b")).stdout).toBe("b\n");
    expect((await sh.run("false || false && echo no; echo yes")).stdout).toBe("yes\n");
    expect((await sh.run("echo 1; echo 2 ; echo 3")).stdout).toBe("1\n2\n3\n");
    expect((await sh.run("exit3 && echo no")).code).toBe(3);
  });

  it("keeps stdout and stderr in write order", async () => {
    const sh = makeShell();
    const r = await sh.run("echo a; exit3; echo b");
    expect(r.chunks).toEqual([
      { type: "text", stream: "stdout", text: "a\n" },
      { type: "text", stream: "stderr", text: "exit3: oops\n" },
      { type: "text", stream: "stdout", text: "b\n" },
    ]);
  });

  it("passes binary data through pipes untouched", async () => {
    const sh = makeShell();
    const bytes = new Uint8Array([0, 255, 128, 10, 1]);
    sh.vfs.writeFile("bin.dat", bytes);
    await sh.run("tcat bin.dat | tcat > copy.dat");
    expect(sh.vfs.readBytes("copy.dat")).toEqual(bytes);
  });
});

describe("Shell redirections", () => {
  it("writes, appends and reads files", async () => {
    const sh = makeShell();
    await sh.run("echo one > out.txt");
    await sh.run("echo two >> out.txt");
    expect(sh.vfs.readText("out.txt")).toBe("one\ntwo\n");
    expect((await sh.run("upper < out.txt")).stdout).toBe("ONE\nTWO\n");
    await sh.run("echo x > out.txt");
    expect(sh.vfs.readText("out.txt")).toBe("x\n");
  });

  it("truncates before the command runs, as bash does", async () => {
    const sh = makeShell();
    await sh.run("tcat a.txt > a.txt");
    expect(sh.vfs.readText("a.txt")).toBe("");
  });

  it("redirects stderr, dups 2>&1 and discards to /dev/null", async () => {
    const sh = makeShell();
    expect(await sh.run("exit3 2>/dev/null")).toMatchObject({ stderr: "", code: 3 });
    await sh.run("exit3 2> err.txt");
    expect(sh.vfs.readText("err.txt")).toBe("exit3: oops\n");
    await sh.run("exit3 > both.txt 2>&1");
    expect(sh.vfs.readText("both.txt")).toBe("exit3: oops\n");
    // 2>&1 inside a pipeline sends stderr down the pipe too.
    expect((await sh.run("exit3 2>&1 | upper")).stdout).toBe("EXIT3: OOPS\n");
    await sh.run("exit3 &> amp.txt");
    expect(sh.vfs.readText("amp.txt")).toBe("exit3: oops\n");
    expect((await sh.run("echo hi >&2")).stderr).toBe("hi\n");
    expect((await sh.run("nope 2>/dev/null")).stderr).toBe("");
  });

  it("reports redirection errors with bash's wording and skips the command", async () => {
    const sh = makeShell();
    expect(await sh.run("upper < missing")).toMatchObject({
      stderr: "bash: missing: No such file or directory\n",
      code: 1,
    });
    expect((await sh.run("echo x > nodir/f")).stderr).toBe(
      "bash: nodir/f: No such file or directory\n",
    );
    expect((await sh.run("echo x > etc")).stderr).toBe("bash: etc: Is a directory\n");
    expect((await sh.run("echo x > *.txt")).stderr).toBe("bash: *.txt: ambiguous redirect\n");
    expect((await sh.run("echo x > $NOPE")).stderr).toBe("bash: $NOPE: ambiguous redirect\n");
  });
});

describe("Shell errors", () => {
  it("prints bash's command-not-found wording with status 127", async () => {
    const sh = makeShell();
    expect(await sh.run("frobnicate --now")).toMatchObject({
      stderr: "bash: frobnicate: command not found\n",
      code: 127,
    });
  });

  it("says real but unsupported commands are not available in this lab (LB-3)", async () => {
    const sh = makeShell();
    const r = await sh.run("rm -rf /");
    expect(r.stderr).toBe(
      "bash: rm: not available in this lab (type 'help' to list the commands)\n",
    );
    expect(r.code).toBe(127);
    expect((await sh.run("./build-lab.sh")).stderr).toMatch(/not available in this lab/);
    expect((await sh.run("X=1 echo hi")).stderr).toMatch(
      /variable assignment .* not available in this lab/,
    );
  });

  it("prints syntax errors with status 2", async () => {
    const sh = makeShell();
    expect(await sh.run("ls |")).toMatchObject({
      stderr: "bash: syntax error: unexpected end of file\n",
      code: 2,
    });
    expect((await sh.run("echo 'oops")).stderr).toBe(
      "bash: unexpected EOF while looking for matching `''\n",
    );
  });

  it("turns command exceptions into messages", async () => {
    const sh = makeShell();
    expect(await sh.run("boom")).toMatchObject({
      stderr: "boom: internal error: kaboom\n",
      code: 1,
    });
  });

  it("an empty line keeps $?", async () => {
    const sh = makeShell();
    await sh.run("false");
    expect((await sh.run("")).code).toBe(1);
    expect((await sh.run("echo $?")).stdout).toBe("1\n");
  });
});

describe("Shell limits", () => {
  it("cuts screen output and stops the line", async () => {
    const sh = makeShell({ maxTerminalBytes: 1000 });
    const r = await sh.run("flood; echo after");
    expect(r.truncated).toBe(true);
    expect(r.stdout.length).toBeLessThanOrEqual(1000);
    expect(r.stdout).not.toContain("after");
    expect(r.stderr).toContain("[output cut: the lab shows at most 1000 bytes]");
  });

  it("stops a command that overfills a pipe", async () => {
    const sh = makeShell({ maxPipeBytes: 10_000 });
    const r = await sh.run("flood | lines");
    expect(r.stderr).toBe("flood: output too large for the lab (limit 10000 bytes)\n");
    expect(r.stdout).toMatch(/^\d+\n$/);
    expect(Number(r.stdout)).toBeLessThanOrEqual(5000);
  });

  it("caps redirected files too", async () => {
    const sh = makeShell({ maxPipeBytes: 10_000 });
    const r = await sh.run("flood > big.txt");
    expect(r.code).toBe(1);
    expect(sh.vfs.stat("big.txt").size).toBeLessThanOrEqual(10_000);
  });

  it("limits line length, pipeline length, commands per line and glob matches", async () => {
    const sh = makeShell({
      maxLineLength: 50,
      maxPipeline: 3,
      maxCommandsPerLine: 4,
      maxGlobMatches: 2,
    });
    expect((await sh.run("echo " + "x".repeat(60))).stderr).toMatch(/command line too long/);
    expect((await sh.run("true | true | true | true")).stderr).toMatch(
      /pipelines are limited to 3/,
    );
    expect((await sh.run("true; true; true; true; echo x")).stderr).toMatch(/at most 4 commands/);
    expect((await sh.run("args *.txt")).stderr).toBe(
      "bash: *.txt: too many matches (the lab limit is 2)\n",
    );
  });
});

// ---- builtins ----------------------------------------------------------------

describe("builtins", () => {
  it("cd and pwd, including ~, .., - and errors", async () => {
    const sh = makeShell();
    expect((await sh.run("pwd")).stdout).toBe("/home/student/lab\n");
    await sh.run("cd etc/ssh");
    expect(sh.vfs.cwd).toBe("/home/student/lab/etc/ssh");
    expect(sh.prompt()).toBe("student@lab:~/lab/etc/ssh$ ");
    await sh.run("cd ../..");
    expect(sh.vfs.cwd).toBe("/home/student/lab");
    await sh.run("cd");
    expect(sh.vfs.cwd).toBe("/home/student");
    expect((await sh.run("cd -")).stdout).toBe("/home/student/lab\n");
    await sh.run("cd ~/lab/log");
    expect((await sh.run("pwd")).stdout).toBe("/home/student/lab/log\n");
    expect(await sh.run("cd nope")).toMatchObject({
      stderr: "bash: cd: nope: No such file or directory\n",
      code: 1,
    });
    expect((await sh.run("cd auth.log")).stderr).toBe("bash: cd: auth.log: Not a directory\n");
    expect((await sh.run("cd a b")).stderr).toBe("bash: cd: too many arguments\n");
    expect(sh.vfs.cwd).toBe("/home/student/lab/log");
  });

  it("echo with -n and -e", async () => {
    const sh = makeShell();
    expect((await sh.run("echo hello   world")).stdout).toBe("hello world\n");
    expect((await sh.run("echo")).stdout).toBe("\n");
    expect((await sh.run("echo -n hi")).stdout).toBe("hi");
    expect((await sh.run("echo -e 'a\\tb\\nc'")).stdout).toBe("a\tb\nc\n");
    expect((await sh.run("echo 'a\\tb'")).stdout).toBe("a\\tb\n");
    expect((await sh.run("echo -x")).stdout).toBe("-x\n");
  });

  it("clear emits a clear marker; help lists every command", async () => {
    const sh = makeShell();
    const r = await sh.run("echo before; clear; echo after");
    expect(r.cleared).toBe(true);
    expect(r.chunks.map((c) => c.type)).toEqual(["text", "clear", "text"]);
    expect(r.stdout).toBe("after\n");
    const help = (await sh.run("help")).stdout;
    for (const name of ["cd", "pwd", "echo", "clear", "help", "upper"]) {
      expect(help).toMatch(new RegExp(`^  ${name} +\\S`, "m"));
    }
  });
});

describe("parseOptions", () => {
  const sh = makeShell();
  const run = async (line: string) => (await sh.run(line)).stdout;

  it("parses combined flags, values, long options and -NUM", async () => {
    expect(JSON.parse(await run("opts -nr -k2 -F : file -v -- -x"))).toEqual({
      flags: ["n", "r", "v"],
      values: { k: "2", F: ":" },
      operands: ["file", "-x"],
    });
    expect(JSON.parse(await run("opts --lines=5 --reverse - -12"))).toEqual({
      flags: ["r"],
      values: { n: "12" },
      operands: ["-"],
    });
  });

  it("rejects unknown options as not available in this lab", async () => {
    expect(await sh.run("opts -z")).toMatchObject({
      stderr: "opts: option '-z' is not available in this lab\n",
      code: 2,
    });
    expect((await sh.run("opts --color")).stderr).toBe(
      "opts: option '--color' is not available in this lab\n",
    );
    expect((await sh.run("opts -k")).stderr).toBe("opts: option requires an argument -- 'k'\n");
  });
});

describe("the seeded lab", () => {
  it("starts in ~/secplus-lab as root and globs the installers", async () => {
    const { vfs } = await seedLab();
    const sh = new Shell({ vfs });
    expect(sh.prompt()).toBe("root@lab:~/secplus-lab# ");
    await sh.run("cd ~/secplus-lab/downloads");
    expect((await sh.run("echo *.exe *.msi *.deb")).stdout).toBe(
      "agent-installer-v4.2.exe pdf-reader-2026.2.exe vpn-client-3.1.msi backup-tool-1.8.deb\n",
    );
    expect((await sh.run("cat ~/secplus-lab/.answer-lab-b    # check your answer")).code).not.toBe(
      0,
    );
  });
});
