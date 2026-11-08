// Shared pieces for the PBQ generators (LLD §10.3).
//
// Every generator is a pure, synchronous function of `(seed, options)`: the
// same seed always gives the same payload and key, so a generated question can
// be re-created (and its key re-checked) from the seed alone. All randomness
// comes from `rng(seed)` in ../lib/rng; never use Math.random or the clock.

import type { PayloadOf, PbqKey, PbqTemplate } from "../../shared/content";
import { rng } from "../lib/rng";

export type GeneratorOptions = {
  /** PBQ set: "A" gives part ids like `1a`, "B" gives `B1a` (the retake set). Default "A". */
  set?: "A" | "B";
};

export type Generated<T extends PbqTemplate> = {
  template: T;
  payload: PayloadOf<T>;
  key: PbqKey;
  /** Number of scored parts (or firewall rules), i.e. `questions.points` (ED-10). */
  points: number;
  /** Model-answer explanation for `answerKeys.explanation`. */
  explanation: string;
};

export type Generator<T extends PbqTemplate> = (
  seed: number,
  options?: GeneratorOptions,
) => Generated<T>;

/** Position of each template within a PBQ set (matches scripts/lib/pbq.ts). */
export const TEMPLATE_NUMBER: Record<PbqTemplate, number> = {
  sshLog: 1,
  nmap: 2,
  hashCheck: 3,
  permissions: 4,
  firewall: 5,
};

/** Part id for `letter` of `template` in `set`, e.g. `("nmap", "B", "a")` → `B2a`. */
export function partId(
  template: PbqTemplate,
  options: GeneratorOptions | undefined,
  letter: string,
) {
  return `${options?.set === "B" ? "B" : ""}${TEMPLATE_NUMBER[template]}${letter}`;
}

/** Seeded random helpers over mulberry32. */
export class Rand {
  private readonly next: () => number;

  constructor(seed: number) {
    this.next = rng(seed >>> 0);
  }

  /** Float in [0, 1). */
  float(): number {
    return this.next();
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("pick from an empty list");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  /** Fisher–Yates shuffle; returns a new array. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      const tmp = out[i] as T;
      out[i] = out[j] as T;
      out[j] = tmp;
    }
    return out;
  }

  /** `n` distinct items in random order. */
  sample<T>(items: readonly T[], n: number): T[] {
    if (n > items.length) throw new Error(`cannot sample ${n} of ${items.length}`);
    return this.shuffle(items).slice(0, n);
  }

  /** `n` distinct items, kept in their original order. */
  subset<T>(items: readonly T[], n: number): T[] {
    const indexes = Array.from(items, (_, i) => i);
    const chosen = new Set(this.sample(indexes, n));
    return items.filter((_, i) => chosen.has(i));
  }
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type LogDate = { month: number; day: number }; // month 0–11, day 1–28

export function randomDate(r: Rand): LogDate {
  return { month: r.int(0, 11), day: r.int(1, 28) };
}

const two = (n: number) => String(n).padStart(2, "0");

/** Syslog date, day padded with a space: `Nov  3`. */
export function syslogDate(d: LogDate): string {
  return `${MONTHS[d.month]} ${String(d.day).padStart(2, " ")}`;
}

/** ISO date: `2026-11-03`. */
export function isoDate(d: LogDate, year = 2026): string {
  return `${year}-${two(d.month + 1)}-${two(d.day)}`;
}

/** `hh:mm:ss` for seconds since midnight. */
export function clock(seconds: number): string {
  const s = ((seconds % 86400) + 86400) % 86400;
  return `${two(Math.floor(s / 3600))}:${two(Math.floor((s % 3600) / 60))}:${two(s % 60)}`;
}

/** `hh:mm` for seconds since midnight. */
export function clockHm(seconds: number): string {
  return clock(seconds).slice(0, 5);
}
