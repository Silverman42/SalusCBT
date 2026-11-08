// T-701: seedLab() builds the same ~/secplus-lab as content/source/build-lab.sh.
//
// 1. Drift: the committed labSeed.json equals a fresh parse of the script.
// 2. Key files have the script's exact content and modes (and Lab A answers).
// 3. Lab B: real hashes, exactly one tampered installer, answer file left out.
// 4. Where bash + sha256sum exist (CI: ubuntu-latest), the script itself is run
//    in a temp $HOME and its whole tree is compared with seedLab().

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import labSeedJson from "../../app/lib/terminal/labSeed.json";
import {
  LAB_HOME,
  LAB_MTIME,
  LAB_ROOT,
  LAB_SEED,
  seedLab,
  sha256Hex,
} from "../../app/lib/terminal/seedLab";
import { contentBytes, octalMode, type Vfs } from "../../app/lib/terminal/vfs";
import { LabScriptError, parseLabScript } from "../../shared/labScript";

const SCRIPT_PATH = "content/source/build-lab.sh";
const SCRIPT = readFileSync(SCRIPT_PATH, "utf8");
const INSTALLERS = [
  "agent-installer-v4.2.exe",
  "backup-tool-1.8.deb",
  "pdf-reader-2026.2.exe",
  "vpn-client-3.1.msi",
];

/** Lines of the script between `cat > <path> <<'EOF'` and `EOF`, as written. */
function heredoc(path: string): string {
  const lines = SCRIPT.split("\n");
  const start = lines.indexOf(`cat > ${path} <<'EOF'`);
  if (start < 0) throw new Error(`no heredoc for ${path}`);
  const end = lines.indexOf("EOF", start);
  return lines
    .slice(start + 1, end)
    .map((l) => `${l}\n`)
    .join("");
}

type Entry = { kind: "file" | "dir"; mode: string; size: number };

/** Every path under the lab root (relative), with kind, octal mode and size. */
function vfsTree(vfs: Vfs, dir = LAB_ROOT, prefix = ""): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const name of vfs.list(dir)) {
    const st = vfs.stat(`${dir}/${name}`);
    const rel = prefix + name;
    out.set(rel, {
      kind: st.kind,
      mode: octalMode(st.mode),
      size: st.kind === "dir" ? 0 : st.size,
    });
    if (st.kind === "dir") for (const [k, v] of vfsTree(vfs, st.path, `${rel}/`)) out.set(k, v);
  }
  return out;
}

function diskTree(dir: string, prefix = ""): Map<string, Entry> {
  const out = new Map<string, Entry>();
  for (const name of readdirSync(dir).sort()) {
    const st = statSync(join(dir, name));
    const rel = prefix + name;
    const kind = st.isDirectory() ? "dir" : "file";
    out.set(rel, { kind, mode: octalMode(st.mode), size: kind === "dir" ? 0 : st.size });
    if (kind === "dir") for (const [k, v] of diskTree(join(dir, name), `${rel}/`)) out.set(k, v);
  }
  return out;
}

/** Parse `hash  name` lines. */
function hashLines(text: string): { hash: string; name: string }[] {
  return text
    .trimEnd()
    .split("\n")
    .map((l) => {
      const m = /^([0-9a-f]{64}) {2}(\S+)$/.exec(l);
      if (!m) throw new Error(`bad hash line: ${l}`);
      return { hash: m[1] ?? "", name: m[2] ?? "" };
    });
}

describe("labSeed.json (generated from build-lab.sh)", () => {
  it("matches a fresh parse of the script (run `npm run lab:seed` if this fails)", () => {
    expect(labSeedJson).toEqual(parseLabScript(SCRIPT));
  });

  it("is what the generator CLI prints", () => {
    const run = spawnSync(
      process.execPath,
      ["--import", "tsx", "scripts/lab-seed.ts", SCRIPT_PATH],
      { encoding: "utf8" },
    );
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(JSON.parse(run.stdout)).toEqual(labSeedJson);
  }, 30_000);

  it("rejects script lines it does not understand, with the line number", () => {
    const changed = SCRIPT.replace("chmod 646 etc/shadow", "chown root etc/shadow");
    const line = SCRIPT.split("\n").indexOf("chmod 646 etc/shadow") + 1;
    expect(() => parseLabScript(changed)).toThrow(LabScriptError);
    expect(() => parseLabScript(changed)).toThrow(
      `build-lab.sh:${line}: unsupported command: chown root etc/shadow`,
    );
    const lastEof = SCRIPT.lastIndexOf("\nEOF\n");
    const unclosed = SCRIPT.slice(0, lastEof) + "\nEOX\n" + SCRIPT.slice(lastEof + 5);
    expect(() => parseLabScript(unclosed)).toThrow(/heredoc EOF is not closed/);
  });

  it("records the answer file only by name, never its content", () => {
    expect(LAB_SEED.answerFile).toBe(".answer-lab-b");
    expect(LAB_SEED.files.map((f) => f.path)).not.toContain(".answer-lab-b");
  });
});

describe("seedLab() text files match build-lab.sh", () => {
  it("starts in ~/secplus-lab", async () => {
    const { vfs } = await seedLab();
    expect(LAB_ROOT).toBe(`${LAB_HOME}/secplus-lab`);
    expect(vfs.cwd).toBe(LAB_ROOT);
    expect(vfs.displayCwd).toBe("~/secplus-lab");
  });

  it("has the script's directories and files with the script's modes", async () => {
    const { vfs } = await seedLab();
    const tree = vfsTree(vfs);
    const modes = Object.fromEntries([...tree].map(([k, v]) => [k, v.mode]));
    expect(modes).toEqual({
      downloads: "755",
      "downloads/agent-installer-v4.2.exe": "644",
      "downloads/backup-tool-1.8.deb": "644",
      "downloads/pdf-reader-2026.2.exe": "644",
      "downloads/vendor_hashes.txt": "644",
      "downloads/vpn-client-3.1.msi": "644",
      etc: "755",
      "etc/group": "644",
      "etc/passwd": "644",
      "etc/shadow": "646",
      "etc/ssh": "755",
      "etc/ssh/sshd_config": "644",
      "etc/sudoers": "440",
      home: "755",
      "home/deploy": "755",
      "home/deploy/.ssh": "755",
      "home/deploy/.ssh/authorized_keys": "600",
      "home/deploy/.ssh/id_rsa": "644",
      "home/deploy/.ssh/id_rsa.pub": "644",
      log: "755",
      "log/auth.log": "644",
    });
    for (const p of [...tree.keys()]) {
      expect(vfs.stat(p)).toMatchObject({ owner: "root", group: "root", mtime: LAB_MTIME });
    }
  });

  it("has the heredoc files byte for byte", async () => {
    const { vfs } = await seedLab();
    for (const path of ["log/auth.log", "etc/passwd", "etc/group", "etc/shadow"]) {
      expect(vfs.readText(path)).toBe(heredoc(path));
    }
    expect(vfs.readText("etc/ssh/sshd_config")).toBe(heredoc("etc/ssh/sshd_config"));
  });

  it("has the printf/touch files", async () => {
    const { vfs } = await seedLab();
    expect(vfs.readText("etc/sudoers")).toBe("Defaults env_reset\nroot ALL=(ALL:ALL) ALL\n");
    expect(vfs.readText("home/deploy/.ssh/id_rsa")).toBe(
      "-----BEGIN OPENSSH PRIVATE KEY-----\n(practice key, not real)\n-----END OPENSSH PRIVATE KEY-----\n",
    );
    expect(vfs.readText("home/deploy/.ssh/id_rsa.pub")).toBe(
      "ssh-ed25519 AAAAC3Nza... deploy@web01\n",
    );
    expect(vfs.stat("home/deploy/.ssh/authorized_keys").size).toBe(0);
  });

  it("auth.log gives the Lab A facts (LB-4)", async () => {
    const { vfs } = await seedLab();
    const log = vfs.readText("~/secplus-lab/log/auth.log");
    const lines = log.trimEnd().split("\n");
    expect(lines).toHaveLength(130);
    expect(lines[0]).toMatch(/^Nov {2}3 01:48:56 web01 CRON\[1834\]/);
    const failedFromAttacker = lines.filter(
      (l) => l.includes("Failed password") && l.includes("from 185.220.101.47 "),
    );
    expect(failedFromAttacker).toHaveLength(50);
    expect(
      lines.filter((l) => l.includes("Accepted password for backup from 185.220.101.47")),
    ).toHaveLength(1);
  });

  it("leaves Lab C unfixed: shadow 646, id_rsa 644, PermitRootLogin yes", async () => {
    const { vfs } = await seedLab();
    expect(octalMode(vfs.stat("etc/shadow").mode)).toBe("646");
    expect(octalMode(vfs.stat("home/deploy/.ssh/id_rsa").mode)).toBe("644");
    expect(vfs.readText("etc/ssh/sshd_config")).toMatch(/^PermitRootLogin yes$/m);
  });
});

describe("seedLab() Lab B installers (LB-5)", () => {
  it("writes 2 MiB installers, real hashes in script order, and tampers with one", async () => {
    const { vfs, tamperedFile } = await seedLab();
    expect(INSTALLERS).toContain(tamperedFile);
    const vendor = hashLines(vfs.readText("downloads/vendor_hashes.txt"));
    // `sha256sum *.exe *.msi *.deb`: each glob sorted, globs in order.
    expect(vendor.map((v) => v.name)).toEqual([
      "agent-installer-v4.2.exe",
      "pdf-reader-2026.2.exe",
      "vpn-client-3.1.msi",
      "backup-tool-1.8.deb",
    ]);
    const failed: string[] = [];
    for (const { hash, name } of vendor) {
      const bytes = vfs.readBytes(`downloads/${name}`);
      const actual = createHash("sha256").update(bytes).digest("hex");
      expect(await sha256Hex(bytes)).toBe(actual);
      if (actual !== hash) failed.push(name);
      const size = name === tamperedFile ? 2_097_152 + "injected-payload".length : 2_097_152;
      expect(bytes.length).toBe(size);
    }
    expect(failed).toEqual([tamperedFile]);
    const tail = vfs.readBytes(`downloads/${tamperedFile}`).slice(-16);
    expect(new TextDecoder().decode(tail)).toBe("injected-payload");
  });

  it("keeps installers as bytes and fills them from the random source", async () => {
    let calls = 0;
    const { vfs } = await seedLab({
      randomBytes: (buf) => {
        calls++;
        buf.fill(calls);
      },
      pickVictim: (names) => {
        expect(names).toEqual(INSTALLERS);
        return "vpn-client-3.1.msi";
      },
    });
    expect(calls).toBe(4);
    expect(vfs.read("downloads/agent-installer-v4.2.exe")).toBeInstanceOf(Uint8Array);
    expect(vfs.readBytes("downloads/agent-installer-v4.2.exe").every((b) => b === 1)).toBe(true);
    const ones = createHash("sha256").update(new Uint8Array(2_097_152).fill(1)).digest("hex");
    expect(vfs.readText("downloads/vendor_hashes.txt").split("\n")[0]).toBe(
      `${ones}  agent-installer-v4.2.exe`,
    );
  });

  it("uses fresh random bytes and a random victim on each reset (LB-7)", async () => {
    const victims = new Set<string>();
    let first: string | undefined;
    for (let i = 0; i < 12; i++) {
      const { vfs, tamperedFile } = await seedLab();
      victims.add(tamperedFile);
      const hashes = vfs.readText("downloads/vendor_hashes.txt");
      if (first === undefined) first = hashes;
      else expect(hashes).not.toBe(first);
    }
    // P(all 12 picks land on ≤1 installer) = 4·(1/4)^12 ≈ 2e-7.
    expect(victims.size).toBeGreaterThan(1);
  }, 30_000);

  it("rejects a victim that is not an installer", async () => {
    await expect(seedLab({ pickVictim: () => "vendor_hashes.txt" })).rejects.toThrow(
      /not an installer/,
    );
  });

  it("does not create the Lab B answer file (it would give the answer away)", async () => {
    const { vfs } = await seedLab();
    expect(vfs.exists("~/secplus-lab/.answer-lab-b")).toBe(false);
    expect(vfs.list("~/secplus-lab").filter((n) => n.startsWith("."))).toEqual([]);
  });
});

// ---- Compare with a real run of build-lab.sh ----

function has(cmd: string): boolean {
  return spawnSync("sh", ["-c", `command -v ${cmd}`], { stdio: "ignore" }).status === 0;
}

const canRunScript = has("bash") && has("sha256sum") && has("head");

describe.skipIf(!canRunScript)("seedLab() against a real build-lab.sh run", () => {
  it("creates the same tree, modes, sizes and text contents", async () => {
    const home = mkdtempSync(join(tmpdir(), "salus-lab-"));
    try {
      // macOS has no shuf; the lab instructions suggest the same swap.
      const script = has("shuf") ? SCRIPT : SCRIPT.replace("shuf -n1", "sort -R | head -n1");
      const scriptPath = join(home, "build-lab.sh");
      writeFileSync(scriptPath, script);
      const run = spawnSync("bash", ["-c", 'umask 022 && exec bash "$0"', scriptPath], {
        env: { ...process.env, HOME: home },
        encoding: "utf8",
      });
      expect(run.stderr).toBe("");
      expect(run.status).toBe(0);
      const labDir = join(home, "secplus-lab");

      const real = diskTree(labDir);
      const answer = readFileSync(join(labDir, ".answer-lab-b"), "utf8").trim();
      expect(real.get(".answer-lab-b")).toBeDefined();
      real.delete(".answer-lab-b"); // deliberately not in the VFS

      const { vfs, tamperedFile } = await seedLab({ pickVictim: () => answer });
      expect(tamperedFile).toBe(answer);
      expect(Object.fromEntries(vfsTree(vfs))).toEqual(Object.fromEntries(real));

      for (const [path, entry] of real) {
        if (entry.kind !== "file" || path.startsWith("downloads/")) continue;
        expect(vfs.readText(path), path).toBe(readFileSync(join(labDir, path), "utf8"));
      }

      // Same hash file shape; the one mismatch is the tampered file, on both sides.
      const realHashes = hashLines(
        readFileSync(join(labDir, "downloads/vendor_hashes.txt"), "utf8"),
      );
      const vfsHashes = hashLines(vfs.readText("downloads/vendor_hashes.txt"));
      expect(vfsHashes.map((h) => h.name)).toEqual(realHashes.map((h) => h.name));
      const realFailed = realHashes.filter(
        (h) =>
          createHash("sha256")
            .update(readFileSync(join(labDir, "downloads", h.name)))
            .digest("hex") !== h.hash,
      );
      expect(realFailed.map((h) => h.name)).toEqual([answer]);
      const tail = contentBytes(vfs.read(`downloads/${answer}`)).slice(-16);
      expect(Buffer.from(tail)).toEqual(
        readFileSync(join(labDir, "downloads", answer)).subarray(-16),
      );
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 60_000);
});
