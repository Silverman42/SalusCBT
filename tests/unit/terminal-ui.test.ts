// T-702: pure helpers behind Terminal.vue (history, Tab completion, scrollback
// and screen-reader announcements).

import { describe, expect, it } from "vitest";
import { DEFAULT_COMMANDS } from "../../app/lib/terminal/commands";
import { complete } from "../../app/lib/terminal/complete";
import { CommandHistory } from "../../app/lib/terminal/history";
import { Shell } from "../../app/lib/terminal/runner";
import { announcement, printable, Screen } from "../../app/lib/terminal/screen";
import { seedLab } from "../../app/lib/terminal/seedLab";

const NAMES = DEFAULT_COMMANDS.map((c) => c.name).sort();

describe("CommandHistory", () => {
  it("walks back and forward, keeping the draft", () => {
    const h = new CommandHistory();
    h.push("ls");
    h.push("cd log");
    expect(h.up("hea")).toBe("cd log");
    expect(h.up("cd log")).toBe("ls");
    expect(h.up("ls")).toBeUndefined();
    expect(h.down()).toBe("cd log");
    expect(h.down()).toBe("hea");
    expect(h.down()).toBeUndefined();
  });

  it("skips blank lines and repeats, and caps its size", () => {
    const h = new CommandHistory(3);
    for (const l of ["a", "a", " ", "b", "c", "d"]) h.push(l);
    expect(h.list()).toEqual(["b", "c", "d"]);
  });

  it("starts from the newest entry again after a push or reset", () => {
    const h = new CommandHistory();
    h.push("one");
    h.push("two");
    h.up("");
    h.up("");
    h.reset();
    expect(h.up("")).toBe("two");
    h.push("three");
    expect(h.up("")).toBe("three");
  });
});

describe("complete", () => {
  async function lab() {
    const { vfs } = await seedLab();
    return vfs;
  }

  it("completes a unique command name with a space", async () => {
    const vfs = await lab();
    expect(complete("sha", 3, vfs, NAMES)).toMatchObject({ line: "sha256sum ", cursor: 10 });
  });

  it("completes commands after a pipe and lists ambiguous ones", async () => {
    const vfs = await lab();
    const r = complete("grep x f | s", 12, vfs, NAMES)!;
    expect(r.line).toBe("grep x f | s");
    expect(r.matches).toEqual(["sed", "sha256sum", "sort", "stat"]);
    expect(complete("cat f && hea", 12, vfs, NAMES)!.line).toBe("cat f && head ");
    expect(complete("cat f && he", 11, vfs, NAMES)!.matches).toEqual(["head", "help"]);
  });

  it("completes paths: directories get a slash, files a space", async () => {
    const vfs = await lab();
    expect(complete("cd lo", 5, vfs, NAMES)!.line).toBe("cd log/");
    expect(complete("cat log/au", 10, vfs, NAMES)!.line).toBe("cat log/auth.log ");
    expect(complete("ls ~/secplus-lab/ho", 19, vfs, NAMES)!.line).toBe("ls ~/secplus-lab/home/");
    expect(complete("ls home/deploy/", 15, vfs, NAMES)!.matches).toEqual([]);
    expect(complete("ls home/deploy/.", 16, vfs, NAMES)!.line).toBe("ls home/deploy/.ssh/");
  });

  it("completes in the middle of a line", async () => {
    const vfs = await lab();
    const r = complete("cat lo | wc -l", 6, vfs, NAMES)!;
    expect(r).toMatchObject({ line: "cat log/ | wc -l", cursor: 8 });
  });

  it("completes the common prefix of several paths", async () => {
    const vfs = await lab();
    vfs.chdir("~/secplus-lab/downloads");
    const r = complete("sha256sum ", 10, vfs, NAMES)!;
    expect(r.matches.length).toBeGreaterThan(1);
    expect(r.matches).toContain("vendor_hashes.txt");
  });

  it("leaves Tab alone when there is nothing to complete", async () => {
    const vfs = await lab();
    expect(complete("", 0, vfs, NAMES)).toBeUndefined();
    expect(complete("grep 'Fail", 10, vfs, NAMES)).toBeUndefined();
    expect(complete("ls *.l", 6, vfs, NAMES)).toBeUndefined();
    expect(complete("zz", 2, vfs, NAMES)).toEqual({ line: "zz", cursor: 2, matches: [] });
  });
});

describe("Screen", () => {
  it("keeps commands and output in order and copies as text", () => {
    const s = new Screen();
    s.command("$ ", "echo hi");
    s.apply([
      { type: "text", stream: "stdout", text: "hi\n" },
      { type: "text", stream: "stderr", text: "oops\n" },
    ]);
    expect(s.entries.map((e) => e.kind)).toEqual(["command", "output", "output"]);
    expect(s.text()).toBe("$ echo hi\nhi\noops\n");
  });

  it("clears on a clear chunk and returns only what is shown after it", () => {
    const s = new Screen();
    s.output("stdout", "old\n");
    const shown = s.apply([
      { type: "text", stream: "stdout", text: "a\n" },
      { type: "clear" },
      { type: "text", stream: "stdout", text: "b\n" },
    ]);
    expect(shown).toBe("b\n");
    expect(s.text()).toBe("b\n");
  });

  it("joins an unterminated line with what follows", () => {
    const s = new Screen();
    s.output("stdout", "no newline");
    s.output("stdout", " yet\n");
    expect(s.entries).toHaveLength(1);
    expect(s.text()).toBe("no newline yet\n");
  });

  it("caps the scrollback by lines, dropping the oldest first", () => {
    const s = new Screen({ maxLines: 5, maxChars: 10_000 });
    s.command("$ ", "seq");
    s.output("stdout", "1\n2\n3\n4\n5\n6\n");
    expect(s.text()).toBe("2\n3\n4\n5\n6\n");
  });

  it("caps the scrollback by characters", () => {
    const s = new Screen({ maxLines: 1000, maxChars: 20 });
    s.output("stdout", "aaaaaaaaa\n");
    s.output("stderr", "bbbbbbbbb\n");
    s.output("stdout", "ccccccccc\n");
    expect(s.text()).toBe("bbbbbbbbb\nccccccccc\n");
  });

  it("shows control characters as replacement characters", () => {
    expect(printable("a\u0000b\u001b[31mc\r\nd\te")).toBe("a�b�[31mc\nd\te");
  });
});

describe("announcement", () => {
  it("is empty for no output", () => {
    expect(announcement("")).toBe("");
    expect(announcement("\n\n")).toBe("");
  });

  it("cuts long output to a few lines with a count of the rest", () => {
    const out = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join("\n") + "\n";
    const a = announcement(out, { maxLines: 3, maxChars: 1000 });
    expect(a).toBe("line 1\nline 2\nline 3\n… 27 more lines. Read them in the terminal output.");
  });

  it("caps characters", () => {
    const a = announcement("x".repeat(5000), { maxLines: 10, maxChars: 100 });
    expect(a.length).toBe(101);
  });

  it("reads the real Lab A ranking whole", async () => {
    const { vfs } = await seedLab();
    const sh = new Shell({ vfs });
    await sh.run("cd ~/secplus-lab/log");
    const r = await sh.run(
      "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr",
    );
    expect(announcement(r.stdout).split("\n")[0]).toBe("     50 185.220.101.47");
  });
});
