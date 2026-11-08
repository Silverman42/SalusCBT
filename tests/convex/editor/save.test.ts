// T-602: editor saveQuestion / deleteQuestion / reorder (LLD §5.2, §10; PRD ED-8, ED-9).

import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const seed = seedJson as SeedExam;

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

/** The `issues` of a `VALIDATION_FAILED` rejection. */
async function issuesOf(p: Promise<unknown>): Promise<string[]> {
  const err = await rejection(p);
  expect(err).toBeInstanceOf(ConvexError);
  const data = (err as ConvexError<{ code: string; issues: string[] }>).data;
  expect(data.code).toBe("VALIDATION_FAILED");
  return data.issues;
}

async function versionRows(t: T, versionId: Id<"examVersions">) {
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
    return { version, questions, keys };
  });
}

const section = (rows: Doc<"questions">[], s: Doc<"questions">["section"]) =>
  rows.filter((q) => q.section === s);

async function setupDraft() {
  const t = setup();
  const seeded = await t.mutation(internal.seed.importExam, { seed });
  const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
  const other = await seedSignedIn(t, { label: "other", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
    fromVersionId: seeded.versionId,
    label: "Draft",
  });
  return { t, seeded, tutor, other, admin, versionId };
}

const mcq = {
  kind: "mcq" as const,
  section: "mcq" as const,
  domain: "2.0" as const,
  stem: "Which control is detective?",
  options: [
    { id: "A", text: "Firewall" },
    { id: "B", text: "IDS" },
    { id: "C", text: "Lock" },
    { id: "D", text: "Policy" },
  ],
  chooseCount: 1,
};
const mcqKey = { correct: ["B"], explanation: "An IDS detects." };

/** Seed PBQ 1 (sshLog: 1a–1c scored, 1d practice) as editor input. */
function seedPbq(displayNumber: string) {
  const q = seed.questions.find((x) => x.displayNumber === displayNumber)!;
  const k = seed.answerKeys.find((x) => x.displayNumber === displayNumber)!;
  if (q.kind !== "pbq") throw new Error("not a PBQ");
  return {
    question: {
      kind: "pbq" as const,
      section: q.section,
      domain: q.domain,
      stem: q.stem,
      template: q.template,
      payload: structuredClone(q.payload),
    },
    key: { parts: structuredClone(k.parts!), explanation: k.explanation },
  };
}

describe("editor save, delete and reorder (T-602)", () => {
  describe("saveQuestion", () => {
    it("adds an MCQ and its key at the end of the section", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const before = await versionRows(t, versionId);
      const res = await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        question: mcq,
        key: mcqKey,
      });
      expect(res.displayNumber).toBe("91"); // 5 set-A PBQs + 85 MCQs + 1

      const after = await versionRows(t, versionId);
      const q = after.questions.find((x) => x._id === res.questionId)!;
      expect(q).toMatchObject({ ...mcq, points: 1, order: 86, displayNumber: "91" });
      expect(q).not.toHaveProperty("correct");
      expect(after.keys.find((k) => k.questionId === res.questionId)).toMatchObject({
        correct: ["B"],
        explanation: "An IDS detects.",
        versionId,
      });
      expect(after.questions).toHaveLength(before.questions.length + 1);
      expect(after.version!.updatedAt).toBeGreaterThanOrEqual(before.version!.updatedAt);
      expect(after.version!.totalPoints).toBe(before.version!.totalPoints); // publish recomputes
    });

    it("replaces a question and its key together, keeping its place", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const { questions, keys } = await versionRows(t, versionId);
      const target = section(questions, "mcq")[3]!;
      const res = await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        questionId: target._id,
        question: { ...mcq, chooseCount: 2 },
        key: { correct: ["A", "B"], explanation: "Edited." },
      });
      expect(res).toEqual({ questionId: target._id, displayNumber: target.displayNumber });

      const after = await versionRows(t, versionId);
      expect(after.questions).toHaveLength(questions.length);
      expect(after.keys).toHaveLength(keys.length);
      const q = after.questions.find((x) => x._id === target._id)!;
      expect(q).toMatchObject({ stem: mcq.stem, chooseCount: 2, order: target.order });
      const k = after.keys.filter((x) => x.questionId === target._id);
      expect(k).toHaveLength(1);
      expect(k[0]).toMatchObject({ correct: ["A", "B"], explanation: "Edited." });
    });

    it("saves a PBQ, deriving points from the scored parts", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const { questions } = await versionRows(t, versionId);
      const target = section(questions, "pbqA")[0]!;
      const { question, key } = seedPbq("1");
      // Make the practice part scored: 4 points, and it now needs a key.
      const payload = question.payload as { parts: { id: string; scored: boolean }[] };
      payload.parts[3]!.scored = true;
      const parts = key.parts as { parts: Record<string, string>; practice?: object };
      parts.parts["1d"] = "grep";
      delete parts.practice;

      await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        questionId: target._id,
        question,
        key,
      });
      const after = await versionRows(t, versionId);
      expect(after.questions.find((x) => x._id === target._id)!.points).toBe(4);
      expect(after.keys.find((x) => x.questionId === target._id)!.parts).toEqual(parts);
    });

    it("lets a draft hold an incomplete MCQ (publish checks completeness, ED-9)", async () => {
      const { tutor, versionId } = await setupDraft();
      // Choose TWO with one answer and no explanation yet: saved; T-603 blocks publish.
      await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        question: { ...mcq, chooseCount: 2 },
        key: { correct: ["A"], explanation: "" },
      });
    });

    it("rejects a bad MCQ with field-level issues and writes nothing", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const before = await versionRows(t, versionId);
      const issues = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          question: {
            ...mcq,
            stem: "  ",
            options: [
              { id: "A", text: "x" },
              { id: "A", text: "" },
              { id: "Z", text: "y" },
            ],
            chooseCount: 3,
          },
          key: { correct: ["A", "A", "Q"], parts: { parts: {} }, explanation: "" },
        }),
      );
      expect(issues).toEqual([
        "question.stem: must not be blank",
        'question.options[1].id: duplicate option id "A"',
        "question.options[1].text: must not be blank",
        "question.options[2].id: must be one of A, B, C, D, E, F",
        "question.chooseCount: must be 1 or 2",
        "key.parts: an MCQ key has no parts",
        'key.correct[1]: repeats answer "A"',
        'key.correct[2]: "Q" is not an option',
      ]);
      const tooFew = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          question: { ...mcq, options: [{ id: "A", text: "x" }] },
          key: { correct: ["A"], explanation: "" },
        }),
      );
      expect(tooFew).toEqual(["question.options: has 1 options, expected 2–6"]);
      expect(await versionRows(t, versionId)).toEqual(before);
    });

    it("rejects a bad PBQ payload with field-level issues", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const { questions } = await versionRows(t, versionId);
      const target = section(questions, "pbqA")[0]!;
      const { question, key } = seedPbq("1");
      const payload = question.payload as { parts: Record<string, unknown>[]; log?: unknown };
      payload.parts[0]!.kind = "colour";
      payload.parts[1]!.id = "1a";
      delete payload.log;

      const issues = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          questionId: target._id,
          question,
          key,
        }),
      );
      expect(issues).toContain("question.payload.log: is required");
      expect(issues.some((i) => i.startsWith("question.payload.parts[0].kind:"))).toBe(true);

      payload.log = "log";
      payload.parts[0]!.kind = "ip";
      const dup = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          questionId: target._id,
          question,
          key,
        }),
      );
      expect(dup).toEqual(['question.payload.parts[1]: duplicate part id "1a"']);

      const mismatch = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          questionId: target._id,
          question: { ...seedPbq("1").question, template: "nmap" },
          key,
        }),
      );
      expect(mismatch).toEqual([
        'question.payload.template: payload template "sshLog" does not match "nmap"',
      ]);
    });

    it("rejects a PBQ key that misses a scored part or uses a wrong shape", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const target = section((await versionRows(t, versionId)).questions, "pbqA")[0]!;
      const { question, key } = seedPbq("1");
      const parts = key.parts as { parts: Record<string, string> };
      delete parts.parts["1b"];
      parts.parts["9z"] = "x";
      const issues = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          questionId: target._id,
          question,
          key: { ...key, correct: ["A"] },
        }),
      );
      expect(issues).toEqual([
        "key.correct: a PBQ key has no correct list",
        "key.parts.parts.1b: scored part has no key",
        "key.parts.parts.9z: unknown part id",
      ]);
      const missing = await issuesOf(
        tutor.as.mutation(api.editor.saveQuestion, {
          versionId,
          questionId: target._id,
          question,
          key: { explanation: "x" },
        }),
      );
      expect(missing).toEqual(["key.parts: is required for a PBQ"]);
    });

    it("refuses a published version (ED-4) and leaves it unchanged", async () => {
      const { t, seeded, admin } = await setupDraft();
      const before = await versionRows(t, seeded.versionId);
      const target = before.questions[0]!;
      // The admin authors the default line but can't edit a published version.
      const issues = await issuesOf(
        admin.as.mutation(api.editor.saveQuestion, {
          versionId: seeded.versionId,
          questionId: target._id,
          question: mcq,
          key: mcqKey,
        }),
      );
      expect(issues).toEqual([
        "version: a published version can't be changed; create a draft from it",
      ]);
      for (const call of [
        admin.as.mutation(api.editor.deleteQuestion, {
          versionId: seeded.versionId,
          questionId: target._id,
        }),
        admin.as.mutation(api.editor.reorder, {
          versionId: seeded.versionId,
          section: "pbqA",
          questionIds: section(before.questions, "pbqA")
            .map((q) => q._id)
            .reverse(),
        }),
      ]) {
        expect(await codeOf(call)).toBe("VALIDATION_FAILED");
      }
      expect(await versionRows(t, seeded.versionId)).toEqual(before);
    });

    it("hides other tutors' drafts and questions from other versions (NOT_FOUND)", async () => {
      const { t, seeded, tutor, other, versionId } = await setupDraft();
      expect(
        await codeOf(
          other.as.mutation(api.editor.saveQuestion, { versionId, question: mcq, key: mcqKey }),
        ),
      ).toBe("NOT_FOUND");
      // A question id from the published source, sent against the tutor's own draft.
      const foreign = (await versionRows(t, seeded.versionId)).questions[0]!;
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.saveQuestion, {
            versionId,
            questionId: foreign._id,
            question: mcq,
            key: mcqKey,
          }),
        ),
      ).toBe("NOT_FOUND");
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: foreign._id }),
        ),
      ).toBe("NOT_FOUND");
    });

    it("moves a PBQ from set A to set B and renumbers both sets and the MCQs", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const { questions } = await versionRows(t, versionId);
      const moved = section(questions, "pbqA")[1]!; // "2"
      const { question, key } = seedPbq("2");
      const res = await tutor.as.mutation(api.editor.saveQuestion, {
        versionId,
        questionId: moved._id,
        question: { ...question, section: "pbqB" },
        key,
      });
      expect(res.displayNumber).toBe("B6");

      const after = await versionRows(t, versionId);
      const a = section(after.questions, "pbqA");
      const b = section(after.questions, "pbqB");
      const m = section(after.questions, "mcq");
      expect(a.map((q) => [q.order, q.displayNumber])).toEqual([
        [1, "1"],
        [2, "2"],
        [3, "3"],
        [4, "4"],
      ]);
      expect(b.map((q) => q.displayNumber)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6"]);
      expect(b.at(-1)!._id).toBe(moved._id);
      expect(m[0]!.displayNumber).toBe("5");
      expect(m.at(-1)!.displayNumber).toBe("89");
    });
  });

  describe("deleteQuestion", () => {
    it("removes the question and its key and closes the gap", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const before = await versionRows(t, versionId);
      const victim = section(before.questions, "mcq")[0]!; // "6"
      await tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: victim._id });

      const after = await versionRows(t, versionId);
      expect(after.questions).toHaveLength(before.questions.length - 1);
      expect(after.keys).toHaveLength(before.keys.length - 1);
      expect(after.questions.some((q) => q._id === victim._id)).toBe(false);
      expect(after.keys.some((k) => k.questionId === victim._id)).toBe(false);
      const m = section(after.questions, "mcq");
      expect(m.map((q) => q.order)).toEqual(m.map((_, i) => i + 1));
      expect(m.map((q) => q.displayNumber)).toEqual(m.map((_, i) => String(i + 6)));
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.deleteQuestion, { versionId, questionId: victim._id }),
        ),
      ).toBe("NOT_FOUND");
    });
  });

  describe("reorder", () => {
    it("rewrites order densely and renumbers the section", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const before = section((await versionRows(t, versionId)).questions, "pbqB");
      const wanted = [...before].reverse().map((q) => q._id);
      await tutor.as.mutation(api.editor.reorder, {
        versionId,
        section: "pbqB",
        questionIds: wanted,
      });
      const after = section((await versionRows(t, versionId)).questions, "pbqB");
      expect(after.map((q) => q._id)).toEqual(wanted);
      expect(after.map((q) => [q.order, q.displayNumber])).toEqual([
        [1, "B1"],
        [2, "B2"],
        [3, "B3"],
        [4, "B4"],
        [5, "B5"],
      ]);
      // Content moved with its row: the old B5 stem is now B1.
      expect(after[0]!.stem).toBe(before.at(-1)!.stem);
    });

    it("rejects a list that isn't exactly the section's questions", async () => {
      const { t, tutor, versionId } = await setupDraft();
      const { questions } = await versionRows(t, versionId);
      const a = section(questions, "pbqA").map((q) => q._id);
      const mcqId = section(questions, "mcq")[0]!._id;
      const issues = await issuesOf(
        tutor.as.mutation(api.editor.reorder, {
          versionId,
          section: "pbqA",
          questionIds: [a[0]!, a[0]!, mcqId, a[1]!],
        }),
      );
      expect(issues).toEqual([
        "questionIds[1]: listed twice",
        "questionIds[2]: not in section pbqA",
        "questionIds: 3 question(s) of section pbqA not listed",
      ]);
    });
  });

  it("lets the admin edit a default-line draft", async () => {
    const { t, seeded, admin } = await setupDraft();
    const { versionId } = await admin.as.mutation(api.editor.createDraft, {
      fromVersionId: seeded.versionId,
      label: "Default v2",
    });
    const { questionId } = await admin.as.mutation(api.editor.saveQuestion, {
      versionId,
      question: mcq,
      key: mcqKey,
    });
    const after = await versionRows(t, versionId);
    expect(after.questions.some((q) => q._id === questionId)).toBe(true);
  });
});
