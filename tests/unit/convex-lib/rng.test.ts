import { describe, expect, it } from "vitest";
import { fnv1a32, questionSeed, rng, shuffled } from "../../../convex/lib/rng";

describe("rng (mulberry32)", () => {
  it("is deterministic and in [0, 1)", () => {
    const a = rng(42);
    const b = rng(42);
    for (let i = 0; i < 1000; i++) {
      const x = a();
      expect(x).toBe(b());
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it("matches the reference mulberry32 sequence (pins the algorithm)", () => {
    const next = rng(1);
    const seq = [next(), next(), next()];
    // Reference values for mulberry32(seed = 1).
    expect(seq).toEqual([0.6270739405881613, 0.002735721180215478, 0.5274470399599522]);
  });

  it("differs between seeds", () => {
    expect(rng(1)()).not.toBe(rng(2)());
  });
});

describe("shuffled (Fisher–Yates)", () => {
  const items = ["A", "B", "C", "D", "E", "F"];

  it("is deterministic for a given seed", () => {
    for (const seed of [0, 1, 7, 123456789, 0xffffffff]) {
      expect(shuffled(items, seed)).toEqual(shuffled(items, seed));
    }
  });

  it("returns a permutation and does not mutate the input", () => {
    const copy = items.slice();
    const out = shuffled(items, 99);
    expect(items).toEqual(copy);
    expect(out).not.toBe(items);
    expect([...out].sort()).toEqual(copy);
  });

  it("produces different orders across seeds", () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 50; seed++) orders.add(shuffled(items, seed).join(""));
    expect(orders.size).toBeGreaterThan(30);
  });

  it("is roughly uniform over positions", () => {
    const counts = [0, 0, 0, 0];
    const n = 20000;
    for (let seed = 0; seed < n; seed++) counts[shuffled([0, 1, 2, 3], seed).indexOf(0)]! += 1;
    for (const c of counts) expect(Math.abs(c / n - 0.25)).toBeLessThan(0.02);
  });

  it("handles empty and single-item arrays", () => {
    expect(shuffled([], 5)).toEqual([]);
    expect(shuffled(["x"], 5)).toEqual(["x"]);
  });
});

describe("fnv1a32 / questionSeed", () => {
  it("matches FNV-1a test vectors", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  it("derives a stable uint32 seed per question", () => {
    const s = questionSeed(0xdeadbeef, "k57abc");
    expect(s).toBe(questionSeed(0xdeadbeef, "k57abc"));
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(s)).toBe(true);
    expect(s).not.toBe(questionSeed(0xdeadbeef, "k57abd"));
    expect(s).not.toBe(questionSeed(0xdeadbeee, "k57abc"));
  });
});
