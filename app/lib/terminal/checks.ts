// Lab A–C pass checks for the in-browser lab (T-706, LLD §13.2, LB-6).
//
// The page ships to the browser, and the lab answers (Part 6) are not meant to
// be readable in it (see shared/lab.ts). So the expected values are stored as
// salted SHA-256 digests and the student's normalised answer is hashed and
// compared. This keeps the answers out of the bundle as plain text; it is not
// a secret (a small answer such as `50` can be brute-forced), just "don't
// print the answer key on the page".
//
// - Lab A: answer entry (attacker IP, account, number of failed passwords).
// - Lab B: the installer the session tampered with (`LabSession.tamperedFile`,
//   random per reset, so nothing is shipped).
// - Lab C: the VFS state after the student's chmod/sed: `etc/shadow` and
//   `home/deploy/.ssh/id_rsa` modes and sshd's effective `PermitRootLogin`.
//
// tests/unit/terminal-checks.test.ts pins the digests to the Part 6 answers.

import { sha256Hex, LAB_ROOT } from "./seedLab";
import { octalMode, type Vfs } from "./vfs";

/** The labs with an in-browser check (Lab D runs on the student's machine). */
export type CheckedLab = "lab-a" | "lab-b" | "lab-c";

const encoder = new TextEncoder();

async function digest(scope: string, value: string): Promise<string> {
  return sha256Hex(encoder.encode(`${scope}:${value}`));
}

// ---------------------------------------------------------------- Lab A

export type LabAField = "ip" | "account" | "failures";
export type LabAAnswers = Record<LabAField, string>;

export const LAB_A_FIELDS: readonly LabAField[] = ["ip", "account", "failures"];

const LAB_A_DIGESTS: Record<LabAField, string> = {
  ip: "991c4adc33608a1234ad4a6487bcffb150b6ef612af644087d41f6cf744059e7",
  account: "20b18b8deb1731131596bc771448d214a1f0b54eefe911dff34426a01d504756",
  failures: "8ec8f42b97d3bb1ae9c05255b3440a527b99aa4c0861921df0d92236532f1313",
};

/** Normalise a typed Lab A answer: trims, lower-cases, drops leading zeros. */
export function normaliseLabA(field: LabAField, raw: string): string {
  const v = raw.trim().replace(/^["']|["']$/g, "");
  switch (field) {
    case "ip":
      return v.replace(/\s+/g, "");
    case "account":
      return v.toLowerCase();
    case "failures":
      return /^\d+$/.test(v) ? String(Number(v)) : v;
  }
}

export interface FieldResult {
  /** True when the answer matches. */
  ok: boolean;
  /** True when the field was left blank. */
  empty: boolean;
}

export async function checkLabA(answers: LabAAnswers): Promise<Record<LabAField, FieldResult>> {
  const out = {} as Record<LabAField, FieldResult>;
  for (const field of LAB_A_FIELDS) {
    const value = normaliseLabA(field, answers[field] ?? "");
    out[field] = {
      empty: value === "",
      ok: value !== "" && (await digest(`salus-lab-a:${field}`, value)) === LAB_A_DIGESTS[field],
    };
  }
  return out;
}

// ---------------------------------------------------------------- Lab B

/** Accepts `app.exe`, `./app.exe`, `downloads/app.exe` or a full path. */
export function checkLabB(answer: string, tamperedFile: string): FieldResult {
  const value = answer.trim().replace(/^["']|["']$/g, "");
  const base = value.slice(value.lastIndexOf("/") + 1);
  return { empty: base === "", ok: base !== "" && base === tamperedFile };
}

// ---------------------------------------------------------------- Lab C

export type LabCItem = "shadow" | "idRsa" | "permitRootLogin";

export interface LabCItemResult {
  item: LabCItem;
  /** The file, relative to ~/secplus-lab. */
  path: string;
  ok: boolean;
  /** What the lab holds now: an octal mode, a `PermitRootLogin` value, or a note. */
  current: string;
}

export const LAB_C_PATHS: Record<LabCItem, string> = {
  shadow: "etc/shadow",
  idRsa: "home/deploy/.ssh/id_rsa",
  permitRootLogin: "etc/ssh/sshd_config",
};

const LAB_C_DIGESTS: Record<LabCItem, string> = {
  shadow: "4b1ad24dfe2c35e552415e032f8f8325c082a5e7acb8fe5c491fbb4b7b8865e8",
  idRsa: "32e0c1fc285bda3e7a29c5035c62b05ac2cfd16c1ab998304e6d7209d531ac61",
  permitRootLogin: "8911d4178b0be270151b017be6d336594f351dcf0b4940987e0832e792dec1f9",
};

/**
 * The value sshd uses for `keyword`: the first directive outside a comment
 * (sshd keeps the first value it reads; keywords are case-insensitive, and
 * `Keyword value` or `Keyword=value` both work). Undefined if absent.
 */
export function sshdDirective(config: string, keyword: string): string | undefined {
  const want = keyword.toLowerCase();
  for (const raw of config.split("\n")) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    const m = /^(\S+?)(?:\s*=\s*|\s+)(.*)$/.exec(line);
    if (!m) continue;
    const key = m[1]!.toLowerCase();
    if (key === "match") return undefined; // later lines are conditional
    if (key === want) return m[2]!.trim().replace(/^"(.*)"$/, "$1");
  }
  return undefined;
}

export async function checkLabC(vfs: Vfs): Promise<LabCItemResult[]> {
  const results: LabCItemResult[] = [];
  for (const item of ["shadow", "idRsa"] as const) {
    const path = LAB_C_PATHS[item];
    let current = "missing";
    let ok = false;
    try {
      current = octalMode(vfs.stat(`${LAB_ROOT}/${path}`).mode);
      ok = (await digest(`salus-lab-c:mode:${path}`, current)) === LAB_C_DIGESTS[item];
    } catch {
      // A missing file fails the check; the student can reset the lab.
    }
    results.push({ item, path, ok, current });
  }

  const path = LAB_C_PATHS.permitRootLogin;
  let current = "missing";
  let ok = false;
  try {
    const value = sshdDirective(vfs.readText(`${LAB_ROOT}/${path}`), "PermitRootLogin");
    current = value ?? "not set";
    if (value !== undefined) {
      ok =
        (await digest("salus-lab-c:sshd:permitrootlogin", value.toLowerCase())) ===
        LAB_C_DIGESTS.permitRootLogin;
    }
  } catch {
    // Unreadable or missing config fails the check.
  }
  results.push({ item: "permitRootLogin", path, ok, current });
  return results;
}
