// T-609: the Stage 6 gate, end to end in convex-test (LLD §10, §17; PRD ED-1 to ED-10).
//
// "A generated version passes validation, previews and marks correctly; old
// attempts still mark against their own version."
//
// One story walks the tutor's whole path through the public functions the UI
// calls (myVersions → createDraft → getDraft → generate → saveQuestion →
// validate → previewAttempt → attempts.* / review.* → publish → classes.*),
// with students sitting through `attempts.start` like the Nuxt route. The
// negative paths the task lists (ownership, the default, frozen versions,
// validation blocking publish) follow. Narrower cases live in versions / save
// / publish / generate.test.ts.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import type { KeyInput, QuestionInput } from "../../../convex/editor";
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
const token = (n: number) => `tok${String(n).padStart(40, "0")}`;
/** Fixed generator seeds, one per PBQ (both sets), so the run is reproducible. */
const SEED_BASE = 6090;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

/** Every row of a version (version, questions, keys, oral), as stored. */
async function rowsOf(t: T, versionId: Id<"examVersions">) {
  return await t.run(async (ctx) => ({
    version: await ctx.db.get("examVersions", versionId),
    questions: await ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
      .collect(),
    keys: await ctx.db
      .query("answerKeys")
      .withIndex("by_version", (q) => q.eq("versionId", versionId))
      .collect(),
    oral: await ctx.db
      .query("oralQuestions")
      .withIndex("by_version", (q) => q.eq("versionId", versionId))
      .collect(),
  }));
}

/** The rows serialised, ids and `_creationTime` included: equal strings = byte-identical rows. */
const bytesOf = async (t: T, versionId: Id<"examVersions">) =>
  JSON.stringify(await rowsOf(t, versionId));

/** The fully correct answer from a key row. */
function answerFromKey(key: Pick<Doc<"answerKeys">, "correct" | "parts">): AnswerValue {
  if (key.correct) return { kind: "mcq", optionIds: [...key.correct] };
  const parts = key.parts as PbqKey;
  if ("rules" in parts) return { kind: "firewall", rules: parts.rules.map((r) => ({ ...r })) };
  return { kind: "pbq", parts: { ...parts.parts } };
}

type KeyRow = Pick<Doc<"answerKeys">, "questionId" | "correct" | "parts">;

/**
 * Answer every question on the attempt's paper (its PBQ set and the MCQs)
 * from `keyFor`, through `attempts.saveResponse`, as the exam page would.
 */
async function answerPaper(
  t: T,
  attemptId: Id<"attempts">,
  anonToken: string,
  keyFor: (questionId: Id<"questions">) => KeyRow,
) {
  const paper = await t.query(api.attempts.getPaper, { attemptId, anonToken });
  for (const q of paper.questions)
    await t.mutation(api.attempts.saveResponse, {
      attemptId,
      anonToken,
      questionId: q.questionId,
      value: answerFromKey(keyFor(q.questionId)),
      flagged: false,
    });
  return paper;
}

/** `saveQuestion`'s argument shape from a `getDraft` row. */
function inputOf(question: Doc<"questions">, key: Doc<"answerKeys">) {
  const k: KeyInput = {
    explanation: key.explanation,
    ...(key.correct !== undefined ? { correct: key.correct } : {}),
    ...(key.parts !== undefined ? { parts: key.parts } : {}),
  };
  const q: QuestionInput =
    question.kind === "mcq"
      ? {
          kind: "mcq",
          section: "mcq",
          domain: question.domain,
          stem: question.stem,
          options: question.options!,
          chooseCount: question.chooseCount!,
        }
      : {
          kind: "pbq",
          section: question.section as "pbqA" | "pbqB",
          domain: question.domain,
          stem: question.stem,
          template: question.template!,
          payload: question.payload,
        };
  return { question: q, key: k };
}

const errorsOf = <I extends { severity: string }>(issues: I[]) =>
  issues.filter((i) => i.severity === "error");

async function setupAll() {
  const t = setup();
  const seeded = await t.mutation(internal.seed.importExam, { seed });
  const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
  const other = await seedSignedIn(t, { label: "other", role: "tutor" });
  return { t, seeded, tutor, other };
}

/** The first Choose ONE MCQ of the seed: the one the story turns into a Choose TWO. */
const firstSingle = seed.questions.find((q) => q.kind === "mcq" && q.chooseCount === 1)!;

describe("Stage 6 gate (T-609)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("a generated version validates, previews and marks full; old attempts keep their version", async () => {
    const { t, seeded, tutor } = await setupAll();
    const v1 = seeded.versionId;
    const v1Before = await bytesOf(t, v1);
    const v1Rows = await rowsOf(t, v1);
    const v1Key = (id: Id<"questions">) => v1Rows.keys.find((k) => k.questionId === id)!;

    // 0. The tutor's class sits the default (v1). A student starts BEFORE the
    //    new version exists and answers everything with the v1 key.
    const cls = await tutor.as.mutation(api.classes.create, { name: "Gate", versionId: v1 });
    const old = await t.mutation(api.attempts.start, {
      serverSecret: SECRET,
      anonToken: token(1),
      mode: "standard",
      classCode: cls.code,
      displayName: "Olive",
      ipHash: IP_HASH,
    });
    await answerPaper(t, old.attemptId, token(1), v1Key);

    // 1. Signed in, the tutor sees the default (read-only) and copies it.
    const listed = await tutor.as.query(api.editor.myVersions, {});
    expect(listed).toEqual([
      expect.objectContaining({ versionId: v1, isDefault: true, editable: false, authored: false }),
    ]);
    const { versionId: v2, versionNo } = await tutor.as.mutation(api.editor.createDraft, {
      fromVersionId: v1,
      label: "Gate draft",
    });
    expect(versionNo).toBe(1);

    // 2. Generate every PBQ of both sets with fixed seeds.
    const draft = await tutor.as.query(api.editor.getDraft, { versionId: v2 });
    expect(draft.version).toMatchObject({ status: "draft", editable: true, authored: true });
    const pbqs = draft.questions.filter(({ question }) => question.kind === "pbq");
    expect(pbqs.map(({ question }) => question.section)).toEqual([
      ...Array(5).fill("pbqA"),
      ...Array(5).fill("pbqB"),
    ]);
    for (const [i, { question }] of pbqs.entries()) {
      const res = await tutor.as.mutation(api.editor.generate, {
        versionId: v2,
        questionId: question._id,
        seed: SEED_BASE + i,
      });
      const expected = generate(question.template as PbqTemplate, SEED_BASE + i, {
        set: question.section === "pbqB" ? "B" : "A",
      });
      expect(res.question.payload).toEqual(expected.payload);
      expect(res.key.parts).toEqual(expected.key);
    }

    // 3. Edit an MCQ: new stem, and Choose ONE → Choose TWO (two correct ids).
    const before = (await tutor.as.query(api.editor.getDraft, { versionId: v2 })).questions.find(
      ({ question }) => question.displayNumber === firstSingle.displayNumber,
    )!;
    const input = inputOf(before.question, before.key!);
    if (input.question.kind !== "mcq") throw new Error("expected an MCQ");
    const firstCorrect = input.key.correct![0]!;
    const secondCorrect = input.question.options.find((o) => o.id !== firstCorrect)!.id;
    await tutor.as.mutation(api.editor.saveQuestion, {
      versionId: v2,
      questionId: before.question._id,
      question: { ...input.question, stem: "Gate: which TWO are correct?", chooseCount: 2 },
      key: { ...input.key, correct: [firstCorrect, secondCorrect] },
    });

    // 4. Validate: no errors (warnings, e.g. domain spread, don't block).
    expect(errorsOf(await tutor.as.query(api.editor.validate, { versionId: v2 }))).toEqual([]);

    // The draft as it now stands, read back the way the editor reads it.
    const edited = await tutor.as.query(api.editor.getDraft, { versionId: v2 });
    const v2Key = (id: Id<"questions">) =>
      edited.questions.find(({ question }) => question._id === id)!.key!;
    const editedMcq = edited.questions.find(
      ({ question }) => question._id === before.question._id,
    )!;
    expect(editedMcq.question).toMatchObject({ chooseCount: 2, points: 1 });
    // Generated keys differ from v1's (some templates may repeat an answer,
    // e.g. the same nmap port), so "marks against v2" and "marks against v1"
    // give different scores below.
    const changed = pbqs.filter(({ question }) => {
      const v1Twin = v1Rows.questions.find((q) => q.displayNumber === question.displayNumber)!;
      return JSON.stringify(v2Key(question._id).parts) !== JSON.stringify(v1Key(v1Twin._id).parts);
    });
    expect(changed.length).toBeGreaterThan(0);
    const v2Total = edited.questions
      .filter(({ question }) => question.section !== "pbqB")
      .reduce((sum, { question }) => sum + question.points, 0);
    const setB = edited.questions
      .filter(({ question }) => question.section === "pbqB")
      .reduce((sum, { question }) => sum + question.points, 0);
    expect(setB).toBe(
      edited.questions
        .filter(({ question }) => question.section === "pbqA")
        .reduce((sum, { question }) => sum + question.points, 0),
    );

    // 5. Preview, standard and retake, answered with the key: full marks, and
    //    the review shows full marks on every question.
    for (const mode of ["standard", "retake"] as const) {
      const preview = await tutor.as.mutation(api.editor.previewAttempt, { versionId: v2, mode });
      const paper = await answerPaper(t, preview.attemptId, preview.anonToken, v2Key);
      expect(paper.questions.filter((q) => q.kind === "pbq").map((q) => q.section)).toEqual(
        Array(5).fill(mode === "retake" ? "pbqB" : "pbqA"),
      );
      const result = await t.mutation(api.attempts.submit, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
      });
      expect(result).toMatchObject({ points: v2Total, totalPoints: v2Total });
      const review = await t.query(api.review.getReview, {
        attemptId: preview.attemptId,
        anonToken: preview.anonToken,
      });
      expect(review).toHaveLength(paper.questions.length);
      for (const item of review) {
        expect(item.earned).toBe(item.max);
        if (item.kind === "pbq") expect(item.partResults.every(Boolean)).toBe(true);
      }
      const choose2 = review.find((r) => r.questionId === before.question._id)!;
      expect(choose2).toMatchObject({
        stem: "Gate: which TWO are correct?",
        chooseCount: 2,
        earned: 1,
        max: 1,
      });
    }
    // Nothing so far touched v1.
    expect(await bytesOf(t, v1)).toBe(v1Before);

    // 6. Publish.
    const published = await tutor.as.mutation(api.editor.publish, { versionId: v2 });
    expect(published).toMatchObject({
      versionId: v2,
      versionNo: 1,
      totalPoints: v2Total,
      isDefault: false,
    });
    expect(await bytesOf(t, v1)).toBe(v1Before);
    const exam = await t.run((ctx) => ctx.db.get("exams", seeded.examId));
    expect(exam?.defaultVersionId).toBe(v1); // a tutor's publish never moves the default

    // 7. The class moves to the new version; a second class starts on it.
    await tutor.as.mutation(api.classes.update, { classId: cls.classId, versionId: v2 });
    const cls2 = await tutor.as.mutation(api.classes.create, { name: "Gate 2", versionId: v2 });
    expect((await tutor.as.query(api.classes.mine, {})).map((c) => c.versionId).sort()).toEqual(
      [v2, v2].sort(),
    );

    // 8a. The old attempt (started on v1 before publish) still marks against v1.
    const oldResult = await t.mutation(api.attempts.submit, {
      attemptId: old.attemptId,
      anonToken: token(1),
    });
    expect(oldResult).toMatchObject({ points: 102, totalPoints: 102 });
    const oldAttempt = (await t.run((ctx) => ctx.db.get("attempts", old.attemptId)))!;
    expect(oldAttempt.versionId).toBe(v1);
    const oldReview = await tutor.as.query(api.classes.attemptReview, {
      attemptId: old.attemptId,
    });
    expect(oldReview.every((r) => r.earned === r.max)).toBe(true);
    const oldMcq = oldReview.find((r) => r.displayNumber === firstSingle.displayNumber)!;
    expect(oldMcq).toMatchObject({ stem: firstSingle.stem, chooseCount: 1 });

    // 8b. A student on the new version, answering with v2's key: full marks on v2.
    const fresh = await t.mutation(api.attempts.start, {
      serverSecret: SECRET,
      anonToken: token(2),
      mode: "standard",
      classCode: cls.code,
      displayName: "Nia",
      ipHash: IP_HASH,
    });
    expect((await t.run((ctx) => ctx.db.get("attempts", fresh.attemptId)))!.versionId).toBe(v2);
    await answerPaper(t, fresh.attemptId, token(2), v2Key);
    expect(
      await t.mutation(api.attempts.submit, { attemptId: fresh.attemptId, anonToken: token(2) }),
    ).toMatchObject({ points: v2Total, totalPoints: v2Total });

    // 8c. A student on the new version who answers the MCQs with v1's key
    //     (and the PBQs with v2's: v1's PBQ answers don't fit the regenerated
    //     payloads, so saveResponse refuses them) loses exactly the Choose
    //     TWO: marked against v2's key, not v1's.
    const stale = await t.mutation(api.attempts.start, {
      serverSecret: SECRET,
      anonToken: token(3),
      mode: "standard",
      classCode: cls2.code,
      displayName: "Sol",
      ipHash: IP_HASH,
    });
    const v1ByNumber = new Map(v1Rows.questions.map((q) => [q.displayNumber, q._id]));
    const v2ById = new Map(edited.questions.map(({ question }) => [question._id, question]));
    await answerPaper(t, stale.attemptId, token(3), (id) => {
      const q = v2ById.get(id)!;
      if (q.kind === "pbq") return v2Key(id);
      return { ...v1Key(v1ByNumber.get(q.displayNumber)!), questionId: id };
    });
    expect(
      await t.mutation(api.attempts.submit, { attemptId: stale.attemptId, anonToken: token(3) }),
    ).toMatchObject({ points: v2Total - 1, totalPoints: v2Total });
    const staleReview = await t.query(api.review.getReview, {
      attemptId: stale.attemptId,
      anonToken: token(3),
    });
    expect(staleReview.find((r) => r.questionId === before.question._id)).toMatchObject({
      earned: 0,
      max: 1,
      yourAnswer: { kind: "mcq", optionIds: [firstCorrect] },
      correctAnswer: { kind: "mcq", optionIds: [firstCorrect, secondCorrect] },
    });

    // Both class dashboards show only their own students (never the previews).
    expect(
      (await tutor.as.query(api.classes.attempts, { classId: cls.classId }))
        .map((r) => r.attemptId)
        .sort(),
    ).toEqual([old.attemptId, fresh.attemptId].sort());
    expect(
      (await tutor.as.query(api.classes.attempts, { classId: cls2.classId })).map(
        (r) => r.attemptId,
      ),
    ).toEqual([stale.attemptId]);

    // 9. v1's rows are byte-identical after everything above.
    expect(await bytesOf(t, v1)).toBe(v1Before);
  });

  describe("negative paths", () => {
    it("another tutor can't read, edit, generate, preview, publish or use a tutor's version", async () => {
      const { t, seeded, tutor, other } = await setupAll();
      const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Mine",
      });
      const before = await bytesOf(t, versionId);
      const { questions } = await rowsOf(t, versionId);
      const pbq = questions.find((q) => q.kind === "pbq")!;
      const mcq = questions.find((q) => q.kind === "mcq")!;
      const key = (await rowsOf(t, versionId)).keys.find((k) => k.questionId === mcq._id)!;
      const input = inputOf(mcq, key);
      const mcqIds = questions.filter((q) => q.section === "mcq").map((q) => q._id);

      const refused = [
        other.as.query(api.editor.getDraft, { versionId }),
        other.as.query(api.editor.validate, { versionId }),
        other.as.mutation(api.editor.saveQuestion, { versionId, questionId: mcq._id, ...input }),
        other.as.mutation(api.editor.saveQuestion, { versionId, ...input }),
        other.as.mutation(api.editor.deleteQuestion, { versionId, questionId: mcq._id }),
        other.as.mutation(api.editor.reorder, {
          versionId,
          section: "mcq",
          questionIds: [...mcqIds].reverse(),
        }),
        other.as.mutation(api.editor.generate, { versionId, questionId: pbq._id, seed: 1 }),
        other.as.mutation(api.editor.previewAttempt, { versionId }),
        other.as.mutation(api.editor.publish, { versionId }),
        other.as.mutation(api.editor.createDraft, { fromVersionId: versionId, label: "Steal" }),
      ];
      for (const p of refused) expect(await codeOf(p)).toBe("NOT_FOUND");
      expect((await other.as.query(api.editor.myVersions, {})).map((v) => v.versionId)).toEqual([
        seeded.versionId,
      ]);

      // Published, it still can't be used for another tutor's class.
      await tutor.as.mutation(api.editor.publish, { versionId });
      expect(
        await codeOf(other.as.mutation(api.classes.create, { name: "Theirs", versionId })),
      ).toBe("NOT_FOUND");
      const { questions: after } = await rowsOf(t, versionId);
      expect(after.map((q) => q._id)).toEqual(questions.map((q) => q._id));
      // Only the publish changed the version row; content rows are untouched.
      const was = JSON.parse(before) as Awaited<ReturnType<typeof rowsOf>>;
      expect(await rowsOf(t, versionId)).toMatchObject({
        questions: was.questions,
        keys: was.keys,
        oral: was.oral,
      });
    });

    it("a tutor can't edit, generate, preview or publish the default, which stays byte-identical", async () => {
      const { t, seeded, tutor } = await setupAll();
      const v1 = seeded.versionId;
      const before = await bytesOf(t, v1);
      const { questions, keys } = await rowsOf(t, v1);
      const pbq = questions.find((q) => q.kind === "pbq")!;
      const mcq = questions.find((q) => q.kind === "mcq")!;
      const input = inputOf(
        mcq,
        keys.find((k) => k.questionId === mcq._id)!,
      );
      const attempts = [
        tutor.as.query(api.editor.getDraft, { versionId: v1 }),
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId: v1,
          questionId: mcq._id,
          ...input,
        }),
        tutor.as.mutation(api.editor.deleteQuestion, { versionId: v1, questionId: mcq._id }),
        tutor.as.mutation(api.editor.generate, { versionId: v1, questionId: pbq._id, seed: 1 }),
        tutor.as.mutation(api.editor.previewAttempt, { versionId: v1 }),
        tutor.as.mutation(api.editor.publish, { versionId: v1 }),
      ];
      for (const p of attempts) expect(await codeOf(p)).toBe("NOT_FOUND");
      // A question of the default can't be edited through the tutor's own draft either.
      const { versionId: mine } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: v1,
        label: "Mine",
      });
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.saveQuestion, {
            versionId: mine,
            questionId: mcq._id,
            ...input,
          }),
        ),
      ).toBe("NOT_FOUND");
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.generate, { versionId: mine, questionId: pbq._id }),
        ),
      ).toBe("NOT_FOUND");
      expect(await bytesOf(t, v1)).toBe(before);
    });

    it("an error blocks publish until fixed; a draft can't be given to a class; published is frozen", async () => {
      const { t, seeded, tutor } = await setupAll();
      const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Draft",
      });
      expect(
        await codeOf(tutor.as.mutation(api.classes.create, { name: "Early", versionId })),
      ).toBe("NOT_FOUND");

      // Choose TWO with one correct id: validate errors and publish refuses.
      const row = (await tutor.as.query(api.editor.getDraft, { versionId })).questions.find(
        ({ question }) => question.displayNumber === firstSingle.displayNumber,
      )!;
      const input = inputOf(row.question, row.key!);
      if (input.question.kind !== "mcq") throw new Error("expected an MCQ");
      await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        questionId: row.question._id,
        question: { ...input.question, chooseCount: 2 },
        key: input.key,
      });
      expect(
        errorsOf(await tutor.as.query(api.editor.validate, { versionId })).map((i) => i.rule),
      ).toEqual(["mcq.chooseCount"]);
      expect(await codeOf(tutor.as.mutation(api.editor.publish, { versionId }))).toBe(
        "VALIDATION_FAILED",
      );
      expect((await rowsOf(t, versionId)).version?.status).toBe("draft");

      // Fixed, it publishes; then every write is refused (ED-4).
      const second = input.question.options.find((o) => o.id !== input.key.correct![0])!.id;
      await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        questionId: row.question._id,
        question: { ...input.question, chooseCount: 2 },
        key: { ...input.key, correct: [input.key.correct![0]!, second] },
      });
      await tutor.as.mutation(api.editor.publish, { versionId });
      const frozen = await bytesOf(t, versionId);
      const pbq = (await rowsOf(t, versionId)).questions.find((q) => q.kind === "pbq")!;
      for (const p of [
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          questionId: row.question._id,
          question: { ...input.question, stem: "late edit" },
          key: input.key,
        }),
        tutor.as.mutation(api.editor.generate, { versionId, questionId: pbq._id, seed: 2 }),
        tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: pbq._id }),
        tutor.as.mutation(api.editor.publish, { versionId }),
      ])
        expect(await codeOf(p)).toBe("VALIDATION_FAILED");
      expect(await bytesOf(t, versionId)).toBe(frozen);
      // But it can be previewed and given to a class.
      await tutor.as.mutation(api.editor.previewAttempt, { versionId });
      await tutor.as.mutation(api.classes.create, { name: "Now", versionId });
    });

    it("anonymous callers get nothing from the editor", async () => {
      const { t, seeded } = await setupAll();
      for (const p of [
        t.query(api.editor.myVersions, {}),
        t.query(api.editor.getDraft, { versionId: seeded.versionId }),
        t.mutation(api.editor.createDraft, { fromVersionId: seeded.versionId, label: "x" }),
        t.mutation(api.editor.previewAttempt, { versionId: seeded.versionId }),
      ])
        expect(await codeOf(p)).toBe("UNAUTHENTICATED");
    });
  });
});
