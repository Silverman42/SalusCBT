// T-701: the in-memory file system behind the terminal lab.

import { beforeEach, describe, expect, it } from "vitest";
import { formatMode, octalMode, Vfs, VfsError } from "../../app/lib/terminal/vfs";

const T0 = Date.UTC(2026, 10, 3, 9, 14);

function makeVfs(now = () => T0) {
  const vfs = new Vfs({ home: "/home/student", owner: "student", group: "staff", now });
  vfs.mkdir("/home/student/lab/etc/ssh", { parents: true });
  vfs.writeFile("/home/student/lab/etc/passwd", "root:x:0:0\n");
  vfs.writeFile("/home/student/lab/etc/ssh/sshd_config", "Port 22\n");
  vfs.chdir("~/lab");
  return vfs;
}

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    if (e instanceof VfsError) return e.code;
    throw e;
  }
  return undefined;
}

describe("Vfs path resolution", () => {
  let vfs: Vfs;
  beforeEach(() => {
    vfs = makeVfs();
  });

  it("starts relative paths at cwd", () => {
    expect(vfs.cwd).toBe("/home/student/lab");
    expect(vfs.resolve("etc/passwd")).toBe("/home/student/lab/etc/passwd");
    expect(vfs.resolve("./etc/./ssh/")).toBe("/home/student/lab/etc/ssh");
  });

  it("expands ~ and ~/… to home", () => {
    expect(vfs.resolve("~")).toBe("/home/student");
    expect(vfs.resolve("~/lab/etc")).toBe("/home/student/lab/etc");
    // `~user` and `a/~` are ordinary names, as in bash for an unknown user.
    expect(vfs.resolve("x/~")).toBe("/home/student/lab/x/~");
  });

  it("keeps absolute paths and folds //, . and ..", () => {
    expect(vfs.resolve("/etc//ssh/../passwd")).toBe("/etc/passwd");
    expect(vfs.resolve("etc/ssh/../../etc")).toBe("/home/student/lab/etc");
    expect(vfs.resolve("..")).toBe("/home/student");
    expect(vfs.resolve("../../../../..")).toBe("/");
    expect(vfs.resolve("/")).toBe("/");
  });

  it("resolves against a given base", () => {
    expect(vfs.resolve("ssh", "/home/student/lab/etc")).toBe("/home/student/lab/etc/ssh");
  });
});

describe("Vfs cwd", () => {
  it("changes directory with relative, .., ~ and absolute paths", () => {
    const vfs = makeVfs();
    vfs.chdir("etc/ssh");
    expect(vfs.cwd).toBe("/home/student/lab/etc/ssh");
    expect(vfs.displayCwd).toBe("~/lab/etc/ssh");
    vfs.chdir("../..");
    expect(vfs.displayCwd).toBe("~/lab");
    vfs.chdir();
    expect(vfs.cwd).toBe("/home/student");
    expect(vfs.displayCwd).toBe("~");
    vfs.chdir("/");
    expect(vfs.displayCwd).toBe("/");
  });

  it("refuses missing directories and files, leaving cwd alone", () => {
    const vfs = makeVfs();
    expect(code(() => vfs.chdir("nope"))).toBe("ENOENT");
    expect(code(() => vfs.chdir("etc/passwd"))).toBe("ENOTDIR");
    expect(vfs.cwd).toBe("/home/student/lab");
  });
});

describe("Vfs read, write, list, stat", () => {
  it("reads text and bytes", () => {
    const vfs = makeVfs();
    expect(vfs.read("etc/passwd")).toBe("root:x:0:0\n");
    expect(vfs.readBytes("etc/passwd")).toEqual(new TextEncoder().encode("root:x:0:0\n"));
    vfs.writeFile("bin", new Uint8Array([0x68, 0x69]));
    expect(vfs.readText("bin")).toBe("hi");
  });

  it("reports ENOENT, EISDIR and ENOTDIR with the coreutils message", () => {
    const vfs = makeVfs();
    let err: unknown;
    try {
      vfs.read("missing.txt");
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(VfsError);
    expect((err as VfsError).message).toBe("No such file or directory");
    expect((err as VfsError).path).toBe("missing.txt");
    expect(code(() => vfs.read("etc"))).toBe("EISDIR");
    expect(code(() => vfs.read("etc/passwd/x"))).toBe("ENOTDIR");
    expect(code(() => vfs.list("etc/passwd"))).toBe("ENOTDIR");
    expect(code(() => vfs.writeFile("no/such/dir.txt", "x"))).toBe("ENOENT");
    expect(code(() => vfs.writeFile("etc/passwd/x", "x"))).toBe("ENOTDIR");
    expect(code(() => vfs.writeFile("etc", "x"))).toBe("EISDIR");
  });

  it("lists entries sorted, hidden files included, without . and ..", () => {
    const vfs = makeVfs();
    vfs.writeFile("etc/.hidden", "");
    vfs.writeFile("etc/Group", "");
    expect(vfs.list("etc")).toEqual([".hidden", "Group", "passwd", "ssh"]);
    expect(vfs.list("/")).toEqual(["home"]);
    expect(vfs.list(".")).toEqual(["etc"]);
  });

  it("stats files and directories", () => {
    const vfs = makeVfs();
    vfs.writeFile("é.txt", "é\n");
    expect(vfs.stat("é.txt")).toEqual({
      path: "/home/student/lab/é.txt",
      name: "é.txt",
      kind: "file",
      mode: 0o644,
      owner: "student",
      group: "staff",
      mtime: T0,
      size: 3, // UTF-8 bytes, not characters
    });
    expect(vfs.stat("etc")).toMatchObject({ kind: "dir", mode: 0o755, size: 4096 });
    expect(vfs.stat("/").name).toBe("/");
    expect(vfs.exists("etc/ssh/sshd_config")).toBe(true);
    expect(vfs.exists("etc/ssh/nope")).toBe(false);
    expect(vfs.isDir("etc/ssh")).toBe(true);
  });

  it("overwrites in place (keeping mode) and updates mtime", () => {
    let t = T0;
    const vfs = makeVfs(() => t);
    vfs.chmod("etc/passwd", 0o600);
    t += 60_000;
    vfs.writeFile("etc/passwd", "changed\n");
    expect(vfs.stat("etc/passwd")).toMatchObject({ mode: 0o600, mtime: T0 + 60_000, size: 8 });
  });

  it("appends text to text and bytes to bytes", () => {
    const vfs = makeVfs();
    vfs.appendFile("etc/passwd", "daemon:x:1:1\n");
    expect(vfs.read("etc/passwd")).toBe("root:x:0:0\ndaemon:x:1:1\n");
    vfs.writeFile("blob", new Uint8Array([1, 2]));
    vfs.appendFile("blob", "ab");
    expect(vfs.read("blob")).toEqual(new Uint8Array([1, 2, 0x61, 0x62]));
    vfs.appendFile("new.txt", "x");
    expect(vfs.read("new.txt")).toBe("x");
  });

  it("mkdir needs a parent unless parents is set; EEXIST without it", () => {
    const vfs = makeVfs();
    expect(code(() => vfs.mkdir("a/b"))).toBe("ENOENT");
    vfs.mkdir("a/b", { parents: true });
    expect(vfs.isDir("a")).toBe(true);
    expect(code(() => vfs.mkdir("a"))).toBe("EEXIST");
    vfs.mkdir("a", { parents: true }); // no error, like mkdir -p
    expect(code(() => vfs.mkdir("etc/passwd", { parents: true }))).toBe("EEXIST");
  });
});

describe("Vfs permission bits", () => {
  it("chmod sets bits without touching mtime", () => {
    let t = T0;
    const vfs = makeVfs(() => t);
    t += 1000;
    vfs.chmod("etc/passwd", 0o640);
    expect(vfs.stat("etc/passwd")).toMatchObject({ mode: 0o640, mtime: T0 });
    vfs.chmod("etc", 0o700);
    expect(vfs.stat("etc").mode).toBe(0o700);
  });

  it("chmod rejects out-of-range modes and missing files", () => {
    const vfs = makeVfs();
    expect(code(() => vfs.chmod("etc/passwd", 0o10000))).toBe("EINVAL");
    expect(code(() => vfs.chmod("etc/passwd", -1))).toBe("EINVAL");
    expect(code(() => vfs.chmod("nope", 0o600))).toBe("ENOENT");
  });

  it("formats octal modes like stat -c %a", () => {
    expect(octalMode(0o644)).toBe("644");
    expect(octalMode(0o600)).toBe("600");
    expect(octalMode(0o40)).toBe("040");
    expect(octalMode(0o4755)).toBe("4755");
  });

  it("formats ls -l mode strings, including setuid/setgid/sticky", () => {
    expect(formatMode("file", 0o644)).toBe("-rw-r--r--");
    expect(formatMode("file", 0o646)).toBe("-rw-r--rw-");
    expect(formatMode("file", 0o440)).toBe("-r--r-----");
    expect(formatMode("dir", 0o755)).toBe("drwxr-xr-x");
    expect(formatMode("dir", 0o700)).toBe("drwx------");
    expect(formatMode("file", 0o4755)).toBe("-rwsr-xr-x");
    expect(formatMode("file", 0o2644)).toBe("-rw-r-Sr--");
    expect(formatMode("dir", 0o1777)).toBe("drwxrwxrwt");
    expect(formatMode("dir", 0o1776)).toBe("drwxrwxrwT");
  });
});
