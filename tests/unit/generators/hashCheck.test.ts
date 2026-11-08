import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import type { McqPart, PayloadOf, PickPart } from "../../../shared/content";
import { KEPT, generateHashCheck, hashCheckTampered } from "../../../convex/generators/hashCheck";
import { sha256Hex } from "../../../convex/generators/sha256";
import { SEEDS, expectDeterministic, expectSetB, expectValid, sourcePbq } from "./helpers";

const lines = (text: string) =>
  [...text.matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)].map((m) => ({ hash: m[1]!, file: m[2]! }));

describe("sha256Hex", () => {
  it("matches node:crypto", () => {
    const inputs = [
      "",
      "abc",
      "a".repeat(55),
      "a".repeat(56),
      "a".repeat(64),
      "é ✓ 漢字",
      "x".repeat(1000),
    ];
    for (let i = 0; i < 200; i++)
      inputs.push(`file-${i}\n${(i * 2654435761) >>> 0}\n`.repeat(i % 7));
    for (const s of inputs) expect(sha256Hex(s)).toBe(createHash("sha256").update(s).digest("hex"));
  });
});

describe("generateHashCheck", () => {
  it("is deterministic per seed", () => expectDeterministic(generateHashCheck));

  it("passes validation and full-marks the key for 1,000 seeds", () => {
    for (const seed of SEEDS) expectValid(generateHashCheck(seed));
  });

  it("supports set B part ids", () => expectSetB(generateHashCheck, 3));

  it("tampers exactly one of four files, keeping the first and last 6 characters", () => {
    const tamperedAt = new Set<number>();
    for (const seed of SEEDS) {
      const g = generateHashCheck(seed);
      const vendor = lines(g.payload.vendorHashes);
      const computed = lines(g.payload.computed);
      expect(vendor).toHaveLength(4);
      expect(computed.map((l) => l.file)).toEqual(vendor.map((l) => l.file));
      expect(new Set(vendor.map((l) => l.hash)).size).toBe(4);

      const bad = vendor.flatMap((v, i) => (computed[i]!.hash === v.hash ? [] : [i]));
      expect(bad).toHaveLength(1);
      const i = bad[0]!;
      tamperedAt.add(i);
      const want = vendor[i]!.hash;
      const got = computed[i]!.hash;
      expect(got.slice(0, KEPT)).toBe(want.slice(0, KEPT));
      expect(got.slice(-KEPT)).toBe(want.slice(-KEPT));
      // Exactly 6: the next character in from each end differs.
      expect(got[KEPT]).not.toBe(want[KEPT]);
      expect(got.at(-KEPT - 1)).not.toBe(want.at(-KEPT - 1));

      const parts = (g.key as { parts: Record<string, string> }).parts;
      const [pick, action, goal] = g.payload.parts as [PickPart, McqPart, McqPart];
      expect(parts[pick.id]).toBe(vendor[i]!.file);
      expect(hashCheckTampered(g.payload.vendorHashes, g.payload.computed)).toEqual([
        vendor[i]!.file,
      ]);
      expect(pick.choices).toEqual(vendor.map((l) => l.file));
      expect(action.options.find((o) => o.id === parts[action.id])!.text).toMatch(/^Quarantine it/);
      expect(goal.options.find((o) => o.id === parts[goal.id])!.text).toBe("Integrity");

      // The command lines match the source layout.
      expect(g.payload.vendorHashes.split("\n")[0]).toMatch(
        /:~\/downloads\$ cat vendor_hashes\.txt$/,
      );
      expect(g.payload.computed.split("\n")[0]).toContain(
        `$ sha256sum ${vendor.map((l) => l.file).join(" ")}`,
      );
    }
    expect(tamperedAt).toEqual(new Set([0, 1, 2, 3]));
  });

  it("matches the shape of the source PBQ 3, and finds its tampered files", () => {
    const real = sourcePbq("3").question.payload as PayloadOf<"hashCheck">;
    const g = generateHashCheck(11).payload;
    expect(g.intro).toBe(real.intro);
    expect(g.parts.map(({ id, kind, prompt }) => ({ id, kind, prompt }))).toEqual(
      real.parts.map(({ id, kind, prompt }) => ({ id, kind, prompt })),
    );
    const texts = (p: McqPart) => p.options.map((o) => o.text).sort();
    expect(texts(g.parts[1] as McqPart)).toEqual(texts(real.parts[1] as McqPart));
    expect(texts(g.parts[2] as McqPart)).toEqual(texts(real.parts[2] as McqPart));

    for (const n of ["3", "B3"]) {
      const src = sourcePbq(n);
      const p = src.question.payload as PayloadOf<"hashCheck">;
      const key = (src.key.parts as { parts: Record<string, string> }).parts;
      expect(hashCheckTampered(p.vendorHashes, p.computed)).toEqual([key[`${n}a`]]);
    }
  });
});
