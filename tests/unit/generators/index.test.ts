import { describe, expect, it } from "vitest";
import type { PbqTemplate } from "../../../shared/content";
import { generate, generators } from "../../../convex/generators";
import { expectValid } from "./helpers";

const TEMPLATES: PbqTemplate[] = ["sshLog", "nmap", "hashCheck", "permissions", "firewall"];

describe("generator registry", () => {
  it("has one generator per template", () => {
    expect(Object.keys(generators).sort()).toEqual([...TEMPLATES].sort());
  });

  it("generate() dispatches by template", () => {
    for (const template of TEMPLATES) {
      const g = generate(template, 2026);
      expect(g.template).toBe(template);
      expect(g.payload.template).toBe(template);
      expect(g).toEqual(generators[template](2026));
      expectValid(g);
    }
  });

  it("accepts any uint32 seed", () => {
    for (const template of TEMPLATES)
      for (const seed of [0, 1, 2 ** 31, 2 ** 32 - 1]) expectValid(generate(template, seed));
  });
});
