// Answer normalisers (LLD §8.1, PB-1, EX-13).
//
// Pure functions that turn a student's input (or an answer key) into a
// canonical form before comparison. Each normaliser returns the canonical
// string, or `null` when the input is blank or not a valid value of that kind;
// `null` never equals anything. Marking is server-side only: never import this
// module from app/ (SE-1).

import type { PartKind } from "../../shared/content";

/** A part answer as stored in `responses.value` or `answerKeys.key`. */
export type PartAnswer = string | string[] | null | undefined;

const isString = (value: unknown): value is string => typeof value === "string";

/** Trimmed string, or `null` when not a string or blank. */
function trimmed(value: unknown): string | null {
  if (!isString(value)) return null;
  const t = value.trim();
  return t === "" ? null : t;
}

/** Valid dotted IPv4 (four decimal octets, 0–255) in canonical form, e.g. `010.0.2.15` → `10.0.2.15`. */
function ip(value: unknown): string | null {
  const t = trimmed(value);
  if (t === null || !/^\d{1,3}(\.\d{1,3}){3}$/.test(t)) return null;
  const octets = t.split(".").map(Number);
  return octets.every((n) => n <= 255) ? octets.join(".") : null;
}

/** Trimmed, internal whitespace collapsed to one space, lower-cased. */
function text(value: unknown): string | null {
  const t = trimmed(value);
  return t === null ? null : t.replace(/\s+/g, " ").toLowerCase();
}

/**
 * Trimmed, case-sensitive. The missing-`/etc/` allowance depends on the key,
 * so it lives in `pathEqual`, not here.
 */
function path(value: unknown): string | null {
  return trimmed(value);
}

/** Integer in canonical decimal form; `1,234` (correctly grouped) is accepted, `054` → `54`. */
function integer(value: unknown): string | null {
  const t = trimmed(value);
  if (t === null) return null;
  const match = /^(-?)(\d+|\d{1,3}(?:,\d{3})+)$/.exec(t);
  if (!match) return null;
  const digits = BigInt(match[2]!.replaceAll(",", "")).toString();
  return match[1] && digits !== "0" ? `-${digits}` : digits;
}

/** Octal permission mode matching `^0?[0-7]{3}$`, without the leading `0`: `0640` → `640`. */
function octal(value: unknown): string | null {
  const t = trimmed(value);
  if (t === null || !/^0?[0-7]{3}$/.test(t)) return null;
  return t.slice(-3);
}

/** Port 1–65535 in canonical decimal form, or `Any` (any case) → `Any`. */
function port(value: unknown): string | null {
  const t = trimmed(value);
  if (t === null) return null;
  if (t.toLowerCase() === "any") return "Any";
  if (!/^\d{1,5}$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= 65535 ? String(n) : null;
}

/** Exactly two valid ports, order kept (cleartext first, secure second). */
function portPair(value: unknown): [string, string] | null {
  if (!Array.isArray(value) || value.length !== 2) return null;
  const a = port(value[0]);
  const b = port(value[1]);
  return a !== null && b !== null ? [a, b] : null;
}

/** Choice / option id: exact match, no trimming or case folding. */
function id(value: unknown): string | null {
  return isString(value) && value !== "" ? value : null;
}

/** `/etc/shadow` matches `/etc/shadow`, and also `shadow` because the key is in `/etc`. */
function pathEqual(got: unknown, want: unknown): boolean {
  const g = path(got);
  const w = path(want);
  if (g === null || w === null) return false;
  return g === w || (w.startsWith("/etc/") && `/etc/${g}` === w);
}

const scalar = {
  ip,
  text,
  directive: text,
  integer,
  octal,
  port,
  pick: id,
  mcq: id,
} satisfies Record<Exclude<PartKind, "path" | "portPair">, (value: unknown) => string | null>;

/**
 * Does the student's answer `got` match the key `want` for a part of this kind?
 * Both sides go through the same normaliser; an invalid or blank value on
 * either side never matches.
 */
function equal(kind: PartKind, got: PartAnswer, want: PartAnswer): boolean {
  switch (kind) {
    case "path":
      return pathEqual(got, want);
    case "portPair": {
      const g = portPair(got);
      const w = portPair(want);
      return g !== null && w !== null && g[0] === w[0] && g[1] === w[1];
    }
    default: {
      const normalise = scalar[kind];
      const g = normalise(got);
      return g !== null && g === normalise(want);
    }
  }
}

export const norm = {
  ...scalar,
  path,
  portPair,
  equal,
} as const;
