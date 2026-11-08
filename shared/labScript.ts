// T-701: read content/source/build-lab.sh into plain data for the browser lab.
//
// The parser understands only the statement forms build-lab.sh uses (heredocs,
// printf/touch redirects, chmod, the Lab B installer loop). Any other line is an
// error, so a change to the script fails `npm run lab:seed` and the drift test
// instead of silently leaving the virtual lab out of step.
//
// The output is the files the script writes, nothing more. The Lab B answer file
// (`echo "$victim" > "$LAB/.answer-lab-b"`) is recorded by name only so the seed
// can leave it out; the tampered file is chosen at random by seedLab().

export interface LabSeedFile {
  /** Path relative to the lab directory, e.g. `etc/shadow`. */
  path: string;
  content: string;
  /** Octal permission bits as the script leaves them, e.g. `"644"`. */
  mode: string;
}

export interface LabSeedInstallers {
  /** Directory (relative to the lab) the installers are written to. */
  dir: string;
  names: string[];
  /** Size of each random installer, from `head -c N /dev/urandom`. */
  bytes: number;
  /** File the vendor hashes are written to, relative to `dir`. */
  hashFile: string;
  /** Globs passed to `sha256sum`, in order (they set the line order). */
  hashGlobs: string[];
  /** Bytes appended to the one tampered installer. */
  tamperPayload: string;
}

export interface LabSeed {
  /** Lab directory name under `$HOME`, e.g. `secplus-lab`. */
  labDir: string;
  /** Directories the script creates, relative to the lab, parents first. */
  dirs: string[];
  /** Text files in the order the script writes them. */
  files: LabSeedFile[];
  installers: LabSeedInstallers;
  /** The hidden Lab B answer file the script writes; never put in the VFS. */
  answerFile: string;
}

export class LabScriptError extends Error {
  constructor(
    readonly line: number,
    message: string,
  ) {
    super(`build-lab.sh:${line}: ${message}`);
    this.name = "LabScriptError";
  }
}

/** Mode a new file gets under the usual umask 022. */
const DEFAULT_FILE_MODE = "644";

/** Expand one `{a,b,c}` group (no nesting): `x/{a,b}` → `x/a`, `x/b`. */
function expandBraces(word: string): string[] {
  const m = /^(.*?)\{([^{}]*)\}(.*)$/.exec(word);
  if (!m) return [word];
  const [, pre = "", body = "", post = ""] = m;
  return body.split(",").flatMap((part) => expandBraces(pre + part + post));
}

/** `printf` format with the escapes the script uses; anything else is rejected. */
function printfText(fmt: string, line: number): string {
  if (fmt.includes("%")) throw new LabScriptError(line, "printf conversions are not supported");
  return fmt.replace(/\\(.)/g, (_, c: string) => {
    if (c === "n") return "\n";
    if (c === "t") return "\t";
    if (c === "\\") return "\\";
    throw new LabScriptError(line, `unsupported printf escape \\${c}`);
  });
}

function normalise(parts: string[]): string {
  const out: string[] = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

export function parseLabScript(source: string): LabSeed {
  const lines = source.split("\n");
  let labDir: string | null = null;
  const dirs = new Set<string>();
  const files = new Map<string, LabSeedFile>();
  let cwd = ""; // relative to the lab, once `cd "$LAB"` has run
  let inLab = false;
  let installerNames: string[] | null = null;
  let installerBytes: number | null = null;
  let installerDir: string | null = null;
  let hashFile: string | null = null;
  let hashGlobs: string[] | null = null;
  let tamperPayload: string | null = null;
  let answerFile: string | null = null;

  const rel = (path: string, line: number): string => {
    const lab = /^(?:"\$LAB"\/|"\$LAB\/)(.*?)"?$/.exec(path);
    if (lab) return normalise((lab[1] ?? "").split("/"));
    const p = path.replace(/^"(.*)"$/, "$1");
    if (p.includes("$") || p.startsWith("/") || p.startsWith("~")) {
      throw new LabScriptError(line, `unsupported path ${path}`);
    }
    if (!inLab) throw new LabScriptError(line, `relative path ${path} before cd "$LAB"`);
    return normalise([...cwd.split("/"), ...p.split("/")]);
  };

  const addDir = (path: string) => {
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) dirs.add(parts.slice(0, i).join("/"));
  };

  const writeFile = (path: string, content: string, line: number) => {
    const dir = path.split("/").slice(0, -1).join("/");
    if (dir !== "" && !dirs.has(dir)) throw new LabScriptError(line, `no directory for ${path}`);
    const existing = files.get(path);
    if (existing) existing.content = content;
    else files.set(path, { path, content, mode: DEFAULT_FILE_MODE });
  };

  const chmod = (mode: string, path: string, line: number) => {
    const file = files.get(rel(path, line));
    if (!file) throw new LabScriptError(line, `chmod on unknown file ${path}`);
    file.mode = mode.replace(/^0(?=\d{3}$)/, "");
  };

  /** One simple command (no `&&`). */
  const run = (cmd: string, line: number) => {
    let m: RegExpExecArray | null;
    if ((m = /^LAB="\$HOME\/([\w.-]+)"$/.exec(cmd))) {
      labDir = m[1] ?? null;
    } else if (cmd === 'rm -rf "$LAB"') {
      dirs.clear();
      files.clear();
    } else if ((m = /^mkdir -p (\S+)$/.exec(cmd))) {
      const word = m[1] ?? "";
      if (word === '"$LAB"') return;
      for (const d of expandBraces(word)) addDir(rel(d, line));
    } else if (cmd === 'cd "$LAB"') {
      inLab = true;
      cwd = "";
    } else if ((m = /^cd (\S+)$/.exec(cmd))) {
      const target = rel(m[1] ?? "", line);
      if (target !== "" && !dirs.has(target))
        throw new LabScriptError(line, `cd to unknown ${target}`);
      cwd = target;
    } else if ((m = /^chmod (0?[0-7]{3}) (\S+)$/.exec(cmd))) {
      chmod(m[1] ?? "", m[2] ?? "", line);
    } else if ((m = /^printf (?:-- )?'([^']*)' > (\S+)$/.exec(cmd))) {
      writeFile(rel(m[2] ?? "", line), printfText(m[1] ?? "", line), line);
    } else if ((m = /^touch (\S+)$/.exec(cmd))) {
      const path = rel(m[1] ?? "", line);
      if (!files.has(path)) writeFile(path, "", line);
    } else if ((m = /^sha256sum ((?:\*\.\w+ ?)+) > (\S+)$/.exec(cmd))) {
      hashGlobs = (m[1] ?? "").trim().split(" ");
      hashFile = m[2] ?? null;
      if (installerDir !== cwd)
        throw new LabScriptError(line, "sha256sum outside the installer dir");
    } else if (/^victim=\$\(ls (?:\*\.\w+ ?)+\| shuf -n1\)$/.test(cmd)) {
      // The random pick is made by seedLab().
    } else if ((m = /^printf '([^']*)' >> "\$victim"$/.exec(cmd))) {
      tamperPayload = printfText(m[1] ?? "", line);
    } else if ((m = /^echo "\$victim" > (\S+)$/.exec(cmd))) {
      answerFile = rel(m[1] ?? "", line);
    } else if (/^echo "[^"]*"$/.test(cmd)) {
      // Status message only.
    } else {
      throw new LabScriptError(line, `unsupported command: ${cmd}`);
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    const text = (lines[i] ?? "").trim();
    if (text === "" || text.startsWith("#") || text === "set -e") continue;

    // cat > path <<'EOF' … EOF (quoted delimiter: no expansion).
    const heredoc = /^cat > (\S+) <<'(\w+)'$/.exec(text);
    if (heredoc) {
      const delim = heredoc[2] ?? "";
      const body: string[] = [];
      let j = i + 1;
      for (; j < lines.length && lines[j] !== delim; j++) body.push(lines[j] ?? "");
      if (j >= lines.length) throw new LabScriptError(lineNo, `heredoc ${delim} is not closed`);
      writeFile(rel(heredoc[1] ?? "", lineNo), body.map((l) => `${l}\n`).join(""), lineNo);
      i = j;
      continue;
    }

    // for f in a b c; do head -c N /dev/urandom > "$f"; done
    const loop = /^for f in ([^;]+); do$/.exec(text);
    if (loop) {
      const head = /^head -c (\d+) \/dev\/urandom > "\$f"$/.exec((lines[i + 1] ?? "").trim());
      if (!head || (lines[i + 2] ?? "").trim() !== "done") {
        throw new LabScriptError(lineNo, "unsupported for loop");
      }
      installerNames = (loop[1] ?? "").trim().split(/\s+/);
      installerBytes = Number(head[1]);
      installerDir = cwd;
      i += 2;
      continue;
    }

    for (const cmd of text.split(" && ")) run(cmd.trim(), lineNo);
  }

  if (labDir === null) throw new LabScriptError(1, "no LAB= line");
  if (
    installerNames === null ||
    installerBytes === null ||
    installerDir === null ||
    hashFile === null ||
    hashGlobs === null ||
    tamperPayload === null
  ) {
    throw new LabScriptError(lines.length, "Lab B installer block is incomplete");
  }
  if (answerFile === null) throw new LabScriptError(lines.length, "no Lab B answer file");

  return {
    labDir,
    dirs: [...dirs].sort(),
    files: [...files.values()],
    installers: {
      dir: installerDir,
      names: installerNames,
      bytes: installerBytes,
      hashFile,
      hashGlobs,
      tamperPayload,
    },
    answerFile,
  };
}
