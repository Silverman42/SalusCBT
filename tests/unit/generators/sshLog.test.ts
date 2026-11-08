import { describe, expect, it } from "vitest";
import type { PayloadOf } from "../../../shared/content";
import { ATTACKER_RANGES, generateSshLog, sshLogAnswers } from "../../../convex/generators/sshLog";
import { SEEDS, expectDeterministic, expectSetB, expectValid, sourcePbq } from "./helpers";

const IP = /\b\d{1,3}(?:\.\d{1,3}){3}\b/g;
/** Documentation ranges (RFC 5737) and the internal 10.0.0.0/16. */
const ALLOWED = /^(203\.0\.113|198\.51\.100|192\.0\.2|10\.0\.\d{1,3})\.\d{1,3}$/;

const keyOf = (seed: number) => {
  const g = generateSshLog(seed);
  if (!("parts" in g.key)) throw new Error("expected a parts key");
  return { g, parts: g.key.parts as Record<string, string> };
};

describe("generateSshLog", () => {
  it("is deterministic per seed", () => expectDeterministic(generateSshLog));

  it("passes validation and full-marks the key for 1,000 seeds", () => {
    for (const seed of SEEDS) expectValid(generateSshLog(seed));
  });

  it("supports set B part ids", () => expectSetB(generateSshLog, 1));

  it("only uses documentation or internal IP ranges", () => {
    for (const seed of SEEDS) {
      const { g, parts } = keyOf(seed);
      for (const ip of g.payload.log.match(IP) ?? []) expect(ip).toMatch(ALLOWED);
      expect(ATTACKER_RANGES.some((r) => parts["1a"]!.startsWith(`${r}.`))).toBe(true);
    }
  });

  it("recomputes the key from the log text", () => {
    for (const seed of SEEDS) {
      const { g, parts } = keyOf(seed);
      const lines = g.payload.log.split("\n");
      const ip = parts["1a"]!;
      const failed = lines.filter(
        (l) => l.includes("Failed password") && l.includes(` from ${ip} port `),
      );
      expect(String(failed.length)).toBe(parts["1c"]);
      expect(failed.length).toBeGreaterThanOrEqual(40);
      expect(failed.length).toBeLessThanOrEqual(60);

      const accepted = lines.filter((l) => l.includes("Accepted password") && l.includes(ip));
      expect(accepted).toHaveLength(1);
      expect(accepted[0]).toContain(`Accepted password for ${parts["1b"]} from ${ip} port`);

      // Over-count trap: grep IP | wc -l also counts the "Invalid user" lines.
      expect(lines.filter((l) => l.includes(ip)).length).toBeGreaterThan(failed.length);
      expect(sshLogAnswers(g.payload.log)).toEqual({
        ip,
        account: parts["1b"],
        failures: failed.length,
      });
    }
  });

  it("includes the decoys and benign lines, in time order", () => {
    for (const seed of SEEDS.slice(0, 200)) {
      const { g } = keyOf(seed);
      const log = g.payload.log;
      expect(log.split("\n")[0]).toMatch(/^analyst@\S+:~\$ cat \/var\/log\/auth\.log$/);
      expect(log).toMatch(/CRON\[\d+\]: pam_unix\(cron:session\): session opened for user root/);
      expect(log).toMatch(/Accepted publickey for \S+ from 10\.0\.2\.\d+ port \d+ ssh2/);
      // A scanner (invalid users only) and a mistyping internal user who gets in.
      const sources = new Set(
        [...log.matchAll(/Failed password for .* from (\S+) port/g)].map((m) => m[1]),
      );
      expect(sources.size).toBe(3);
      expect(log).toMatch(/Accepted password for \S+ from 10\.0\.\d+\.\d+ port/);

      const times = log
        .split("\n")
        .slice(1)
        .map((l) => /^\w{3} [ \d]\d (\d\d:\d\d:\d\d) /.exec(l)![1]!);
      expect(times).toEqual([...times].sort());
    }
  });

  it("matches the shape of the source PBQ 1", () => {
    const { question } = sourcePbq("1");
    const real = question.payload as PayloadOf<"sshLog">;
    const g = generateSshLog(7);
    expect(
      g.payload.parts.map(({ id, kind, scored, prompt }) => ({ id, kind, scored, prompt })),
    ).toEqual(real.parts.map(({ id, kind, scored, prompt }) => ({ id, kind, scored, prompt })));
    expect(g.points).toBe(question.points);
    expect(Object.keys((g.key as { practice: object }).practice)).toEqual(["1d"]);

    // The answer finder agrees with the hand-written key on the real logs.
    for (const n of ["1", "B1"]) {
      const src = sourcePbq(n);
      const parts = (src.key.parts as { parts: Record<string, string> }).parts;
      const answers = sshLogAnswers((src.question.payload as PayloadOf<"sshLog">).log);
      expect(answers).toEqual({
        ip: parts[`${n}a`],
        account: parts[`${n}b`],
        failures: Number(parts[`${n}c`]),
      });
    }
  });

  it("returns null when the log has no clear attacker", () => {
    expect(sshLogAnswers("")).toBeNull();
    const tie = [
      "Failed password for root from 203.0.113.5 port 1 ssh2",
      "Failed password for root from 198.51.100.5 port 1 ssh2",
      "Accepted password for root from 203.0.113.5 port 2 ssh2",
    ].join("\n");
    expect(sshLogAnswers(tie)).toBeNull();
  });
});
