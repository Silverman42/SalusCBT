// Build the virtual ~/secplus-lab exactly as build-lab.sh does (T-701, LLD §13.2).
//
// The text files, directories and modes come from labSeed.json, which
// `npm run lab:seed` generates from content/source/build-lab.sh (a drift test
// keeps them in step). Lab B is rebuilt here on every call, like the script:
// four random installers, their real SHA-256 in vendor_hashes.txt, then
// `injected-payload` appended to one picked at random (LB-5).
//
// The script also writes the Lab B answer to `~/secplus-lab/.answer-lab-b`.
// That file is NOT created here (it would show up in `ls -la`); the tampered
// file name is returned in `LabSession.tamperedFile` for the Lab B check.
//
// Reset (LB-7) = call seedLab() again.

import type { LabSeed } from "../../../shared/labScript";
import seedJson from "./labSeed.json";
import { Vfs } from "./vfs";

export const LAB_SEED: LabSeed = seedJson;

/** The lab user. LLD §13.2 lists files as `root root`, so the user is root. */
export const LAB_USER = "root";
export const LAB_GROUP = "root";
export const LAB_HOME = "/root";
/** Absolute path of the lab directory (`~/secplus-lab`). */
export const LAB_ROOT = `${LAB_HOME}/${LAB_SEED.labDir}`;
/** Fixed mtime for every seeded file and directory: `Nov  3 09:14` (UTC). */
export const LAB_MTIME = Date.UTC(2026, 10, 3, 9, 14);

const HOME_MODE = 0o700;
const DIR_MODE = 0o755;
const INSTALLER_MODE = 0o644;
const HASH_FILE_MODE = 0o644;
/** crypto.getRandomValues fills at most 65,536 bytes per call. */
const RANDOM_CHUNK = 65_536;

export interface LabSession {
  vfs: Vfs;
  /** Installer name (in the downloads dir) that had the payload appended. */
  tamperedFile: string;
}

export interface SeedLabOptions {
  /** Fill a buffer with random bytes. Default: crypto.getRandomValues. */
  randomBytes?: (buf: Uint8Array<ArrayBuffer>) => void;
  /** Pick the victim from the `ls *.exe *.msi *.deb` names. Default: uniform. */
  pickVictim?: (names: readonly string[]) => string;
}

function cryptoRandomBytes(buf: Uint8Array<ArrayBuffer>): void {
  for (let i = 0; i < buf.length; i += RANDOM_CHUNK) {
    globalThis.crypto.getRandomValues(buf.subarray(i, i + RANDOM_CHUNK));
  }
}

function uniformPick(names: readonly string[]): string {
  // 2^32 is a multiple of 4, so this is unbiased for the four installers; the
  // bias for other counts is below 1e-9.
  const [n = 0] = globalThis.crypto.getRandomValues(new Uint32Array(1));
  const pick = names[n % names.length];
  if (pick === undefined) throw new Error("no installers to tamper with");
  return pick;
}

/** Lowercase hex SHA-256 of `bytes` (Web Crypto). */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new Uint8Array(bytes));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Bash-style `*.ext` expansion over a list of names: matches, sorted. */
function expandGlob(glob: string, names: readonly string[]): string[] {
  const suffix = glob.replace(/^\*/, "");
  if (glob === suffix || suffix.includes("*")) throw new Error(`unsupported glob ${glob}`);
  return names.filter((n) => n.endsWith(suffix)).sort();
}

export async function seedLab(options: SeedLabOptions = {}): Promise<LabSession> {
  const randomBytes = options.randomBytes ?? cryptoRandomBytes;
  const pickVictim = options.pickVictim ?? uniformPick;
  const seed = LAB_SEED;

  const vfs = new Vfs({ home: LAB_HOME, owner: LAB_USER, group: LAB_GROUP, now: () => LAB_MTIME });
  vfs.mkdir(LAB_HOME, { parents: true, mode: HOME_MODE });
  vfs.mkdir(LAB_ROOT, { mode: DIR_MODE });
  vfs.chdir(LAB_ROOT);

  for (const dir of seed.dirs) vfs.mkdir(dir, { parents: true, mode: DIR_MODE });
  for (const file of seed.files) vfs.writeFile(file.path, file.content, parseInt(file.mode, 8));

  // ---- Lab B: same steps as the script, in the same order ----
  const { installers } = seed;
  const dir = (name: string) => `${installers.dir}/${name}`;
  for (const name of installers.names) {
    const bytes = new Uint8Array(installers.bytes);
    randomBytes(bytes);
    vfs.writeFile(dir(name), bytes, INSTALLER_MODE);
  }
  const hashed = installers.hashGlobs.flatMap((g) => expandGlob(g, installers.names));
  const lines = await Promise.all(
    hashed.map(async (name) => `${await sha256Hex(vfs.readBytes(dir(name)))}  ${name}\n`),
  );
  vfs.writeFile(dir(installers.hashFile), lines.join(""), HASH_FILE_MODE);
  const candidates = [...new Set(hashed)].sort();
  const tamperedFile = pickVictim(candidates);
  if (!candidates.includes(tamperedFile)) throw new Error(`not an installer: ${tamperedFile}`);
  vfs.appendFile(dir(tamperedFile), new TextEncoder().encode(installers.tamperPayload));

  return { vfs, tamperedFile };
}
