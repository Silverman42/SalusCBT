// Shared checks for the PBQ generator tests (LLD §10.3).

import { readFileSync } from "node:fs";
import { expect } from "vitest";
import type { AnswerValue, PbqPayload, PbqTemplate } from "../../../shared/content";
import { validatePayload, validatePbqKey } from "../../../shared/validate";
import { scoreQuestion } from "../../../convex/marking/score";
import type { Generated, Generator } from "../../../convex/generators/common";
import { parseExam } from "../../../scripts/lib/parseExam";
import type { SeedExam, SeedPbq } from "../../../scripts/lib/types";

export const SEEDS = Array.from({ length: 1000 }, (_, i) => i * 7919 + 1);

/** The answer a student who matched the key exactly would save. */
export function correctAnswer<T extends PbqTemplate>(g: Generated<T>): AnswerValue {
  if ("rules" in g.key) return { kind: "firewall", rules: g.key.rules };
  return { kind: "pbq", parts: g.key.parts };
}

/** Validators pass, `points` matches, and the key's own answer earns full marks. */
export function expectValid<T extends PbqTemplate>(g: Generated<T>) {
  const payload = validatePayload(g.template, g.payload);
  if (!payload.ok) throw new Error(JSON.stringify(payload.errors));
  const key = validatePbqKey(payload.value, g.key);
  if (!key.ok) throw new Error(JSON.stringify(key.errors));

  const p: PbqPayload = g.payload;
  const scored =
    p.template === "firewall"
      ? p.rules.length
      : p.parts.filter((p) => !("scored" in p) || p.scored).length;
  expect(g.points).toBe(scored);
  expect(g.explanation.trim()).not.toBe("");

  const score = scoreQuestion(
    { kind: "pbq", domain: "4.0", points: g.points, template: g.template, payload: g.payload },
    { parts: g.key },
    correctAnswer(g),
  );
  expect(score).toMatchObject({ earned: g.points, max: g.points });
}

/** Same seed → identical output; different seeds → (all) different output. */
export function expectDeterministic<T extends PbqTemplate>(generate: Generator<T>) {
  for (const seed of [0, 1, 42, 0xffffffff, 123456789]) {
    expect(generate(seed)).toEqual(generate(seed));
    expect(JSON.stringify(generate(seed, { set: "B" }))).toBe(
      JSON.stringify(generate(seed, { set: "B" })),
    );
  }
  const outputs = new Set(Array.from({ length: 200 }, (_, seed) => JSON.stringify(generate(seed))));
  expect(outputs.size).toBe(200);
}

/** Set B uses `B`-prefixed part ids; everything else is the same. */
export function expectSetB<T extends PbqTemplate>(generate: Generator<T>, number: number) {
  const a = generate(99);
  const b = generate(99, { set: "B" });
  expectValid(b);
  if ("parts" in a.payload && "parts" in b.payload) {
    expect(a.payload.parts.map((p) => p.id).every((id) => id.startsWith(String(number)))).toBe(
      true,
    );
    expect(b.payload.parts.map((p) => p.id)).toEqual(a.payload.parts.map((p) => `B${p.id}`));
  }
}

let exam: SeedExam | undefined;

/** The parsed default content (Parts 1/4/6). */
export function sourceExam(): SeedExam {
  if (!exam) {
    const result = parseExam(readFileSync("content/source/secplus-701-mock-exam.md", "utf8"));
    if (!result.ok) throw new Error("source exam does not parse");
    exam = result.exam;
  }
  return exam;
}

export function sourcePbq(displayNumber: string) {
  const e = sourceExam();
  const question = e.questions.find(
    (q): q is SeedPbq => q.kind === "pbq" && q.displayNumber === displayNumber,
  )!;
  const key = e.answerKeys.find((k) => k.displayNumber === displayNumber)!;
  return { question, key };
}
