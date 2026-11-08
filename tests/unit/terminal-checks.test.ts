// T-706: Lab A–C checks (LLD §13.2, LB-6) and the browser wording of the steps.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CHEAT_SHEET } from "../../app/lib/terminal/cheatSheet";
import {
  checkLabA,
  checkLabB,
  checkLabC,
  normaliseLabA,
  sshdDirective,
} from "../../app/lib/terminal/checks";
import { DEFAULT_COMMANDS } from "../../app/lib/terminal/commands";
import { Shell } from "../../app/lib/terminal/runner";
import { LAB_ROOT, seedLab } from "../../app/lib/terminal/seedLab";
import { browserLabStep, LAB_STEPS, labInstructionsMarkdown } from "../../shared/lab";

// Part 6 answers (tests are not shipped to the browser).
const LAB_A = { ip: "185.220.101.47", account: "backup", failures: "50" };

describe("Lab A", () => {
  it("passes with the Part 6 answers", async () => {
    const r = await checkLabA(LAB_A);
    expect(Object.values(r).every((x) => x.ok)).toBe(true);
  });

  it("accepts harmless variations", async () => {
    const r = await checkLabA({ ip: " 185.220.101.47 ", account: "BACKUP", failures: "050" });
    expect(Object.values(r).every((x) => x.ok)).toBe(true);
  });

  it("marks each wrong or empty field", async () => {
    const r = await checkLabA({ ip: "198.51.100.23", account: "", failures: "56" });
    expect(r.ip).toEqual({ ok: false, empty: false });
    expect(r.account).toEqual({ ok: false, empty: true });
    expect(r.failures.ok).toBe(false);
  });

  it("normalises", () => {
    expect(normaliseLabA("failures", "0")).toBe("0");
    expect(normaliseLabA("account", " 'Backup' ")).toBe("backup");
  });

  it("does not ship the answers as text", () => {
    const src = readFileSync("app/lib/terminal/checks.ts", "utf8");
    expect(src).not.toContain("185.220.101.47");
    expect(src).not.toMatch(/["'`]backup["'`]/);
    expect(src).not.toMatch(/\b(640|600)\b/);
  });
});

describe("Lab B", () => {
  it("matches the session's tampered file, by name or path", () => {
    expect(checkLabB("setup.exe", "setup.exe").ok).toBe(true);
    expect(checkLabB(" ~/secplus-lab/downloads/setup.exe", "setup.exe").ok).toBe(true);
    expect(checkLabB("other.msi", "setup.exe").ok).toBe(false);
    expect(checkLabB("", "setup.exe")).toEqual({ ok: false, empty: true });
  });

  it("is the file sha256sum -c reports as FAILED", async () => {
    const session = await seedLab();
    const sh = new Shell({ vfs: session.vfs });
    await sh.run("cd ~/secplus-lab/downloads");
    const r = await sh.run("sha256sum -c vendor_hashes.txt");
    const failed = /^(\S+): FAILED$/m.exec(r.stdout)?.[1];
    expect(failed).toBe(session.tamperedFile);
    expect(checkLabB(failed!, session.tamperedFile).ok).toBe(true);
  });
});

describe("Lab C", () => {
  it("fails on the fresh lab and passes after the fixes", async () => {
    const { vfs } = await seedLab();
    expect((await checkLabC(vfs)).map((r) => r.ok)).toEqual([false, false, false]);
    const sh = new Shell({ vfs });
    for (const line of [
      "cd ~/secplus-lab",
      "chmod 640 etc/shadow",
      "chmod 600 home/deploy/.ssh/id_rsa",
      "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' etc/ssh/sshd_config",
    ]) {
      expect((await sh.run(line)).code, line).toBe(0);
    }
    const r = await checkLabC(vfs);
    expect(r.map((x) => [x.item, x.ok, x.current])).toEqual([
      ["shadow", true, "640"],
      ["idRsa", true, "600"],
      ["permitRootLogin", true, "no"],
    ]);
  });

  it("rejects modes that are too open or too tight", async () => {
    const { vfs } = await seedLab();
    vfs.chmod(`${LAB_ROOT}/etc/shadow`, 0o600);
    vfs.chmod(`${LAB_ROOT}/home/deploy/.ssh/id_rsa`, 0o644);
    const r = await checkLabC(vfs);
    expect(r[0]).toMatchObject({ ok: false, current: "600" });
    expect(r[1]).toMatchObject({ ok: false, current: "644" });
  });

  it("uses the first PermitRootLogin, as sshd does", async () => {
    const { vfs } = await seedLab();
    vfs.appendFile(`${LAB_ROOT}/etc/ssh/sshd_config`, "PermitRootLogin no\n");
    expect((await checkLabC(vfs))[2]).toMatchObject({ ok: false, current: "yes" });
  });

  it("reads sshd directives", () => {
    expect(sshdDirective("#PermitRootLogin no\npermitrootlogin=No\n", "PermitRootLogin")).toBe(
      "No",
    );
    expect(sshdDirective("Match User x\nPermitRootLogin no\n", "PermitRootLogin")).toBeUndefined();
    expect(sshdDirective("Port 22\n", "PermitRootLogin")).toBeUndefined();
  });
});

describe("lab steps", () => {
  const labB = LAB_STEPS.find((s) => s.id === "lab-b")!;

  it("the browser Lab B has no answer file; the download keeps it", () => {
    const browser = browserLabStep(labB);
    expect(JSON.stringify(browser)).not.toContain(".answer-lab-b");
    expect(browser.commands).toContain("sha256sum -c vendor_hashes.txt");
    expect(browser.title).toBe(labB.title);
    expect(labInstructionsMarkdown()).toContain("cat ~/secplus-lab/.answer-lab-b");
    expect(labInstructionsMarkdown()).not.toContain("Select Check");
  });

  it("every browser step command runs in the lab", async () => {
    const { vfs } = await seedLab();
    const sh = new Shell({ vfs });
    for (const id of ["lab-a", "lab-b", "lab-c"]) {
      const lines = browserLabStep(LAB_STEPS.find((s) => s.id === id)!)
        .commands!.split("\n")
        .map((l) => l.replace(/\s+#.*$/, "").trim())
        .filter((l) => l !== "" && !l.startsWith("#") && !l.includes("???") && !l.includes("??"));
      for (const line of lines) {
        const r = await sh.run(line);
        expect(r.stderr, line).not.toContain("not available");
        expect(r.stderr, line).not.toContain("command not found");
      }
    }
  });

  it("cheat sheet commands marked for the browser exist", () => {
    const names = new Set(DEFAULT_COMMANDS.map((c) => c.name));
    for (const row of CHEAT_SHEET.filter((r) => r.inBrowser)) {
      for (const part of row.command.split(/ \| | \/ /)) {
        expect(names, row.command).toContain(part.trim().split(" ")[0]);
      }
    }
  });
});
