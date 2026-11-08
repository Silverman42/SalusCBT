// In-memory file tree for the browser terminal lab (T-701, LLD §13.1).
//
// Plain data only: no real file system, no eval, nothing leaves the page. Paths
// are POSIX-style; `~` is the lab user's home. Errors are thrown as VfsError
// with the errno-style code and the message coreutils would print, so commands
// can write e.g. `cat: nope: No such file or directory`.
//
// Permission bits are stored and reported (ls -l, stat, chmod) but not enforced:
// in the real lab the student owns every file, so nothing is ever refused.

export type FileContent = Uint8Array | string;

interface NodeMeta {
  /** Permission bits, 0o0000–0o7777. */
  mode: number;
  owner: string;
  group: string;
  /** Last modification, ms since the epoch (UTC). */
  mtime: number;
}

export interface FileNode extends NodeMeta {
  kind: "file";
  /** Text files are kept as strings; binary files (installers) as bytes. */
  content: FileContent;
}

export interface DirNode extends NodeMeta {
  kind: "dir";
}

export type VfsNode = FileNode | DirNode;

export interface VfsStat extends NodeMeta {
  /** Normalised absolute path. */
  path: string;
  /** Last path component (`/` for the root). */
  name: string;
  kind: VfsNode["kind"];
  /** Bytes for a file (UTF-8 for text); 4096 for a directory, as ext4 shows. */
  size: number;
}

export type VfsErrorCode = "ENOENT" | "ENOTDIR" | "EISDIR" | "EEXIST" | "EINVAL";

const MESSAGES: Record<VfsErrorCode, string> = {
  ENOENT: "No such file or directory",
  ENOTDIR: "Not a directory",
  EISDIR: "Is a directory",
  EEXIST: "File exists",
  EINVAL: "Invalid argument",
};

export class VfsError extends Error {
  constructor(
    readonly code: VfsErrorCode,
    /** The path as the user typed it. */
    readonly path: string,
  ) {
    super(MESSAGES[code]);
    this.name = "VfsError";
  }
}

export interface VfsOptions {
  /** Absolute home directory that `~` expands to. */
  home: string;
  /** Owner and group for new files and directories. */
  owner: string;
  group: string;
  /** Clock for mtimes; defaults to Date.now. */
  now?: () => number;
}

export const DEFAULT_FILE_MODE = 0o644;
export const DEFAULT_DIR_MODE = 0o755;
const DIR_SIZE = 4096;

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function contentBytes(content: FileContent): Uint8Array {
  return typeof content === "string" ? encoder.encode(content) : content;
}

export function contentText(content: FileContent): string {
  return typeof content === "string" ? content : decoder.decode(content);
}

/** `0o640` → `"640"`; setuid/setgid/sticky give a fourth digit (`"4755"`). */
export function octalMode(mode: number): string {
  return (mode & 0o7777).toString(8).padStart(3, "0");
}

/** `ls -l` mode column, e.g. `-rw-r--r--` or `drwxr-xr-x`. */
export function formatMode(kind: VfsNode["kind"], mode: number): string {
  const rwx = (bits: number, special: boolean, lower: string, upper: string) =>
    (bits & 4 ? "r" : "-") +
    (bits & 2 ? "w" : "-") +
    (special ? (bits & 1 ? lower : upper) : bits & 1 ? "x" : "-");
  return (
    (kind === "dir" ? "d" : "-") +
    rwx((mode >> 6) & 7, (mode & 0o4000) !== 0, "s", "S") +
    rwx((mode >> 3) & 7, (mode & 0o2000) !== 0, "s", "S") +
    rwx(mode & 7, (mode & 0o1000) !== 0, "t", "T")
  );
}

/** Join and normalise POSIX path segments; `..` above `/` stays at `/`. */
function normalise(path: string): string {
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") out.pop();
    else out.push(part);
  }
  return "/" + out.join("/");
}

function parentOf(abs: string): string {
  const i = abs.lastIndexOf("/");
  return i <= 0 ? "/" : abs.slice(0, i);
}

function baseName(abs: string): string {
  return abs === "/" ? "/" : abs.slice(abs.lastIndexOf("/") + 1);
}

export class Vfs {
  readonly home: string;
  readonly owner: string;
  readonly group: string;
  private readonly now: () => number;
  private readonly nodes = new Map<string, VfsNode>();
  private _cwd: string;

  constructor(options: VfsOptions) {
    this.home = normalise(options.home);
    this.owner = options.owner;
    this.group = options.group;
    this.now = options.now ?? Date.now;
    this.nodes.set("/", this.meta("dir", DEFAULT_DIR_MODE) as DirNode);
    this._cwd = "/";
  }

  get cwd(): string {
    return this._cwd;
  }

  /** `cwd` with the home prefix shown as `~`, for the prompt. */
  get displayCwd(): string {
    if (this._cwd === this.home) return "~";
    if (this._cwd.startsWith(this.home + "/")) return "~" + this._cwd.slice(this.home.length);
    return this._cwd;
  }

  /**
   * Absolute, normalised path for `path` as typed: `~` and `~/…` expand to the
   * home directory, `/…` is absolute, anything else is relative to `cwd`.
   * `.`/`..`, repeated and trailing slashes are folded. No existence check.
   */
  resolve(path: string, from: string = this._cwd): string {
    if (path === "~" || path.startsWith("~/")) return normalise(this.home + path.slice(1));
    if (path.startsWith("/")) return normalise(path);
    return normalise(from + "/" + path);
  }

  exists(path: string): boolean {
    return this.lookup(path) !== undefined;
  }

  stat(path: string): VfsStat {
    const abs = this.resolve(path);
    const node = this.get(path);
    return {
      path: abs,
      name: baseName(abs),
      kind: node.kind,
      mode: node.mode,
      owner: node.owner,
      group: node.group,
      mtime: node.mtime,
      size: node.kind === "dir" ? DIR_SIZE : contentBytes(node.content).length,
    };
  }

  isDir(path: string): boolean {
    return this.lookup(path)?.kind === "dir";
  }

  /** File content as stored (string for text, bytes for binaries). */
  read(path: string): FileContent {
    return this.file(path).content;
  }

  readBytes(path: string): Uint8Array {
    return contentBytes(this.read(path));
  }

  readText(path: string): string {
    return contentText(this.read(path));
  }

  /** Names of a directory's entries, sorted by byte order (no `.`/`..`). */
  list(path: string): string[] {
    const abs = this.resolve(path);
    const node = this.get(path);
    if (node.kind !== "dir") throw new VfsError("ENOTDIR", path);
    const prefix = abs === "/" ? "/" : abs + "/";
    const names: string[] = [];
    for (const key of this.nodes.keys()) {
      if (key !== abs && key.startsWith(prefix) && !key.slice(prefix.length).includes("/")) {
        names.push(key.slice(prefix.length));
      }
    }
    return names.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  }

  /** Create or overwrite a file. An existing file keeps its mode and owner. */
  writeFile(path: string, content: FileContent, mode: number = DEFAULT_FILE_MODE): void {
    const abs = this.resolve(path);
    const existing = this.nodes.get(abs);
    if (existing?.kind === "dir") throw new VfsError("EISDIR", path);
    this.requireParentDir(abs, path);
    if (existing) {
      existing.content = content;
      existing.mtime = this.now();
    } else {
      this.nodes.set(abs, { ...this.meta("file", mode), content } as FileNode);
    }
  }

  /** Append to a file (creating it if missing); bytes stay bytes. */
  appendFile(path: string, content: FileContent): void {
    const abs = this.resolve(path);
    const existing = this.nodes.get(abs);
    if (!existing) return this.writeFile(path, content);
    if (existing.kind === "dir") throw new VfsError("EISDIR", path);
    if (typeof existing.content === "string" && typeof content === "string") {
      existing.content += content;
    } else {
      const a = contentBytes(existing.content);
      const b = contentBytes(content);
      const joined = new Uint8Array(a.length + b.length);
      joined.set(a);
      joined.set(b, a.length);
      existing.content = joined;
    }
    existing.mtime = this.now();
  }

  /** `mkdir` (or `mkdir -p` with `parents`). */
  mkdir(path: string, options: { parents?: boolean; mode?: number } = {}): void {
    const abs = this.resolve(path);
    const mode = options.mode ?? DEFAULT_DIR_MODE;
    const existing = this.nodes.get(abs);
    if (existing) {
      if (options.parents && existing.kind === "dir") return;
      throw new VfsError("EEXIST", path);
    }
    if (options.parents) {
      const parent = parentOf(abs);
      if (!this.nodes.has(parent)) this.mkdir(parent, { parents: true });
    }
    this.requireParentDir(abs, path);
    this.nodes.set(abs, this.meta("dir", mode) as DirNode);
  }

  /** Set permission bits (0–0o7777). Like coreutils chmod, mtime is unchanged. */
  chmod(path: string, mode: number): void {
    if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) throw new VfsError("EINVAL", path);
    this.get(path).mode = mode;
  }

  /** Change directory; `cd` with no argument goes home. */
  chdir(path: string = "~"): void {
    const abs = this.resolve(path);
    const node = this.get(path);
    if (node.kind !== "dir") throw new VfsError("ENOTDIR", path);
    this._cwd = abs;
  }

  private meta(kind: VfsNode["kind"], mode: number) {
    return { kind, mode, owner: this.owner, group: this.group, mtime: this.now() };
  }

  /** Node at `path`, or undefined if nothing is there. */
  private lookup(path: string): VfsNode | undefined {
    return this.nodes.get(this.resolve(path));
  }

  /** Node at `path`; ENOTDIR when a parent is a file, else ENOENT if missing. */
  private get(path: string): VfsNode {
    const abs = this.resolve(path);
    const node = this.nodes.get(abs);
    if (node) return node;
    for (let p = parentOf(abs); p !== "/"; p = parentOf(p)) {
      const n = this.nodes.get(p);
      if (n?.kind === "file") throw new VfsError("ENOTDIR", path);
    }
    throw new VfsError("ENOENT", path);
  }

  private file(path: string): FileNode {
    const node = this.get(path);
    if (node.kind !== "file") throw new VfsError("EISDIR", path);
    return node;
  }

  private requireParentDir(abs: string, path: string): void {
    const parent = this.nodes.get(parentOf(abs));
    if (!parent) this.get(path); // throws ENOENT or ENOTDIR
    if (parent?.kind !== "dir") throw new VfsError("ENOTDIR", path);
  }
}
