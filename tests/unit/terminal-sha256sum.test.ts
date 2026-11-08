// T-705: sha256sum and sha256sum -c, with GNU coreutils output, on real bytes.

import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { Shell } from "../../app/lib/terminal/runner";
import { LAB_ROOT, LAB_SEED, seedLab } from "../../app/lib/terminal/seedLab";
import { Vfs } from "../../app/lib/terminal/vfs";

const hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

function makeShell(): Shell {
  const vfs = new Vfs({ home: "/home/student", owner: "student", group: "student", now: () => 0 });
  vfs.mkdir("/home/student/lab/etc", { parents: true });
  vfs.chdir("/home/student/lab");
  vfs.writeFile("a.txt", "alpha\n");
  vfs.writeFile("b.txt", "bravo\n");
  vfs.writeFile("bin.dat", new Uint8Array([0, 1, 2, 255, 254, 128]));
  return new Shell({ vfs });
}

describe("sha256sum <files>", () => {
  it("prints `<hex>  <name>` per file, matching node:crypto", async () => {
    const sh = makeShell();
    const r = await sh.run("sha256sum a.txt bin.dat");
    expect(r).toMatchObject({ code: 0, stderr: "" });
    expect(r.stdout).toBe(
      `${hex("alpha\n")}  a.txt\n${hex(new Uint8Array([0, 1, 2, 255, 254, 128]))}  bin.dat\n`,
    );
  });

  it("hashes stdin as `-` (no operand, `-`, or a pipe)", async () => {
    const sh = makeShell();
    expect((await sh.run("echo hi | sha256sum")).stdout).toBe(`${hex("hi\n")}  -\n`);
    expect((await sh.run("sha256sum - < a.txt")).stdout).toBe(`${hex("alpha\n")}  -\n`);
    expect((await sh.run("sha256sum")).stdout).toBe(`${hex("")}  -\n`);
  });

  it("marks binary mode with *", async () => {
    const sh = makeShell();
    expect((await sh.run("sha256sum -b a.txt")).stdout).toBe(`${hex("alpha\n")} *a.txt\n`);
    expect((await sh.run("sha256sum --binary a.txt")).stdout).toBe(`${hex("alpha\n")} *a.txt\n`);
  });

  it("reports missing files and directories, continues, and exits 1", async () => {
    const sh = makeShell();
    const r = await sh.run("sha256sum nope a.txt etc");
    expect(r.stdout).toBe(`${hex("alpha\n")}  a.txt\n`);
    expect(r.stderr).toBe(
      "sha256sum: nope: No such file or directory\nsha256sum: etc: Is a directory\n",
    );
    expect(r.code).toBe(1);
  });

  it("escapes names with a backslash or newline, like GNU", async () => {
    const sh = makeShell();
    sh.vfs.writeFile("a\\b", "x");
    const r = await sh.run("sha256sum 'a\\b'");
    expect(r.stdout).toBe(`\\${hex("x")}  a\\\\b\n`);
    await sh.run("sha256sum 'a\\b' > sums");
    expect((await sh.run("sha256sum -c sums")).stdout).toBe("\\a\\\\b: OK\n");
  });

  it("rejects check-only options and unknown options", async () => {
    const sh = makeShell();
    expect((await sh.run("sha256sum --quiet a.txt")).stderr).toBe(
      "sha256sum: the --quiet option is meaningful only when verifying checksums\n" +
        "Try 'sha256sum --help' for more information.\n",
    );
    expect(await sh.run("sha256sum --tag a.txt")).toMatchObject({
      stderr: "sha256sum: option '--tag' is not available in this lab\n",
      code: 2,
    });
  });
});

describe("sha256sum -c", () => {
  async function withSums(content: string) {
    const sh = makeShell();
    sh.vfs.writeFile("sums.txt", content);
    return sh;
  }
  const good = `${hex("alpha\n")}  a.txt\n${hex("bravo\n")}  b.txt\n`;

  it("prints OK for each matching file and exits 0", async () => {
    const sh = await withSums(good);
    expect(await sh.run("sha256sum -c sums.txt")).toMatchObject({
      stdout: "a.txt: OK\nb.txt: OK\n",
      stderr: "",
      code: 0,
    });
    expect((await sh.run("sha256sum --check sums.txt")).code).toBe(0);
  });

  it("prints FAILED and the WARNING summary (singular and plural)", async () => {
    const sh = await withSums(good);
    sh.vfs.appendFile("a.txt", "x");
    let r = await sh.run("sha256sum -c sums.txt");
    expect(r.stdout).toBe("a.txt: FAILED\nb.txt: OK\n");
    expect(r.stderr).toBe("sha256sum: WARNING: 1 computed checksum did NOT match\n");
    expect(r.code).toBe(1);
    sh.vfs.appendFile("b.txt", "x");
    r = await sh.run("sha256sum -c sums.txt");
    expect(r.stderr).toBe("sha256sum: WARNING: 2 computed checksums did NOT match\n");
  });

  it("reports unreadable listed files", async () => {
    const sh = await withSums(`${good}${hex("")}  gone.txt\n${hex("")}  etc\n`);
    const r = await sh.run("sha256sum -c sums.txt");
    expect(r.stdout).toBe(
      "a.txt: OK\nb.txt: OK\ngone.txt: FAILED open or read\netc: FAILED open or read\n",
    );
    expect(r.stderr).toBe(
      "sha256sum: gone.txt: No such file or directory\n" +
        "sha256sum: etc: Is a directory\n" +
        "sha256sum: WARNING: 2 listed files could not be read\n",
    );
    expect(r.code).toBe(1);
  });

  it("--ignore-missing skips missing files", async () => {
    const sh = await withSums(`${good}${hex("")}  gone.txt\n`);
    expect(await sh.run("sha256sum -c --ignore-missing sums.txt")).toMatchObject({
      stdout: "a.txt: OK\nb.txt: OK\n",
      stderr: "",
      code: 0,
    });
    sh.vfs.writeFile("only-missing", `${hex("")}  gone.txt\n`);
    expect(await sh.run("sha256sum -c --ignore-missing only-missing")).toMatchObject({
      stderr: "sha256sum: only-missing: no file was verified\n",
      code: 1,
    });
  });

  it("counts improperly formatted lines; --strict fails on them; -w names them", async () => {
    const sh = await withSums(`junk\n${good}not a hash line\n`);
    let r = await sh.run("sha256sum -c sums.txt");
    expect(r.stdout).toBe("a.txt: OK\nb.txt: OK\n");
    expect(r.stderr).toBe("sha256sum: WARNING: 2 lines are improperly formatted\n");
    expect(r.code).toBe(0);
    expect((await sh.run("sha256sum -c --strict sums.txt")).code).toBe(1);
    r = await sh.run("sha256sum -c -w sums.txt");
    expect(r.stderr).toBe(
      "sha256sum: sums.txt: 1: improperly formatted SHA256 checksum line\n" +
        "sha256sum: sums.txt: 4: improperly formatted SHA256 checksum line\n" +
        "sha256sum: WARNING: 2 lines are improperly formatted\n",
    );
    sh.vfs.writeFile("one-bad", `x\n${good}`);
    expect((await sh.run("sha256sum -c one-bad")).stderr).toBe(
      "sha256sum: WARNING: 1 line is improperly formatted\n",
    );
  });

  it("fails when no line is a checksum line", async () => {
    const sh = await withSums("hello\nworld\n");
    expect(await sh.run("sha256sum -c sums.txt")).toMatchObject({
      stdout: "",
      stderr: "sha256sum: sums.txt: no properly formatted checksum lines found\n",
      code: 1,
    });
    expect((await sh.run("echo nope | sha256sum -c")).stderr).toBe(
      "sha256sum: 'standard input': no properly formatted checksum lines found\n",
    );
  });

  it("ignores comments, blank lines and CRs; accepts * , BSD tags and upper-case hex", async () => {
    const lines = [
      "# vendor list",
      "",
      `${hex("alpha\n").toUpperCase()}  a.txt\r`,
      `${hex("bravo\n")} *b.txt`,
      `SHA256 (a.txt) = ${hex("alpha\n")}`,
    ];
    const sh = await withSums(lines.join("\n") + "\n");
    expect(await sh.run("sha256sum -c sums.txt")).toMatchObject({
      stdout: "a.txt: OK\nb.txt: OK\na.txt: OK\n",
      stderr: "",
      code: 0,
    });
  });

  it("reads the list from stdin, and --quiet / --status trim the output", async () => {
    const sh = await withSums(good);
    sh.vfs.appendFile("b.txt", "x");
    expect((await sh.run("sha256sum -c < sums.txt")).stdout).toBe("a.txt: OK\nb.txt: FAILED\n");
    expect((await sh.run("sha256sum -c - < sums.txt")).stdout).toBe("a.txt: OK\nb.txt: FAILED\n");
    expect(await sh.run("sha256sum -c --quiet sums.txt")).toMatchObject({
      stdout: "b.txt: FAILED\n",
      stderr: "sha256sum: WARNING: 1 computed checksum did NOT match\n",
      code: 1,
    });
    expect(await sh.run("sha256sum -c --status sums.txt")).toMatchObject({
      stdout: "",
      stderr: "",
      code: 1,
    });
  });

  it("reports a missing checksum file and refuses -b/-t with -c", async () => {
    const sh = makeShell();
    expect(await sh.run("sha256sum -c nope.txt")).toMatchObject({
      stderr: "sha256sum: nope.txt: No such file or directory\n",
      code: 1,
    });
    expect((await sh.run("sha256sum -c -b nope.txt")).stderr).toMatch(
      /^sha256sum: the --binary and --text options are meaningless when verifying checksums\n/,
    );
  });
});

describe("Lab B on the seeded lab (LB-5)", () => {
  const { names } = LAB_SEED.installers;

  it("`sha256sum *.exe *.msi *.deb` hashes the stored bytes in glob order", async () => {
    const { vfs } = await seedLab();
    const sh = new Shell({ vfs });
    await sh.run("cd ~/secplus-lab/downloads");
    const r = await sh.run("sha256sum *.exe *.msi *.deb");
    const order = [
      "agent-installer-v4.2.exe",
      "pdf-reader-2026.2.exe",
      "vpn-client-3.1.msi",
      "backup-tool-1.8.deb",
    ];
    expect(r.stdout).toBe(order.map((n) => `${hex(vfs.readBytes(n))}  ${n}\n`).join(""));
    expect(r.code).toBe(0);
  });

  it.each(names)(
    "`sha256sum -c vendor_hashes.txt` reports exactly one FAILED when %s is tampered",
    async (victim) => {
      const { vfs, tamperedFile } = await seedLab({ pickVictim: () => victim });
      expect(tamperedFile).toBe(victim);
      const sh = new Shell({ vfs });
      await sh.run("cd ~/secplus-lab/downloads");
      const r = await sh.run("sha256sum -c vendor_hashes.txt");
      const lines = r.stdout.trimEnd().split("\n");
      expect(lines).toHaveLength(4);
      expect(lines.filter((l) => l.endsWith(": FAILED"))).toEqual([`${victim}: FAILED`]);
      expect(lines.filter((l) => l.endsWith(": OK"))).toHaveLength(3);
      expect(r.stderr).toBe("sha256sum: WARNING: 1 computed checksum did NOT match\n");
      expect(r.code).toBe(1);
    },
  );

  it("works with an absolute path from anywhere, and lists results in file order", async () => {
    const { vfs, tamperedFile } = await seedLab();
    const sh = new Shell({ vfs });
    await sh.run("cd ~/secplus-lab/downloads");
    const expected = vfs
      .readText("vendor_hashes.txt")
      .trimEnd()
      .split("\n")
      .map((l) => l.slice(66))
      .map((n) => `${n}: ${n === tamperedFile ? "FAILED" : "OK"}\n`)
      .join("");
    expect((await sh.run("sha256sum -c vendor_hashes.txt")).stdout).toBe(expected);
    // The vendor file names are relative, so checking from elsewhere can't open them.
    await sh.run("cd /");
    const r = await sh.run(`sha256sum -c ${LAB_ROOT}/downloads/vendor_hashes.txt`);
    expect(r.stderr).toMatch(/WARNING: 4 listed files could not be read\n$/);
  });

  it("an installer redirected to stdin hashes the same as the file", async () => {
    const { vfs, tamperedFile } = await seedLab();
    const sh = new Shell({ vfs });
    await sh.run("cd ~/secplus-lab/downloads");
    const r = await sh.run(`sha256sum < ${tamperedFile}`);
    expect(r.stdout).toBe(`${hex(vfs.readBytes(tamperedFile))}  -\n`);
  });
});
