// T-606: editor.generate and preview attempts (LLD §5.2, §10.3; PRD ED-1, ED-2).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { generate } from "../../../convex/generators";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { AnswerValue, PbqKey, PbqTemplate } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const seed = seedJson as SeedExam;
const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "c".repeat(64);
const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
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

async function questionsOf(t: T, versionId: Id<"examVersions">) {
  return await t.run((ctx) =>
    ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
      .collect(),
  );
}

async function byNumber(t: T, versionId: Id<"examVersions">, displayNumber: string) {
  const q = (await questionsOf(t, versionId)).find((x) => x.displayNumber === displayNumber);
  if (!q) throw new Error(`no question ${displayNumber}`);
  return q;
}

/** The fully correct answer built from a stored key row. */
function answerFromKey(key: Doc<"answerKeys">): AnswerValue {
  if (key.correct) return { kind: "mcq", optionIds: [...key.correct] };
  const parts = key.parts as PbqKey;
  if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
  return { kind: "pbq", parts: { ...parts.parts } };
}

const errorsOf = (issues: { severity: string }[]) => issues.filter((i) => i.severity === "error");

describe("editor.generate and preview attempts (T-606)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("generate", () => {
    it("fills every PBQ of both sets; the draft still passes validate (ED-2)", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const pbqs = (await questionsOf(t, versionId)).filter((q) => q.kind === "pbq");
      expect(pbqs).toHaveLength(10);
      for (const [i, q] of pbqs.entries()) {
        const res = await tutor.as.mutation(api.editor.generate, {
          versionId,
          questionId: q._id,
          seed: 1000 + i,
        });
        const g = generate(q.template as PbqTemplate, 1000 + i, {
          set: q.section === "pbqB" ? "B" : "A",
        });
        expect(res.seed).toBe(1000 + i);
        expect(res.question).toMatchObject({
          _id: q._id,
          section: q.section,
          order: q.order,
          displayNumber: q.displayNumber,
          stem: q.stem,
          domain: q.domain,
          template: q.template,
          points: g.points,
        });
        expect(res.question.payload).toEqual(g.payload);
        expect(res.key).toMatchObject({
          questionId: q._id,
          versionId,
          parts: g.key,
          explanation: g.explanation,
        });
      }
      expect(errorsOf(await tutor.as.query(api.editor.validate, { versionId }))).toEqual([]);
      // One key per question still.
      const keys = await t.run((ctx) =>
        ctx.db
          .query("answerKeys")
          .withIndex("by_version", (q) => q.eq("versionId", versionId))
          .collect(),
      );
      expect(keys).toHaveLength(seed.answerKeys.length);
      await tutor.as.mutation(api.editor.publish, { versionId });
    });

    it("picks a uint32 seed when none is given, and the seed reproduces the values", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const q = await byNumber(t, versionId, "1");
      const first = await tutor.as.mutation(api.editor.generate, {
        versionId,
        questionId: q._id,
      });
      expect(Number.isInteger(first.seed) && first.seed >= 0 && first.seed <= 0xffffffff).toBe(
        true,
      );
      const again = await tutor.as.mutation(api.editor.generate, {
        versionId,
        questionId: q._id,
        seed: first.seed,
      });
      expect(again.question.payload).toEqual(first.question.payload);
      expect(again.key.parts).toEqual(first.key.parts);
    });

    it("refuses MCQs, bad seeds, published versions and other tutors' drafts", async () => {
      const { t, seeded, tutor, other, admin, draft } = await setupAll();
      const versionId = await draft(tutor);
      const pbq = await byNumber(t, versionId, "2");
      const mcq = (await questionsOf(t, versionId)).find((q) => q.kind === "mcq")!;
      expect(
        await codeOf(tutor.as.mutation(api.editor.generate, { versionId, questionId: mcq._id })),
      ).toBe("VALIDATION_FAILED");
      for (const bad of [-1, 1.5, 2 ** 32])
        expect(
          await codeOf(
            tutor.as.mutation(api.editor.generate, { versionId, questionId: pbq._id, seed: bad }),
          ),
        ).toBe("VALIDATION_FAILED");
      expect(
        await codeOf(other.as.mutation(api.editor.generate, { versionId, questionId: pbq._id })),
      ).toBe("NOT_FOUND");
      // A question of another version.
      const seededPbq = await byNumber(t, seeded.versionId, "2");
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.generate, { versionId, questionId: seededPbq._id }),
        ),
      ).toBe("NOT_FOUND");
      // Published versions never change (ED-4), not even for the admin.
      expect(
        await codeOf(
          admin.as.mutation(api.editor.generate, {
            versionId: seeded.versionId,
            questionId: seededPbq._id,
          }),
        ),
      ).toBe("VALIDATION_FAILED");
      expect(
        await codeOf(t.mutation(api.editor.generate, { versionId, questionId: pbq._id })),
      ).not.toBeNull();
    });
  });

  describe("preview attempts", () => {
    /** Answer every question on the paper with the stored key, then submit. */
    async function sitWithKeys(
      t: T,
      attemptId: Id<"attempts">,
      anonToken: string,
      versionId: Id<"examVersions">,
    ) {
      const paper = await t.query(api.attempts.getPaper, { attemptId, anonToken });
      const keys = await t.run((ctx) =>
        ctx.db
          .query("answerKeys")
          .withIndex("by_version", (q) => q.eq("versionId", versionId))
          .collect(),
      );
      for (const q of paper.questions) {
        const key = keys.find((k) => k.questionId === q.questionId)!;
        await t.mutation(api.attempts.saveResponse, {
          attemptId,
          anonToken,
          questionId: q.questionId,
          value: answerFromKey(key),
          flagged: false,
        });
      }
      return await t.mutation(api.attempts.submit, { attemptId, anonToken });
    }

    it("marks a generated draft full with the key's answers, both sets", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      for (const q of (await questionsOf(t, versionId)).filter((x) => x.kind === "pbq"))
        await tutor.as.mutation(api.editor.generate, { versionId, questionId: q._id, seed: 7 });

      for (const mode of ["standard", "retake"] as const) {
        const preview = await tutor.as.mutation(api.editor.previewAttempt, { versionId, mode });
        expect(preview.anonToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const attempt = (await t.run((ctx) => ctx.db.get("attempts", preview.attemptId)))!;
        expect(attempt).toMatchObject({
          versionId,
          mode,
          status: "in_progress",
          preview: true,
          previewBy: tutor.profileId,
        });
        expect(attempt.classId).toBeUndefined();
        expect(attempt.autoSubmitJobId).toBeDefined();

        const result = await sitWithKeys(t, preview.attemptId, preview.anonToken, versionId);
        expect(result.points).toBe(result.totalPoints);
        expect(result.totalPoints).toBeGreaterThan(0);
        // The review works too (same path as a student's).
        const review = await t.query(api.review.getReview, {
          attemptId: preview.attemptId,
          anonToken: preview.anonToken,
        });
        expect(review.every((r) => r.earned === r.max)).toBe(true);
      }
    });

    it("marks against the draft as it is at submit", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const q1 = await byNumber(t, versionId, "1");
      const preview = await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      // Answer 1 with the seeded key, then regenerate 1: that answer is now wrong.
      const before = (await t.run((ctx) =>
        ctx.db
          .query("answerKeys")
          .withIndex("by_question", (q) => q.eq("questionId", q1._id))
          .unique(),
      ))!;
      await t.mutation(api.attempts.saveResponse, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
        questionId: q1._id,
        value: answerFromKey(before),
        flagged: false,
      });
      const g = await tutor.as.mutation(api.editor.generate, {
        versionId,
        questionId: q1._id,
        seed: 99,
      });
      expect(g.key.parts).not.toEqual(before.parts);
      await t.mutation(api.attempts.submit, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
      });
      const review = await t.query(api.review.getReview, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
      });
      const item = review.find((r) => r.questionId === q1._id)!;
      expect(item.earned).toBeLessThan(item.max);
    });

    it("can be started by the version's author only", async () => {
      const { seeded, tutor, other, admin, draft, t } = await setupAll();
      const versionId = await draft(tutor);
      expect(await codeOf(other.as.mutation(api.editor.previewAttempt, { versionId }))).toBe(
        "NOT_FOUND",
      );
      expect(await codeOf(t.mutation(api.editor.previewAttempt, { versionId }))).not.toBeNull();
      // A tutor can't preview the default (they copy it instead); the admin authors it.
      expect(
        await codeOf(tutor.as.mutation(api.editor.previewAttempt, { versionId: seeded.versionId })),
      ).toBe("NOT_FOUND");
      await admin.as.mutation(api.editor.previewAttempt, { versionId: seeded.versionId });
      await admin.as.mutation(api.editor.previewAttempt, { versionId });
    });

    it("a new preview replaces the author's earlier one of that version and mode", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const q1 = await byNumber(t, versionId, "1");
      const first = await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      await t.mutation(api.attempts.saveResponse, {
        attemptId: first.attemptId,
        anonToken: first.anonToken,
        questionId: q1._id,
        flagged: true,
      });
      const retake = await tutor.as.mutation(api.editor.previewAttempt, {
        versionId,
        mode: "retake",
      });
      const second = await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      const left = await t.run(async (ctx) => ({
        first: await ctx.db.get("attempts", first.attemptId),
        retake: await ctx.db.get("attempts", retake.attemptId),
        second: await ctx.db.get("attempts", second.attemptId),
        responses: await ctx.db
          .query("responses")
          .withIndex("by_attempt_question", (q) => q.eq("attemptId", first.attemptId))
          .collect(),
      }));
      expect(left.first).toBeNull();
      expect(left.responses).toEqual([]);
      expect(left.retake).not.toBeNull();
      expect(left.second).not.toBeNull();
    });

    it("deleting a draft question removes its responses on the author's previews", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      const mcq = (await questionsOf(t, versionId)).find((q) => q.kind === "mcq")!;
      const preview = await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      await t.mutation(api.attempts.saveResponse, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
        questionId: mcq._id,
        value: { kind: "mcq", optionIds: [mcq.options![0]!.id] },
        flagged: false,
      });
      await tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: mcq._id });
      const state = await t.query(api.attempts.getState, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
      });
      expect(state.responses).toEqual([]);
      // Still submits and marks against what is left.
      const result = await t.mutation(api.attempts.submit, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
      });
      expect(result.points).toBe(0);
    });

    it("never appears on class dashboards, class stats or a student's history", async () => {
      const { t, tutor, draft } = await setupAll();
      const versionId = await draft(tutor);
      await tutor.as.mutation(api.editor.publish, { versionId });
      const { classId, code } = await tutor.as.mutation(api.classes.create, {
        name: "Group",
        versionId,
      });
      const student = await t.mutation(api.attempts.start, {
        serverSecret: SECRET,
        anonToken: token(1),
        mode: "standard",
        classCode: code,
        displayName: "Sam",
        ipHash: IP_HASH,
      });
      await t.mutation(api.attempts.submit, { attemptId: student.attemptId, anonToken: token(1) });

      const preview = await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      await sitWithKeys(t, preview.attemptId, preview.anonToken, versionId);

      const rows = await tutor.as.query(api.classes.attempts, { classId });
      expect(rows.map((r) => r.attemptId)).toEqual([student.attemptId]);
      const stats = await tutor.as.query(api.classes.stats, { classId });
      expect(stats).toMatchObject({ attemptCount: 1, submittedCount: 1, passedCount: 0 });

      const history = await t.query(api.review.myAttempts, {
        anonToken: token(1),
        paginationOpts: { numItems: 50, cursor: null },
      });
      expect(history.page.map((a) => a.attemptId)).toEqual([student.attemptId]);
    });

    it("leaves attempts on the published version marking against it (ED-4)", async () => {
      const { t, seeded, tutor, draft } = await setupAll();
      const sitting = await t.mutation(api.attempts.start, {
        serverSecret: SECRET,
        anonToken: token(2),
        mode: "standard",
        ipHash: IP_HASH,
      });
      expect((await t.run((ctx) => ctx.db.get("attempts", sitting.attemptId)))!.versionId).toBe(
        seeded.versionId,
      );

      const versionId = await draft(tutor);
      for (const q of (await questionsOf(t, versionId)).filter((x) => x.kind === "pbq"))
        await tutor.as.mutation(api.editor.generate, { versionId, questionId: q._id, seed: 3 });
      const preview = await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      await sitWithKeys(t, preview.attemptId, preview.anonToken, versionId);
      await tutor.as.mutation(api.editor.publish, { versionId });

      const result = await sitWithKeys(t, sitting.attemptId, token(2), seeded.versionId);
      expect(result).toMatchObject({ points: 102, totalPoints: 102 });
    });
  });
});
