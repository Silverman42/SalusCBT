// T-109: seed.importExam loads the committed seed as the published default
// version (Stage 1 gate), and a second run creates version 2 (LLD §6.3, ED-4).

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { internal } from "../../convex/_generated/api";
import { DEFAULT_EXAM_TITLE } from "../../convex/seed";
import type { SeedExam } from "../../scripts/lib/types";
import seedJson from "../../content/seed/sy0-701.json";
import { setup } from "./lib/fixtures";

const seed = seedJson as SeedExam;
const clone = (): SeedExam => structuredClone(seed);

/** Fields a `questions` row may have; anything else could leak a key (SE-1). */
const QUESTION_FIELDS = new Set([
  "_id",
  "_creationTime",
  "versionId",
  "order",
  "section",
  "displayNumber",
  "kind",
  "domain",
  "points",
  "stem",
  "options",
  "chooseCount",
  "template",
  "payload",
]);
const KEY_WORDS = new Set(["correct", "explanation", "practice", "answer", "key"]);

function keyLikeFields(value: unknown, path = ""): string[] {
  if (Array.isArray(value)) return value.flatMap((v, i) => keyLikeFields(v, `${path}[${i}]`));
  if (value === null || typeof value !== "object") return [];
  return Object.entries(value).flatMap(([k, v]) => [
    ...(KEY_WORDS.has(k) ? [`${path}.${k}`] : []),
    ...keyLikeFields(v, `${path}.${k}`),
  ]);
}

describe("seed.importExam (T-109)", () => {
  it("loads 85 MCQs, 10 PBQs, 95 keys and 10 oral questions as published version 1", async () => {
    const t = setup();
    const result = await t.mutation(internal.seed.importExam, { seed });
    expect(result).toMatchObject({
      versionNo: 1,
      totalPoints: 102,
      questions: 95,
      answerKeys: 95,
      oralQuestions: 10,
    });

    const summary = await t.query(internal.seed.summary, { slug: "sy0-701" });
    expect(summary).not.toBeNull();
    expect(summary!.title).toBe(DEFAULT_EXAM_TITLE);
    expect(summary!.title).not.toMatch(/CompTIA|official/i); // QA-5
    expect(summary!.defaultVersionId).toBe(result.versionId);
    expect(summary!.versions).toEqual([
      {
        versionId: result.versionId,
        versionNo: 1,
        status: "published",
        totalPoints: 102,
        mcq: 85,
        pbqA: 5,
        pbqB: 5,
        chooseTwo: 4,
        answerKeys: 95,
        oralQuestions: 10,
        domainPoints: [
          { domain: "1.0", points: 13 },
          { domain: "2.0", points: 22 },
          { domain: "3.0", points: 19 },
          { domain: "4.0", points: 31 },
          { domain: "5.0", points: 17 },
        ],
      },
    ]);

    const rows = await t.run(async (ctx) => {
      const exam = await ctx.db.get("exams", result.examId);
      const version = await ctx.db.get("examVersions", result.versionId);
      const questions = await ctx.db.query("questions").take(500);
      const keys = await ctx.db.query("answerKeys").take(500);
      const audit = await ctx.db.query("auditLog").take(10);
      return { exam, version, questions, keys, audit };
    });
    expect(rows.exam).toMatchObject({
      slug: "sy0-701",
      timeLimitMin: 90,
      passScaled: 750,
      comfortScaled: 800,
      domainTarget: 0.81,
    });
    expect(rows.version).toMatchObject({ label: "Default", status: "published" });
    expect(rows.version!.ownerId).toBeUndefined();
    expect(rows.version!.publishedAt).toBeTypeOf("number");

    // Every key points at a question of the same version; PBQ keys have parts.
    const byId = new Map(rows.questions.map((q) => [q._id, q]));
    for (const k of rows.keys) {
      const q = byId.get(k.questionId)!;
      expect(q.versionId).toBe(k.versionId);
      if (q.kind === "mcq") expect(k.correct).toHaveLength(q.chooseCount!);
      else expect(k.parts).toBeDefined();
    }
    expect(
      rows.questions
        .filter((q) => q.chooseCount === 2)
        .map((q) => q.displayNumber)
        .sort(),
    ).toEqual(["20", "26", "50", "78"]);

    // SE-1: no question row carries key fields.
    for (const q of rows.questions) {
      for (const field of Object.keys(q)) expect(QUESTION_FIELDS).toContain(field);
      expect(keyLikeFields(q)).toEqual([]);
    }

    expect(rows.audit.map((a) => a.action)).toEqual(["version.published", "exam.default_changed"]);
  });

  it("a second run creates version 2 and makes it the default, leaving version 1 intact", async () => {
    const t = setup();
    const first = await t.mutation(internal.seed.importExam, { seed });
    const second = await t.mutation(internal.seed.importExam, { seed });
    expect(second.examId).toBe(first.examId);
    expect(second.versionNo).toBe(2);
    expect(second.versionId).not.toBe(first.versionId);

    const summary = await t.query(internal.seed.summary, { slug: "sy0-701" });
    expect(summary!.defaultVersionId).toBe(second.versionId);
    expect(summary!.versions.map((v) => [v.versionNo, v.status, v.mcq + v.pbqA + v.pbqB])).toEqual([
      [1, "published", 95],
      [2, "published", 95],
    ]);
    const counts = await t.run(async (ctx) => ({
      exams: (await ctx.db.query("exams").take(10)).length,
      questions: (await ctx.db.query("questions").take(500)).length,
      keys: (await ctx.db.query("answerKeys").take(500)).length,
      orals: (await ctx.db.query("oralQuestions").take(100)).length,
    }));
    expect(counts).toEqual({ exams: 1, questions: 190, keys: 190, orals: 20 });
  });

  describe("rejects a bad seed without writing anything", () => {
    async function rejects(mutate: (s: SeedExam) => void, message: RegExp) {
      const t = setup();
      const bad = clone();
      mutate(bad);
      const err = await t
        .mutation(internal.seed.importExam, { seed: bad })
        .then(() => null)
        .catch((e: unknown) => e);
      expect(err).toBeInstanceOf(ConvexError);
      const data = (err as ConvexError<{ code: string; issues: string[] }>).data;
      expect(data.code).toBe("VALIDATION_FAILED");
      expect(data.issues.some((i) => message.test(i))).toBe(true);
      const exams = await t.run((ctx) => ctx.db.query("exams").take(1));
      expect(exams).toEqual([]);
    }

    it("an MCQ key letter that is not an option", () =>
      rejects((s) => {
        s.answerKeys.find((k) => k.displayNumber === "6")!.correct = ["F"];
      }, /question 6: key answer F is not an option/));

    it("a question without a key", () =>
      rejects((s) => {
        s.answerKeys = s.answerKeys.filter((k) => k.displayNumber !== "B3");
      }, /question B3: no answer key/));

    it("a PBQ key that misses a scored part", () =>
      rejects((s) => {
        const key = s.answerKeys.find((k) => k.displayNumber === "1")!;
        if (key.parts && "parts" in key.parts) delete key.parts.parts["1a"];
      }, /question 1: key\.parts\.1a: scored part has no key/));

    it("totals that do not match the domain table", () =>
      rejects((s) => {
        s.domains[0]!.points = 14;
      }, /domain 1\.0: table says 14 points/));
  });
});
