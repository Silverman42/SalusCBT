// T-603: editor validate / publish / restore (LLD §10.1, §10.2, §12.2;
// PRD ED-1 to ED-4, ED-9, ED-10).

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  checkVersion,
  type Issue,
  type KeyInput,
  type QuestionInput,
} from "../../../convex/editor";
import { generate } from "../../../convex/generators";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { AnswerValue } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const seed = seedJson as SeedExam;
const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "c".repeat(64);
const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

async function rejection(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return err;
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  return errorCodeOf(await rejection(p));
}

async function issuesOf(p: Promise<unknown>): Promise<string[]> {
  const err = await rejection(p);
  expect(err).toBeInstanceOf(ConvexError);
  const data = (err as ConvexError<{ code: string; issues: string[] }>).data;
  expect(data.code).toBe("VALIDATION_FAILED");
  return data.issues;
}

async function snapshot(t: T, versionId: Id<"examVersions">) {
  return await t.run(async (ctx) => {
    const version = await ctx.db.get("examVersions", versionId);
    const questions = await ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
      .collect();
    const keys = await ctx.db
      .query("answerKeys")
      .withIndex("by_version", (q) => q.eq("versionId", versionId))
      .collect();
    const oral = await ctx.db
      .query("oralQuestions")
      .withIndex("by_version", (q) => q.eq("versionId", versionId))
      .collect();
    return { version, questions, keys, oral };
  });
}

async function setupAll() {
  const t = setup();
  const seeded = await t.mutation(internal.seed.importExam, { seed });
  const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
  const other = await seedSignedIn(t, { label: "other", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  type Who = typeof tutor;
  const draft = async (who: Who, label = "Draft") =>
    (await who.as.mutation(api.editor.createDraft, { fromVersionId: seeded.versionId, label }))
      .versionId;
  return { t, seeded, tutor, other, admin, draft };
}

/** A stored question and its key, in `saveQuestion`'s argument shape. */
function inputOf(
  question: Doc<"questions">,
  key: Doc<"answerKeys">,
): { question: QuestionInput; key: KeyInput } {
  const k: KeyInput = {
    explanation: key.explanation,
    ...(key.correct !== undefined ? { correct: key.correct } : {}),
    ...(key.parts !== undefined ? { parts: key.parts } : {}),
  };
  if (question.kind === "mcq")
    return {
      question: {
        kind: "mcq",
        section: "mcq",
        domain: question.domain,
        stem: question.stem,
        options: question.options!,
        chooseCount: question.chooseCount!,
      },
      key: k,
    };
  return {
    question: {
      kind: "pbq",
      section: question.section as "pbqA" | "pbqB",
      domain: question.domain,
      stem: question.stem,
      template: question.template!,
      payload: question.payload,
    },
    key: k,
  };
}

/** Row and key of `displayNumber` in a version. */
async function row(t: T, versionId: Id<"examVersions">, displayNumber: string) {
  const { questions, keys } = await snapshot(t, versionId);
  const question = questions.find((q) => q.displayNumber === displayNumber);
  if (!question) throw new Error(`no question ${displayNumber}`);
  return { question, key: keys.find((k) => k.questionId === question._id)! };
}

type Who = Awaited<ReturnType<typeof setupAll>>["tutor"];

/** Re-save a question through `saveQuestion` with `edit` applied. */
async function edit(
  t: T,
  who: Who,
  versionId: Id<"examVersions">,
  displayNumber: string,
  change: (input: { question: QuestionInput; key: KeyInput }) => {
    question: QuestionInput;
    key: KeyInput;
  },
) {
  const { question, key } = await row(t, versionId, displayNumber);
  const next = change(inputOf(question, key));
  await who.as.mutation(api.editor.saveQuestion, {
    versionId,
    questionId: question._id,
    ...next,
  });
  return question._id;
}

const errors = (issues: Issue[]) => issues.filter((i) => i.severity === "error");
const rules = (issues: Issue[]) => issues.map((i) => i.rule);

/** The first Choose ONE MCQ in the seed. */
const firstSingle = seed.questions.find((q) => q.kind === "mcq" && q.chooseCount === 1)!;
const firstChooseTwo = seed.questions.find((q) => q.kind === "mcq" && q.chooseCount === 2)!;

describe("editor validate / publish / restore (T-603)", () => {
  describe("validate", () => {
    it("passes the seeded default (incl. ED-2 recompute of sshLog and hashCheck)", async () => {
      const { tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const issues = await tutor.as.query(api.editor.validate, { versionId });
      expect(issues).toEqual([]);
    });

    it("blocks a Choose TWO question with one correct id (ED-9)", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const questionId = await edit(t, tutor, versionId, firstChooseTwo.displayNumber, (i) => ({
        ...i,
        key: { ...i.key, correct: i.key.correct!.slice(0, 1) },
      }));
      const issues = await tutor.as.query(api.editor.validate, { versionId });
      expect(errors(issues)).toEqual([
        {
          severity: "error",
          rule: "mcq.chooseCount",
          questionId,
          displayNumber: firstChooseTwo.displayNumber,
          message: "Choose TWO needs exactly 2 correct answers; the key has 1",
        },
      ]);
      const failed = await issuesOf(tutor.as.mutation(api.editor.publish, { versionId }));
      expect(failed).toEqual([
        `question ${firstChooseTwo.displayNumber}: Choose TWO needs exactly 2 correct answers; the key has 1`,
      ]);
      expect((await snapshot(t, versionId)).version?.status).toBe("draft");
    });

    it("needs exactly one correct answer for a single-answer MCQ, and an explanation", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      await edit(t, tutor, versionId, firstSingle.displayNumber, (i) => ({
        ...i,
        key: { correct: [], explanation: "  " },
      }));
      const issues = await tutor.as.query(api.editor.validate, { versionId });
      expect(rules(errors(issues)).sort()).toEqual(["explanation", "mcq.chooseCount"]);
    });

    it("recomputes the sshLog failure count and hashCheck file from the text (ED-2)", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      await edit(t, tutor, versionId, "1", (i) => ({
        ...i,
        key: { ...i.key, parts: { ...i.key.parts, parts: { ...i.key.parts.parts, "1c": "53" } } },
      }));
      const s3 = seed.questions.find((q) => q.displayNumber === "3")!;
      const files = s3.kind === "pbq" && s3.payload.template === "hashCheck" ? s3.payload : null;
      const pick = files!.parts.find((p) => p.kind === "pick")!;
      const wrongFile =
        pick.kind === "pick" ? pick.choices.find((c) => c !== "backup-tool-1.8.deb")! : "";
      await edit(t, tutor, versionId, "3", (i) => ({
        ...i,
        key: { ...i.key, parts: { parts: { ...i.key.parts.parts, "3a": wrongFile } } },
      }));
      const issues = errors(await tutor.as.query(api.editor.validate, { versionId }));
      expect(issues.map((i) => [i.displayNumber, i.rule, i.message])).toEqual([
        ["1", "pbq.recompute", 'part 1c: the log gives failure count "54", the key says "53"'],
        [
          "3",
          "pbq.recompute",
          `part 3a: the hashes show "backup-tool-1.8.deb" was altered, the key says "${wrongFile}"`,
        ],
      ]);
    });

    it("accepts a generated sshLog and hashCheck, and catches an edited log", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      for (const [n, template] of [
        ["1", "sshLog"],
        ["3", "hashCheck"],
      ] as const) {
        const g = generate(template, 42);
        await edit(t, tutor, versionId, n, (i) => ({
          question: { ...i.question, template, payload: g.payload } as QuestionInput,
          key: { parts: g.key, explanation: g.explanation },
        }));
      }
      expect(await tutor.as.query(api.editor.validate, { versionId })).toEqual([]);

      // Drop one attacker failure from the log: the stored count no longer matches.
      await edit(t, tutor, versionId, "1", (i) => {
        const payload = i.question.kind === "pbq" ? (i.question.payload as { log: string }) : null;
        const lines = payload!.log.split("\n");
        const g = generate("sshLog", 42);
        const ip = (g.key as { parts: Record<string, string> }).parts["1a"]!;
        const at = lines.findIndex((l) => l.includes(`Failed password for`) && l.includes(ip));
        lines.splice(at, 1);
        return {
          ...i,
          question: {
            ...i.question,
            payload: { ...payload, log: lines.join("\n") },
          } as QuestionInput,
        };
      });
      const issues = errors(await tutor.as.query(api.editor.validate, { versionId }));
      expect(issues).toHaveLength(1);
      expect(issues[0]).toMatchObject({ displayNumber: "1", rule: "pbq.recompute" });
      expect(issues[0]!.message).toMatch(/^part 1c: the log gives failure count/);
    });

    it("warns (retake disabled) when set B is missing, and errors when it is worth less", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const { questions } = await snapshot(t, versionId);
      const setB = questions.filter((q) => q.section === "pbqB");

      // One set B PBQ gone: set B is worth less than set A.
      await tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: setB[0]!._id });
      let issues = await tutor.as.query(api.editor.validate, { versionId });
      expect(errors(issues)).toEqual([
        expect.objectContaining({ rule: "sets.balance", questionId: null, displayNumber: null }),
      ]);
      expect(issues.filter((i) => i.severity === "warning")).toEqual([
        expect.objectContaining({
          rule: "sets.incomplete",
          message: "set B has 4 PBQs, expected 5; the retake is disabled until it is complete",
        }),
      ]);

      // No set B at all: a warning only, so it publishes.
      for (const q of setB.slice(1))
        await tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: q._id });
      issues = await tutor.as.query(api.editor.validate, { versionId });
      expect(issues).toEqual([
        expect.objectContaining({
          severity: "warning",
          rule: "sets.incomplete",
          message: "set B has 0 PBQs, expected 5; the retake is disabled until it is complete",
        }),
      ]);
      const published = await tutor.as.mutation(api.editor.publish, { versionId });
      expect(published.warnings.map((w) => w.rule)).toEqual(["sets.incomplete"]);
      expect(published.totalPoints).toBe(102);
    });

    it("flags missing keys, wrong stored points, an empty version and domain drift", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const { questions, keys } = await snapshot(t, versionId);
      const mcqs = questions.filter((q) => q.kind === "mcq");

      const base = checkVersion(questions, keys);
      expect(base).toEqual({ issues: [], totalPoints: 102 });

      const noKey = checkVersion(
        questions,
        keys.filter((k) => k.questionId !== mcqs[0]!._id),
      );
      expect(noKey.issues).toEqual([
        expect.objectContaining({ rule: "key.missing", questionId: mcqs[0]!._id }),
      ]);

      const wrongPoints = checkVersion(
        questions.map((q) => (q._id === mcqs[0]!._id ? { ...q, points: 2 } : q)),
        keys,
      );
      expect(rules(wrongPoints.issues)).toContain("points");

      expect(rules(checkVersion([], []).issues)).toEqual([
        "total",
        "sets.incomplete",
        "sets.incomplete",
      ]);

      // Every MCQ in domain 1.0: domain 1.0 is far over its 12%, the rest under.
      const skewed = checkVersion(
        questions.map((q) => (q.kind === "mcq" ? { ...q, domain: "1.0" as const } : q)),
        keys,
      );
      expect(skewed.issues.every((i) => i.severity === "warning")).toBe(true);
      expect(skewed.issues.filter((i) => i.rule === "domains.spread").length).toBeGreaterThan(1);
    });

    it("is author only", async () => {
      const { tutor, other, admin, draft } = await setupAll();
      const versionId = await draft(tutor);
      expect(await codeOf(other.as.query(api.editor.validate, { versionId }))).toBe("NOT_FOUND");
      expect(await admin.as.query(api.editor.validate, { versionId })).toEqual([]);
    });
  });

  describe("publish", () => {
    it("publishes a tutor draft: totalPoints, frozen, audited, default unchanged", async () => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      try {
        const { t, seeded, tutor, draft } = await setupAll();
        const versionId = await draft(tutor);
        // ED-10: removing an MCQ moves the total.
        const { questions } = await snapshot(t, versionId);
        const mcq = questions.find((q) => q.kind === "mcq")!;
        await tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: mcq._id });

        vi.setSystemTime(NOW);
        const result = await tutor.as.mutation(api.editor.publish, { versionId });
        expect(result.publishedAt - NOW).toBeGreaterThanOrEqual(0);
        expect(result.publishedAt - NOW).toBeLessThan(1000);
        expect(result).toEqual({
          versionId,
          versionNo: 1,
          totalPoints: 101,
          publishedAt: result.publishedAt,
          isDefault: false,
          warnings: [],
        });
        const after = await snapshot(t, versionId);
        expect(after.version).toMatchObject({
          status: "published",
          totalPoints: 101,
          publishedAt: result.publishedAt,
        });

        // Frozen (ED-4): no further edits or a second publish.
        expect(await codeOf(tutor.as.mutation(api.editor.publish, { versionId }))).toBe(
          "VALIDATION_FAILED",
        );
        expect(
          await codeOf(
            tutor.as.mutation(api.editor.deleteQuestion, {
              versionId,
              questionId: after.questions[0]!._id,
            }),
          ),
        ).toBe("VALIDATION_FAILED");

        const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
        const mine = audit.filter((a) => a.actorId === tutor.profileId);
        expect(mine).toEqual([
          expect.objectContaining({
            action: "version.published",
            target: versionId,
            meta: expect.objectContaining({ versionNo: 1, totalPoints: 101 }),
          }),
        ]);
        const exam = await t.run((ctx) => ctx.db.get("exams", seeded.examId));
        expect(exam?.defaultVersionId).toBe(seeded.versionId);
      } finally {
        vi.useRealTimers();
      }
    });

    it("makes an admin draft the new default and audits exam.default_changed", async () => {
      const { t, seeded, admin, draft } = await setupAll();
      const versionId = await draft(admin);
      const result = await admin.as.mutation(api.editor.publish, { versionId });
      expect(result).toMatchObject({ versionNo: 2, isDefault: true, totalPoints: 102 });
      const exam = await t.run((ctx) => ctx.db.get("exams", seeded.examId));
      expect(exam?.defaultVersionId).toBe(versionId);
      // The old default stays published (classes and attempts may point at it).
      expect((await snapshot(t, seeded.versionId)).version?.status).toBe("published");
      const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
      expect(audit.filter((a) => a.actorId === admin.profileId)).toEqual([
        expect.objectContaining({ action: "version.published", target: versionId }),
        expect.objectContaining({
          action: "exam.default_changed",
          target: seeded.examId,
          meta: { from: seeded.versionId, to: versionId },
        }),
      ]);
    });

    it("refuses other tutors' drafts and the default to a tutor", async () => {
      const { seeded, tutor, other, draft } = await setupAll();
      const versionId = await draft(tutor);
      expect(await codeOf(other.as.mutation(api.editor.publish, { versionId }))).toBe("NOT_FOUND");
      expect(
        await codeOf(tutor.as.mutation(api.editor.publish, { versionId: seeded.versionId })),
      ).toBe("NOT_FOUND");
    });

    it("restores an older version: draft from it, publish as the next number (ED-3)", async () => {
      const { t, seeded, admin, draft } = await setupAll();
      const v2 = await draft(admin);
      await edit(t, admin, v2, firstSingle.displayNumber, (i) => ({
        ...i,
        question: { ...i.question, stem: "Edited in v2" },
      }));
      await admin.as.mutation(api.editor.publish, { versionId: v2 });

      const { versionId: v3, versionNo } = await admin.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Restore v1",
      });
      expect(versionNo).toBe(3);
      await admin.as.mutation(api.editor.publish, { versionId: v3 });
      const restored = await row(t, v3, firstSingle.displayNumber);
      expect(restored.question.stem).toBe(firstSingle.stem);
      const exam = await t.run((ctx) => ctx.db.get("exams", seeded.examId));
      expect(exam?.defaultVersionId).toBe(v3);
    });
  });

  describe("old attempts keep their version (ED-4)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(NOW);
      vi.stubEnv("SERVER_SECRET", SECRET);
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllEnvs();
    });

    function correctAnswer(displayNumber: string): AnswerValue {
      const key = seed.answerKeys.find((k) => k.displayNumber === displayNumber)!;
      if (key.correct) return { kind: "mcq", optionIds: [...key.correct] };
      const parts = key.parts!;
      if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
      return { kind: "pbq", parts: { ...parts.parts } };
    }

    async function sit(t: T, n: number) {
      const { attemptId, deadline } = await t.mutation(api.attempts.start, {
        serverSecret: SECRET,
        anonToken: token(n),
        mode: "standard",
        ipHash: IP_HASH,
      });
      const attempt = (await t.run((ctx) => ctx.db.get("attempts", attemptId)))!;
      const { questions } = await snapshot(t, attempt.versionId);
      for (const q of questions.filter((q) => q.section !== "pbqB"))
        await t.mutation(api.attempts.saveResponse, {
          attemptId,
          anonToken: token(n),
          questionId: q._id,
          value: correctAnswer(q.displayNumber), // the v1 answer key
          flagged: false,
        });
      return { attemptId, versionId: attempt.versionId, deadline };
    }

    it("an attempt on v1 marks against v1 after v2 is published", async () => {
      const { t, seeded, admin, draft } = await setupAll();
      const before = await snapshot(t, seeded.versionId);
      const old = await sit(t, 1);
      expect(old.versionId).toBe(seeded.versionId);

      // v2 changes the answer of a single-answer MCQ, then becomes the default.
      const v2 = await draft(admin, "v2");
      const key = seed.answerKeys.find((k) => k.displayNumber === firstSingle.displayNumber)!;
      const other =
        firstSingle.kind === "mcq"
          ? firstSingle.options.find((o) => o.id !== key.correct![0])!.id
          : "";
      await edit(t, admin, v2, firstSingle.displayNumber, (i) => ({
        ...i,
        key: { ...i.key, correct: [other] },
      }));
      await admin.as.mutation(api.editor.publish, { versionId: v2 });

      // Publishing never touched v1.
      expect(await snapshot(t, seeded.versionId)).toEqual(before);

      const oldResult = await t.mutation(api.attempts.submit, {
        attemptId: old.attemptId,
        anonToken: token(1),
      });
      expect(oldResult).toMatchObject({ points: 102, totalPoints: 102 });

      const fresh = await sit(t, 2);
      expect(fresh.versionId).toBe(v2);
      const freshResult = await t.mutation(api.attempts.submit, {
        attemptId: fresh.attemptId,
        anonToken: token(2),
      });
      expect(freshResult).toMatchObject({ points: 101, totalPoints: 102 });
    });
  });
});
