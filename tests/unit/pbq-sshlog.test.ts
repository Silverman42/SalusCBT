import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { PayloadOf } from "../../shared/content";
import { matchLabel, searchLog, splitLog, stepMatch } from "../../app/lib/pbq/sshLog";
type SeedQuestion = { displayNumber: string; payload?: { template: string } };
const seed = JSON.parse(readFileSync("content/seed/sy0-701.json", "utf8")) as {
  questions: SeedQuestion[];
};
const sshPayload = (n: string) =>
  seed.questions.find((q) => q.displayNumber === n)?.payload as PayloadOf<"sshLog">;

describe("splitLog", () => {
  it("splits on newlines and ignores one trailing newline", () => {
    expect(splitLog("a\nb\n")).toEqual(["a", "b"]);
    expect(splitLog("a\r\nb")).toEqual(["a", "b"]);
    expect(splitLog("")).toEqual([""]);
  });
});

describe("searchLog", () => {
  const lines = ["Failed password for root", "Accepted publickey", "failed FAILED"];

  it("leaves lines whole with no query", () => {
    const r = searchLog(lines, "");
    expect(r.count).toBe(0);
    expect(r.lines.every((l) => !l.hit && l.segments.length === 1)).toBe(true);
    expect(r.lines.map((l) => l.n)).toEqual([1, 2, 3]);
  });

  it("matches case-insensitively, keeps the original text and numbers matches in order", () => {
    const r = searchLog(lines, "failed");
    expect(r.count).toBe(3);
    expect(r.lines[0]?.segments).toEqual([
      { text: "Failed", match: 0 },
      { text: " password for root", match: null },
    ]);
    expect(r.lines[1]?.hit).toBe(false);
    expect(r.lines[2]?.segments).toEqual([
      { text: "failed", match: 1 },
      { text: " ", match: null },
      { text: "FAILED", match: 2 },
    ]);
  });

  it("treats the query literally (no regex) and never overlaps", () => {
    expect(searchLog(["a.b axb"], ".").count).toBe(1);
    expect(searchLog(["aaaa"], "aa").count).toBe(2);
    expect(searchLog(["(uid=0)"], "(uid=0)").count).toBe(1);
  });

  it("rebuilds every line from its segments", () => {
    const log = splitLog(sshPayload("1").log);
    const r = searchLog(log, "sshd");
    expect(r.lines.map((l) => l.segments.map((s) => s.text).join(""))).toEqual(log);
  });

  it("finds the set A and set B attacker entries in the seed logs", () => {
    for (const n of ["1", "B1"]) {
      const log = splitLog(sshPayload(n).log);
      expect(log.length).toBeGreaterThan(100);
      expect(searchLog(log, "Failed password").count).toBeGreaterThan(0);
    }
    // The count a student reads off the badge equals the lines holding the phrase.
    const log = splitLog(sshPayload("1").log);
    const r = searchLog(log, "failed password");
    expect(r.count).toBe(log.filter((l) => l.includes("Failed password")).length);
    expect(r.lines.filter((l) => l.hit)).toHaveLength(r.count);
  });
});

describe("stepMatch", () => {
  it("starts at the first or last match and wraps", () => {
    expect(stepMatch(null, 3, 1)).toBe(0);
    expect(stepMatch(null, 3, -1)).toBe(2);
    expect(stepMatch(2, 3, 1)).toBe(0);
    expect(stepMatch(0, 3, -1)).toBe(2);
    expect(stepMatch(1, 3, 1)).toBe(2);
  });
  it("is null with no matches and resets when out of range", () => {
    expect(stepMatch(0, 0, 1)).toBeNull();
    expect(stepMatch(5, 2, 1)).toBe(0);
  });
});

describe("matchLabel", () => {
  it("describes the count and the current match", () => {
    expect(matchLabel(null, 0)).toBe("No matches");
    expect(matchLabel(null, 1)).toBe("1 match");
    expect(matchLabel(null, 50)).toBe("50 matches");
    expect(matchLabel(2, 50)).toBe("3 of 50");
  });
});
