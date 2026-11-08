import { describe, expect, it } from "vitest";
import type { PayloadOf } from "../../../shared/content";
import { scoreQuestion } from "../../../convex/marking/score";
import { generateFirewall } from "../../../convex/generators/firewall";
import { SEEDS, expectDeterministic, expectValid, sourcePbq } from "./helpers";

type Rules = { rules: { port: string; action: "ALLOW" | "DENY" }[] };

describe("generateFirewall", () => {
  it("is deterministic per seed", () => expectDeterministic(generateFirewall));

  it("passes validation and full-marks the key for 1,000 seeds", () => {
    for (const seed of SEEDS) expectValid(generateFirewall(seed));
  });

  it("ends with Any / DENY and offers the answers plus distractors", () => {
    const scenarios = new Set<string>();
    for (const seed of SEEDS) {
      const g = generateFirewall(seed);
      const { rules: keyRules } = g.key as Rules;
      const p = g.payload;
      scenarios.add(p.requirements.some((r) => r.includes("SMTP")) ? "mail" : "web");

      expect(p.rules.at(-1)).toEqual({ source: "Any", destination: "Any", protocol: "TCP" });
      expect(keyRules.at(-1)).toEqual({ port: "Any", action: "DENY" });
      expect(keyRules.slice(0, -1).every((r) => r.action === "ALLOW")).toBe(true);
      expect(p.requirements).toHaveLength(p.rules.length);
      expect(p.requirements.at(-1)).toBe("Everything else is blocked.");
      expect(p.actionChoices).toEqual(["ALLOW", "DENY"]);

      const answers = new Set(keyRules.map((r) => r.port));
      expect(p.portChoices).toEqual(expect.arrayContaining([...answers]));
      expect(p.portChoices[0]).toBe("Any");
      expect(p.portChoices).toHaveLength(7);
      const wrong = p.portChoices.filter((c) => !answers.has(c));
      expect(wrong).toHaveLength(3);
      const numeric = p.portChoices.slice(1).map(Number);
      expect(numeric).toEqual([...numeric].sort((a, b) => a - b));

      // Each allow rule's destination appears in the diagram.
      for (const rule of p.rules.slice(0, -1)) expect(p.diagram).toContain(rule.destination);
      if (p.requirements.some((r) => r.includes("encrypted"))) {
        // Mail: both cleartext retrieval ports are offered as traps.
        expect(wrong).toEqual(expect.arrayContaining(["110", "143"]));
      } else {
        expect(wrong).toContain("80");
      }
    }
    expect(scenarios).toEqual(new Set(["web", "mail"]));
  });

  it("a wrong port or action loses that rule only", () => {
    const g = generateFirewall(3);
    const { rules } = g.key as Rules;
    const q = {
      kind: "pbq" as const,
      domain: "3.0" as const,
      points: g.points,
      payload: g.payload,
    };
    const wrongPort = g.payload.portChoices.find((c) => !rules.some((r) => r.port === c))!;
    const answer = rules.map((r, i) => (i === 0 ? { port: wrongPort, action: r.action } : r));
    expect(scoreQuestion(q, { parts: g.key }, { kind: "firewall", rules: answer })).toMatchObject({
      earned: g.points - 1,
      max: g.points,
    });
  });

  it("matches the shape of the source PBQs 5 and B5", () => {
    for (const n of ["5", "B5"]) {
      const real = sourcePbq(n).question.payload as PayloadOf<"firewall">;
      const g = generateFirewall(n === "5" ? 1 : 2).payload;
      expect(g.intro).toBe(real.intro);
      expect(g.rules).toHaveLength(real.rules.length);
      expect(g.portChoices).toHaveLength(real.portChoices.length);
      expect(g.actionChoices).toEqual(real.actionChoices);
    }
  });
});
