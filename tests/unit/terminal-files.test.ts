// T-703: cd, ls, cat, head, tail, stat, chmod with GNU coreutils output.
//
// 1. The lab-step commands (shared/lab.ts) on the seeded lab, exact output.
// 2. Edge cases per command.
// 3. Where GNU coreutils exist (CI: ubuntu-latest), build-lab.sh is run in a
//    temp $HOME (mtimes set to LAB_MTIME, LC_ALL=C, TZ=UTC) and the same
//    command lines are compared byte for byte, run by run.

import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { columnLines } from "../../app/lib/terminal/commands/ls";
import { compileMode } from "../../app/lib/terminal/commands/chmod";
import { humanSize } from "../../app/lib/terminal/commands/fileUtil";
import { Shell } from "../../app/lib/terminal/runner";
import { LAB_MTIME, seedLab } from "../../app/lib/terminal/seedLab";
import { Vfs } from "../../app/lib/terminal/vfs";

async function labShell(victim = "vpn-client-3.1.msi"): Promise<Shell> {
  const { vfs } = await seedLab({ pickVictim: () => victim });
  return new Shell({ vfs });
}

let clock = LAB_MTIME;

/** A small tree for edge cases. */
function smallShell(): Shell {
  clock = LAB_MTIME;
  const vfs = new Vfs({ home: "/home/s", owner: "s", group: "staff", now: () => clock });
  vfs.mkdir("/home/s/d/sub", { parents: true });
  vfs.chdir("/home/s");
  vfs.writeFile("a.txt", "one\ntwo\nthree\n");
  vfs.writeFile("nonl", "x\ny");
  vfs.writeFile("blank", "a\n\n\n\nb\tc\n");
  vfs.writeFile(".hidden", "h\n");
  vfs.writeFile("d/f", "");
  vfs.writeFile("bin", new Uint8Array([1, 10, 2, 3, 10, 255]));
  return new Shell({ vfs });
}

// ---------------------------------------------------------------- lab steps

describe("lab steps on the seeded lab", () => {
  it("Lab A: cd ~/secplus-lab/log, head auth.log", async () => {
    const sh = await labShell();
    expect(await sh.run("cd ~/secplus-lab/log")).toMatchObject({ code: 0, stdout: "" });
    expect(sh.vfs.cwd).toBe("/root/secplus-lab/log");
    const r = await sh.run("head auth.log");
    const expected = sh.vfs.readText("auth.log").split("\n").slice(0, 10).join("\n") + "\n";
    expect(r).toMatchObject({ code: 0, stderr: "", stdout: expected });
    expect(r.stdout.split("\n")[0]).toBe(
      "Nov  3 01:48:56 web01 CRON[1834]: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)",
    );
  });

  it("Lab B: cat vendor_hashes.txt", async () => {
    const sh = await labShell();
    await sh.run("cd ~/secplus-lab/downloads");
    const r = await sh.run("cat vendor_hashes.txt");
    expect(r.code).toBe(0);
    expect(r.stdout).toBe(sh.vfs.readText("vendor_hashes.txt"));
    expect(r.stdout.split("\n").map((l) => l.slice(66))).toEqual([
      "agent-installer-v4.2.exe",
      "pdf-reader-2026.2.exe",
      "vpn-client-3.1.msi",
      "backup-tool-1.8.deb",
      "",
    ]);
  });

  it("Lab C: ls -l etc", async () => {
    const sh = await labShell();
    await sh.run("cd ~/secplus-lab");
    expect(await sh.run("ls -l etc")).toMatchObject({
      code: 0,
      stderr: "",
      stdout:
        "total 20\n" +
        "-rw-r--r-- 1 root root   93 Nov  3 09:14 group\n" +
        "-rw-r--r-- 1 root root  342 Nov  3 09:14 passwd\n" +
        "-rw-r--rw- 1 root root  455 Nov  3 09:14 shadow\n" +
        "drwxr-xr-x 2 root root 4096 Nov  3 09:14 ssh\n" +
        "-r--r----- 1 root root   42 Nov  3 09:14 sudoers\n",
    });
  });

  it("Lab C: ls -la home/deploy/.ssh", async () => {
    const sh = await labShell();
    await sh.run("cd ~/secplus-lab");
    expect((await sh.run("ls -la home/deploy/.ssh")).stdout).toBe(
      "total 16\n" +
        "drwxr-xr-x 2 root root 4096 Nov  3 09:14 .\n" +
        "drwxr-xr-x 3 root root 4096 Nov  3 09:14 ..\n" +
        "-rw------- 1 root root    0 Nov  3 09:14 authorized_keys\n" +
        "-rw-r--r-- 1 root root   95 Nov  3 09:14 id_rsa\n" +
        "-rw-r--r-- 1 root root   38 Nov  3 09:14 id_rsa.pub\n",
    );
  });

  it("Lab C: chmod fixes, then stat -c '%a %n'", async () => {
    const sh = await labShell();
    await sh.run("cd ~/secplus-lab");
    const verify = "stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa";
    expect((await sh.run(verify)).stdout).toBe("646 etc/shadow\n644 home/deploy/.ssh/id_rsa\n");
    expect(await sh.run("chmod 640 etc/shadow")).toMatchObject({ code: 0, stdout: "", stderr: "" });
    expect(await sh.run("chmod 600 home/deploy/.ssh/id_rsa")).toMatchObject({ code: 0 });
    expect(await sh.run(verify)).toMatchObject({
      code: 0,
      stdout: "640 etc/shadow\n600 home/deploy/.ssh/id_rsa\n",
    });
    expect((await sh.run("ls -l etc/shadow")).stdout).toBe(
      "-rw-r----- 1 root root 455 Nov  3 09:14 etc/shadow\n",
    );
  });

  it("ls of the lab root and downloads", async () => {
    const sh = await labShell("agent-installer-v4.2.exe");
    await sh.run("cd ~/secplus-lab");
    expect((await sh.run("ls")).stdout).toBe("downloads  etc  home  log\n");
    expect((await sh.run("ls | cat")).stdout).toBe("downloads\netc\nhome\nlog\n");
    expect((await sh.run("ls -lh downloads")).stdout).toBe(
      "total 8.1M\n" +
        "-rw-r--r-- 1 root root 2.1M Nov  3 09:14 agent-installer-v4.2.exe\n" +
        "-rw-r--r-- 1 root root 2.0M Nov  3 09:14 backup-tool-1.8.deb\n" +
        "-rw-r--r-- 1 root root 2.0M Nov  3 09:14 pdf-reader-2026.2.exe\n" +
        "-rw-r--r-- 1 root root  350 Nov  3 09:14 vendor_hashes.txt\n" +
        "-rw-r--r-- 1 root root 2.0M Nov  3 09:14 vpn-client-3.1.msi\n",
    );
    expect((await sh.run("ls -l downloads")).stdout.split("\n").slice(0, 2)).toEqual([
      "total 8200",
      "-rw-r--r-- 1 root root 2097168 Nov  3 09:14 agent-installer-v4.2.exe",
    ]);
  });
});

// ---------------------------------------------------------------- cd

describe("cd (builtin)", () => {
  it("goes home, up, back with -, and reports errors like bash", async () => {
    const sh = smallShell();
    await sh.run("cd d/sub");
    expect(sh.vfs.cwd).toBe("/home/s/d/sub");
    await sh.run("cd ../..");
    expect(sh.vfs.cwd).toBe("/home/s");
    await sh.run("cd /");
    expect((await sh.run("cd -")).stdout).toBe("/home/s\n");
    await sh.run("cd /");
    await sh.run("cd");
    expect(sh.vfs.cwd).toBe("/home/s");
    expect(await sh.run("cd nope")).toMatchObject({
      code: 1,
      stderr: "bash: cd: nope: No such file or directory\n",
    });
    expect((await sh.run("cd a.txt")).stderr).toBe("bash: cd: a.txt: Not a directory\n");
  });
});

// ---------------------------------------------------------------- ls

describe("ls", () => {
  it("hides dot files unless -a / -A", async () => {
    const sh = smallShell();
    expect((await sh.run("ls -1")).stdout).toBe("a.txt\nbin\nblank\nd\nnonl\n");
    expect((await sh.run("ls -a -1")).stdout).toBe(".\n..\n.hidden\na.txt\nbin\nblank\nd\nnonl\n");
    expect((await sh.run("ls -A | cat")).stdout).toBe(".hidden\na.txt\nbin\nblank\nd\nnonl\n");
    expect((await sh.run("ls .hidden")).stdout).toBe(".hidden\n");
  });

  it("lists files first, then each directory with a header", async () => {
    const sh = smallShell();
    expect((await sh.run("ls -1 d a.txt nonl")).stdout).toBe("a.txt\nnonl\n\nd:\nf\nsub\n");
    expect((await sh.run("ls -1 d d/sub")).stdout).toBe("d:\nf\nsub\n\nd/sub:\n");
    expect((await sh.run("ls -d d d/sub")).stdout).toBe("d  d/sub\n");
    expect((await sh.run("ls -ld d")).stdout).toBe("drwxr-xr-x 3 s staff 4096 Nov  3 09:14 d\n");
  });

  it("reports missing operands with status 2 and still lists the rest", async () => {
    const sh = smallShell();
    expect(await sh.run("ls nope")).toMatchObject({
      code: 2,
      stdout: "",
      stderr: "ls: cannot access 'nope': No such file or directory\n",
    });
    expect(await sh.run("ls -1 nope d")).toMatchObject({ code: 2, stdout: "d:\nf\nsub\n" });
    expect((await sh.run("ls a.txt/x")).stderr).toBe(
      "ls: cannot access 'a.txt/x': Not a directory\n",
    );
    expect((await sh.run('ls "it\'s"')).stderr).toBe(
      'ls: cannot access "it\'s": No such file or directory\n',
    );
  });

  it("-l: aligned columns, link counts, total, empty files", async () => {
    const sh = smallShell();
    expect((await sh.run("ls -l d")).stdout).toBe(
      "total 4\n" +
        "-rw-r--r-- 1 s staff    0 Nov  3 09:14 f\n" +
        "drwxr-xr-x 2 s staff 4096 Nov  3 09:14 sub\n",
    );
    expect((await sh.run("ls -l a.txt nonl")).stdout).toBe(
      "-rw-r--r-- 1 s staff 14 Nov  3 09:14 a.txt\n-rw-r--r-- 1 s staff  3 Nov  3 09:14 nonl\n",
    );
  });

  it("-r, -S, -t sort", async () => {
    const sh = smallShell();
    expect((await sh.run("ls -r -1")).stdout).toBe("nonl\nd\nblank\nbin\na.txt\n");
    expect((await sh.run("ls -S -1")).stdout).toBe("d\na.txt\nblank\nbin\nnonl\n");
    clock += 60_000;
    sh.vfs.writeFile("nonl", "newer");
    expect((await sh.run("ls -t -1")).stdout).toBe("nonl\na.txt\nbin\nblank\nd\n");
    expect((await sh.run("ls -l nonl")).stdout).toBe("-rw-r--r-- 1 s staff 5 Nov  3 09:15 nonl\n");
  });

  it("refuses options outside the lab", async () => {
    expect(await smallShell().run("ls -R")).toMatchObject({
      code: 2,
      stderr: "ls: option '-R' is not available in this lab\n",
    });
  });

  it("columnLines matches GNU's layout", () => {
    expect(columnLines(["a", "b", "c"], 80)).toEqual(["a  b  c"]);
    const names = Array.from({ length: 12 }, (_, i) => `file-number-${i}`);
    expect(columnLines(names, 80)).toEqual([
      "file-number-0  file-number-3  file-number-6  file-number-9",
      "file-number-1  file-number-4  file-number-7  file-number-10",
      "file-number-2  file-number-5  file-number-8  file-number-11",
    ]);
    expect(columnLines(["x".repeat(100), "y"], 80)).toEqual(["x".repeat(100), "y"]);
  });

  it("humanSize rounds up like GNU -h", () => {
    expect(
      [0, 1023, 1024, 1025, 4096, 10_240, 10_241, 2_097_152, 2_097_168, 1_048_575].map(humanSize),
    ).toEqual(["0", "1023", "1.0K", "1.1K", "4.0K", "10K", "11K", "2.0M", "2.1M", "1.0M"]);
  });
});

// ---------------------------------------------------------------- cat

describe("cat", () => {
  it("concatenates files and stdin, numbering across files", async () => {
    const sh = smallShell();
    expect((await sh.run("cat a.txt nonl")).stdout).toBe("one\ntwo\nthree\nx\ny");
    expect((await sh.run("echo hi | cat - a.txt")).stdout).toBe("hi\none\ntwo\nthree\n");
    expect((await sh.run("cat -n a.txt a.txt")).stdout).toBe(
      "     1\tone\n     2\ttwo\n     3\tthree\n     4\tone\n     5\ttwo\n     6\tthree\n",
    );
  });

  it("-b, -s, -E, -T, -A", async () => {
    const sh = smallShell();
    expect((await sh.run("cat -b blank")).stdout).toBe("     1\ta\n\n\n\n     2\tb\tc\n");
    expect((await sh.run("cat -s blank")).stdout).toBe("a\n\nb\tc\n");
    expect((await sh.run("cat -E nonl")).stdout).toBe("x$\ny");
    expect((await sh.run("cat -T blank")).stdout).toBe("a\n\n\n\nb^Ic\n");
    expect((await sh.run("cat -A a.txt")).stdout).toBe("one$\ntwo$\nthree$\n");
  });

  it("keeps binary bytes intact", async () => {
    const sh = smallShell();
    await sh.run("cat bin > copy");
    expect(sh.vfs.readBytes("copy")).toEqual(new Uint8Array([1, 10, 2, 3, 10, 255]));
  });

  it("reports missing files and directories, continuing", async () => {
    expect(await smallShell().run("cat nope d a.txt")).toMatchObject({
      code: 1,
      stdout: "one\ntwo\nthree\n",
      stderr: "cat: nope: No such file or directory\ncat: d: Is a directory\n",
    });
  });
});

// ---------------------------------------------------------------- head / tail

describe("head and tail", () => {
  it("default 10 lines, -n N, -N, --lines", async () => {
    const sh = smallShell();
    sh.vfs.writeFile("n", Array.from({ length: 15 }, (_, i) => `${i + 1}\n`).join(""));
    expect((await sh.run("head n")).stdout).toBe("1\n2\n3\n4\n5\n6\n7\n8\n9\n10\n");
    expect((await sh.run("tail n")).stdout).toBe("6\n7\n8\n9\n10\n11\n12\n13\n14\n15\n");
    expect((await sh.run("head -n 2 n")).stdout).toBe("1\n2\n");
    expect((await sh.run("head -3 n")).stdout).toBe("1\n2\n3\n");
    expect((await sh.run("head --lines=1 n")).stdout).toBe("1\n");
    expect((await sh.run("tail -2 n")).stdout).toBe("14\n15\n");
    expect((await sh.run("tail -n 0 n")).stdout).toBe("");
  });

  it("head -n -N and tail -n +N", async () => {
    const sh = smallShell();
    expect((await sh.run("head -n -1 a.txt")).stdout).toBe("one\ntwo\n");
    expect((await sh.run("head -n -5 a.txt")).stdout).toBe("");
    expect((await sh.run("tail -n +2 a.txt")).stdout).toBe("two\nthree\n");
    expect((await sh.run("tail -n +0 a.txt")).stdout).toBe("one\ntwo\nthree\n");
    expect((await sh.run("tail -n 1 nonl")).stdout).toBe("y");
  });

  it("-c bytes, on text and binary", async () => {
    const sh = smallShell();
    expect((await sh.run("head -c 5 a.txt")).stdout).toBe("one\nt");
    expect((await sh.run("tail -c 3 a.txt")).stdout).toBe("ee\n");
    expect((await sh.run("tail -c +11 a.txt")).stdout).toBe("ree\n");
    expect((await sh.run("head -c -10 a.txt")).stdout).toBe("one\n");
    await sh.run("head -c 2 bin > b2");
    expect(sh.vfs.readBytes("b2")).toEqual(new Uint8Array([1, 10]));
    await sh.run("tail -n 1 bin > b3");
    expect(sh.vfs.readBytes("b3")).toEqual(new Uint8Array([255]));
    sh.vfs.writeFile("big", "x".repeat(3000));
    expect((await sh.run("head -c 2K big")).stdout).toHaveLength(2048);
  });

  it("headers for several files; -q and -v; stdin", async () => {
    const sh = smallShell();
    expect((await sh.run("head -n 1 a.txt nonl")).stdout).toBe(
      "==> a.txt <==\none\n\n==> nonl <==\nx\n",
    );
    expect((await sh.run("tail -q -n 1 a.txt nonl")).stdout).toBe("three\ny");
    expect((await sh.run("head -v -n 1 a.txt")).stdout).toBe("==> a.txt <==\none\n");
    expect((await sh.run("cat a.txt | head -n 1")).stdout).toBe("one\n");
    expect((await sh.run("cat a.txt | tail -v -n 1 -")).stdout).toBe(
      "==> standard input <==\nthree\n",
    );
  });

  it("errors in coreutils' words", async () => {
    const sh = smallShell();
    expect(await sh.run("head nope")).toMatchObject({
      code: 1,
      stderr: "head: cannot open 'nope' for reading: No such file or directory\n",
    });
    expect(await sh.run("tail d")).toMatchObject({
      code: 1,
      stderr: "tail: error reading 'd': Is a directory\n",
    });
    expect(await sh.run("head -n x a.txt")).toMatchObject({
      code: 1,
      stderr: "head: invalid number of lines: 'x'\n",
    });
    expect((await sh.run("tail -c 1Q a.txt")).stderr).toBe("tail: invalid number of bytes: '1Q'\n");
    expect((await sh.run("head -n")).stderr).toBe("head: option requires an argument -- 'n'\n");
  });

  it("tail -f / -F are not available", async () => {
    const sh = smallShell();
    expect(await sh.run("tail -f a.txt")).toMatchObject({
      code: 2,
      stdout: "",
      stderr: "tail: -f (follow) is not available in this lab\n",
    });
    expect((await sh.run("tail -F a.txt")).code).toBe(2);
    expect((await sh.run("tail --follow a.txt")).code).toBe(2);
  });
});

// ---------------------------------------------------------------- stat

describe("stat", () => {
  it("-c directives", async () => {
    const sh = smallShell();
    expect((await sh.run("stat -c '%a %A %U %G %u %g %s %F %h %n' a.txt d d/f")).stdout).toBe(
      "644 -rw-r--r-- s staff 1000 1000 14 regular file 1 a.txt\n" +
        "755 drwxr-xr-x s staff 1000 1000 4096 directory 3 d\n" +
        "644 -rw-r--r-- s staff 1000 1000 0 regular empty file 1 d/f\n",
    );
    expect((await sh.run("stat -c '%04a|%-6n|%6s|%.3A|%b %B %o|%%|%Q' a.txt")).stdout).toBe(
      "0644|a.txt |    14|-rw|8 512 4096|%|?\n",
    );
    expect((await sh.run("stat --format=%y a.txt")).stdout).toBe(
      "2026-11-03 09:14:00.000000000 +0000\n",
    );
    expect((await sh.run("stat -c %Y a.txt")).stdout).toBe(`${LAB_MTIME / 1000}\n`);
    expect((await sh.run("stat --printf='%a\\t%n\\n' a.txt d")).stdout).toBe(
      "644\ta.txt\n755\td\n",
    );
  });

  it("shows set-id and sticky bits as a fourth digit", async () => {
    const sh = smallShell();
    await sh.run("chmod 4755 a.txt");
    expect((await sh.run("stat -c '%a %A' a.txt")).stdout).toBe("4755 -rwsr-xr-x\n");
    await sh.run("chmod 1777 d");
    expect((await sh.run("stat -c '%a %A' d")).stdout).toBe("1777 drwxrwxrwt\n");
  });

  it("default report", async () => {
    const r = await smallShell().run("stat a.txt");
    const lines = r.stdout.split("\n");
    expect(lines[0]).toBe("  File: a.txt");
    expect(lines[1]).toBe("  Size: 14        \tBlocks: 8          IO Block: 4096   regular file");
    expect(lines[2]).toMatch(/^Device: 8,1\tInode: \d+ +Links: 1$/);
    expect(lines.slice(3)).toEqual([
      "Access: (0644/-rw-r--r--)  Uid: ( 1000/       s)   Gid: ( 1000/   staff)",
      "Access: 2026-11-03 09:14:00.000000000 +0000",
      "Modify: 2026-11-03 09:14:00.000000000 +0000",
      "Change: 2026-11-03 09:14:00.000000000 +0000",
      " Birth: 2026-11-03 09:14:00.000000000 +0000",
      "",
    ]);
  });

  it("errors", async () => {
    const sh = smallShell();
    expect(await sh.run("stat nope a.txt -c %n")).toMatchObject({
      code: 1,
      stdout: "a.txt\n",
      stderr: "stat: cannot statx 'nope': No such file or directory\n",
    });
    expect(await sh.run("stat")).toMatchObject({
      code: 1,
      stderr: "stat: missing operand\nTry 'stat --help' for more information.\n",
    });
    expect((await sh.run("stat -L a.txt")).code).toBe(2);
  });
});

// ---------------------------------------------------------------- chmod

describe("chmod", () => {
  async function modeAfter(mode: string, start = "644", target = "a.txt"): Promise<string> {
    const sh = smallShell();
    await sh.run(`chmod ${start} ${target}`);
    const r = await sh.run(`chmod ${mode} ${target}`);
    expect(r.stderr).toBe("");
    return (await sh.run(`stat -c %a ${target}`)).stdout.trim();
  }

  it("octal modes with 1–4 digits", async () => {
    expect(await modeAfter("600")).toBe("600");
    expect(await modeAfter("0640")).toBe("640");
    expect(await modeAfter("4755")).toBe("4755");
    expect(await modeAfter("7")).toBe("7");
    expect(await modeAfter("000")).toBe("0");
  });

  it("symbolic modes", async () => {
    expect(await modeAfter("u+x")).toBe("744");
    expect(await modeAfter("go-r")).toBe("600");
    expect(await modeAfter("a=r")).toBe("444");
    expect(await modeAfter("u=rw,go=")).toBe("600");
    expect(await modeAfter("+x")).toBe("755");
    expect(await modeAfter("=r")).toBe("444");
    expect(await modeAfter("g=u", "640")).toBe("660");
    expect(await modeAfter("o+t,u+s", "755")).toBe("5755");
    expect(await modeAfter("a+X", "644")).toBe("644");
    expect(await modeAfter("a+X", "744")).toBe("755");
    expect(await modeAfter("a+X", "600", "d")).toBe("711");
    expect(await modeAfter("u-w+x")).toBe("544");
    expect(await modeAfter("-r")).toBe("200"); // mode written as an option
  });

  it("directories keep setgid under a short numeric mode", async () => {
    const sh = smallShell();
    await sh.run("chmod 2755 d");
    await sh.run("chmod 750 d");
    expect((await sh.run("stat -c %a d")).stdout).toBe("2750\n");
    await sh.run("chmod 00750 d");
    expect((await sh.run("stat -c %a d")).stdout).toBe("750\n");
  });

  it("-R, -v, -c", async () => {
    const sh = smallShell();
    expect((await sh.run("chmod -R go-rx d")).code).toBe(0);
    expect((await sh.run("stat -c '%a %n' d d/f d/sub")).stdout).toBe(
      "700 d\n600 d/f\n700 d/sub\n",
    );
    expect((await sh.run("chmod -v 600 a.txt")).stdout).toBe(
      "mode of 'a.txt' changed from 0644 (rw-r--r--) to 0600 (rw-------)\n",
    );
    expect((await sh.run("chmod -v 600 a.txt")).stdout).toBe(
      "mode of 'a.txt' retained as 0600 (rw-------)\n",
    );
    expect((await sh.run("chmod -c 600 a.txt nonl")).stdout).toBe(
      "mode of 'nonl' changed from 0644 (rw-r--r--) to 0600 (rw-------)\n",
    );
  });

  it("warns when the umask keeps a bit, like GNU", async () => {
    const sh = smallShell();
    await sh.run("chmod 666 a.txt");
    expect(await sh.run("chmod -w a.txt")).toMatchObject({
      code: 1,
      stderr: "chmod: a.txt: new permissions are r--rw-rw-, not r--r--r--\n",
    });
    expect((await sh.run("stat -c %a a.txt")).stdout).toBe("466\n");
  });

  it("does not change mtime", async () => {
    const sh = smallShell();
    await sh.run("chmod 600 a.txt");
    expect(sh.vfs.stat("a.txt").mtime).toBe(LAB_MTIME);
  });

  it("errors in coreutils' words", async () => {
    const sh = smallShell();
    expect(await sh.run("chmod")).toMatchObject({
      code: 1,
      stderr: "chmod: missing operand\nTry 'chmod --help' for more information.\n",
    });
    expect((await sh.run("chmod 600")).stderr).toBe(
      "chmod: missing operand after '600'\nTry 'chmod --help' for more information.\n",
    );
    expect(await sh.run("chmod 8 a.txt")).toMatchObject({
      code: 1,
      stderr: "chmod: invalid mode: '8'\nTry 'chmod --help' for more information.\n",
    });
    expect((await sh.run("chmod 17777 a.txt")).stderr).toContain("invalid mode: '17777'");
    expect((await sh.run("chmod u+q a.txt")).stderr).toContain("invalid mode: 'u+q'");
    expect(await sh.run("chmod 600 nope a.txt")).toMatchObject({
      code: 1,
      stderr: "chmod: cannot access 'nope': No such file or directory\n",
    });
    expect((await sh.run("stat -c %a a.txt")).stdout).toBe("600\n");
    expect(await sh.run("chmod -f 600 nope")).toMatchObject({ code: 1, stderr: "" });
    expect((await sh.run("chmod --reference=a.txt nonl")).code).toBe(2);
  });

  it("compileMode accepts GNU's grammar and rejects junk", () => {
    for (const bad of ["", "u", "x+u", "u+rw,", "9", "+rq", "u+g+q"]) {
      expect(compileMode(bad), bad).toBeUndefined();
    }
    for (const good of ["u+", "ug=u+x", "a-st", "u=g,o-x", "+X"]) {
      expect(compileMode(good), good).toBeDefined();
    }
  });
});

// ---------------------------------------------------------------- real coreutils

function gnuCoreutils(): boolean {
  const r = spawnSync("ls", ["--version"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.includes("GNU coreutils");
}

/**
 * Run in order; chmod changes carry over to later lines on both sides. `ls -C`
 * is left out: GNU may align its columns with tabs, the lab uses spaces (the
 * screen looks the same).
 */
const COMPARE: string[] = [
  "ls",
  "ls -a",
  "ls -A home/deploy/.ssh",
  "ls -l",
  "ls -la",
  "ls -l etc",
  "ls -la home/deploy/.ssh",
  "ls -lh downloads",
  "ls -l downloads",
  "ls -l downloads/vendor_hashes.txt etc/passwd",
  "ls -d etc log",
  "ls -ld etc home/deploy",
  "ls etc/passwd log home",
  "ls -lt etc",
  "ls -lS etc",
  "ls -r etc",
  "ls nope etc",
  "ls -l etc/nope",
  "cd log && head auth.log",
  "cd log && head -n 3 auth.log",
  "cd log && head -5 auth.log",
  "cd log && head -n -120 auth.log",
  "cd log && head -c 50 auth.log",
  "cd log && tail auth.log",
  "cd log && tail -n 3 auth.log",
  "cd log && tail -n +125 auth.log",
  "cd log && tail -c 30 auth.log",
  "head -n 2 etc/passwd etc/group",
  "tail -n 1 etc/passwd etc/group",
  "head -q -n 1 etc/passwd etc/group",
  "head -v -n 1 etc/passwd",
  "head nope",
  "head etc",
  "tail etc",
  "head -n x etc/passwd",
  "cat downloads/vendor_hashes.txt",
  "cat etc/passwd etc/group",
  "cat -n etc/group",
  "cat -b etc/ssh/sshd_config",
  "cat -s -E etc/ssh/sshd_config",
  "cat -A home/deploy/.ssh/id_rsa.pub",
  "cat nope",
  "cat etc",
  "stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa",
  "stat -c '%a %A %s %F %h %b %B %o %n' etc etc/passwd home/deploy/.ssh/authorized_keys",
  "stat -c '%04a|%-12n|%10s|%.4A|' etc/passwd",
  "stat --printf='%a\\t%n\\n' etc/sudoers etc/group",
  "stat -c '%y %Y' etc/group",
  "stat nope",
  "stat",
  "chmod 640 etc/shadow",
  "chmod 600 home/deploy/.ssh/id_rsa",
  "stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa",
  "ls -l etc",
  "ls -la home/deploy/.ssh",
  "chmod -v u+x,go-r etc/passwd",
  "chmod -c 644 etc/passwd etc/group",
  "chmod g=u etc/group",
  "chmod -w etc/group",
  "chmod +x etc/group",
  "chmod o+w,a-x etc/group",
  "chmod =r etc/sudoers",
  "stat -c '%a %n' etc/passwd etc/group etc/sudoers",
  "chmod 2755 etc/ssh",
  "chmod 755 etc/ssh",
  "stat -c '%a %A' etc/ssh",
  "chmod -R go-rwx home",
  "stat -c '%a %n' home home/deploy home/deploy/.ssh home/deploy/.ssh/id_rsa.pub",
  "chmod 9 etc/group",
  "chmod 600 nope",
  "chmod",
  "chmod 600",
];

describe.skipIf(!gnuCoreutils())("against GNU coreutils on a real build-lab.sh run", () => {
  it("prints the same stdout, stderr and status for every command", async () => {
    const home = mkdtempSync(join(tmpdir(), "salus-files-"));
    const scriptDir = mkdtempSync(join(tmpdir(), "salus-script-"));
    try {
      const scriptPath = join(scriptDir, "build-lab.sh");
      writeFileSync(scriptPath, readFileSync("content/source/build-lab.sh", "utf8"));
      const env: Record<string, string | undefined> = {
        ...process.env,
        HOME: home,
        LC_ALL: "C",
        TZ: "UTC",
      };
      delete env.COLUMNS;
      const build = spawnSync("bash", ["-c", 'umask 022 && exec bash "$0"', scriptPath], {
        env,
        encoding: "utf8",
      });
      expect(build.status, build.stderr).toBe(0);
      const lab = join(home, "secplus-lab");
      const answer = readFileSync(join(lab, ".answer-lab-b"), "utf8").trim();
      rmSync(join(lab, ".answer-lab-b")); // not in the VFS (see seedLab.ts)
      const stamp = `@${LAB_MTIME / 1000}`;
      const touch = spawnSync("find", [home, "-exec", "touch", "-h", "-d", stamp, "{}", "+"]);
      expect(touch.status).toBe(0);
      const id = (flag: string) => spawnSync("id", [flag], { encoding: "utf8" }).stdout.trim();
      const owner = ` ${id("-un")} ${id("-gn")} `;

      const sh = await labShell(answer);
      for (const line of COMPARE) {
        const real = spawnSync("bash", ["-c", `umask 022; cd ~/secplus-lab && ${line}`], {
          env,
          encoding: "utf8",
        });
        sh.vfs.writeFile("/out", "");
        const ours = await sh.run(`cd ~/secplus-lab && ${line} > /out`);
        // GNU shows the year for files over six months old; the lab always shows the time.
        const realOut = real.stdout
          .split(owner)
          .join(" root root ")
          .replace(/Nov {2}3 {2}2026/g, "Nov  3 09:14");
        expect({ line, stdout: sh.vfs.readText("/out"), stderr: ours.stderr }).toEqual({
          line,
          stdout: realOut,
          stderr: real.stderr,
        });
        expect(ours.code, line).toBe(real.status);
      }
    } finally {
      rmSync(home, { recursive: true, force: true });
      rmSync(scriptDir, { recursive: true, force: true });
    }
  }, 60_000);
});
