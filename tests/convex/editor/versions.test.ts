// T-601: editor copy-on-write versions — createDraft / myVersions / getDraft
// (LLD §10.1, §5.2; PRD ED-3, ED-4, ED-5, ED-7).

import { describe, expect, it } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { requireEditableDraft } from "../../../convex/editor";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const seed = seedJson as SeedExam;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

async function importDefault(t: T) {
  return await t.mutation(internal.seed.importExam, { seed });
}

/** Every content row of a version, without ids, for before/after comparison. */
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

async function setup3() {
  const t = setup();
  const seeded = await importDefault(t);
  const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
  const other = await seedSignedIn(t, { label: "other", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  return { t, seeded, tutor, other, admin };
}

describe("editor versions (T-601)", () => {
  describe("createDraft", () => {
    it("copies every question, key and oral question into a tutor-owned draft", async () => {
      const { t, seeded, tutor } = await setup3();
      const { versionId, versionNo } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "  My Security+  ",
      });
      expect(versionNo).toBe(1);

      const src = await snapshot(t, seeded.versionId);
      const copy = await snapshot(t, versionId);
      expect(copy.version).toMatchObject({
        examId: src.version!.examId,
        ownerId: tutor.profileId,
        parentVersionId: seeded.versionId,
        label: "My Security+",
        versionNo: 1,
        status: "draft",
        totalPoints: 102,
      });
      expect(copy.version!.publishedAt).toBeUndefined();
      expect(copy.questions).toHaveLength(95);
      expect(copy.keys).toHaveLength(95);
      expect(copy.oral).toHaveLength(10);

      const strip = <R extends { _id: unknown; _creationTime: unknown; versionId: unknown }>(
        r: R,
      ) => {
        const { _id, _creationTime, versionId: _v, ...rest } = r;
        return rest;
      };
      expect(copy.questions.map(strip)).toEqual(src.questions.map(strip));
      expect(copy.oral.map(strip)).toEqual(src.oral.map(strip));

      // Keys point at the copied questions (same displayNumber), never the source.
      const srcNumber = new Map(src.questions.map((q) => [q._id, q.displayNumber]));
      const copyNumber = new Map(copy.questions.map((q) => [q._id, q.displayNumber]));
      const srcKeys = new Map(src.keys.map((k) => [srcNumber.get(k.questionId), k]));
      for (const k of copy.keys) {
        expect(copyNumber.has(k.questionId)).toBe(true);
        const original = srcKeys.get(copyNumber.get(k.questionId))!;
        expect({ correct: k.correct, parts: k.parts, explanation: k.explanation }).toEqual({
          correct: original.correct,
          parts: original.parts,
          explanation: original.explanation,
        });
      }
    });

    it("never changes the published source (ED-4)", async () => {
      const { t, seeded, tutor } = await setup3();
      const before = await snapshot(t, seeded.versionId);
      const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Copy",
      });
      // Even editing the copy's rows leaves the source alone.
      await t.run(async (ctx) => {
        const q = await ctx.db
          .query("questions")
          .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
          .first();
        await ctx.db.patch("questions", q!._id, { stem: "changed" });
      });
      expect(await snapshot(t, seeded.versionId)).toEqual(before);
    });

    it("numbers versions per owner line: max + 1", async () => {
      const { seeded, tutor, other } = await setup3();
      const a = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "A",
      });
      const b = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: a.versionId,
        label: "B",
      });
      const c = await other.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "C",
      });
      expect([a.versionNo, b.versionNo, c.versionNo]).toEqual([1, 2, 1]);
    });

    it("restores an older published version as a new draft (ED-3)", async () => {
      const { t, seeded, tutor } = await setup3();
      const v1 = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "v1",
      });
      await t.run((ctx) =>
        ctx.db.patch("examVersions", v1.versionId, { status: "published", publishedAt: 1 }),
      );
      const restored = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: v1.versionId,
        label: "Restore v1",
      });
      expect(restored.versionNo).toBe(2);
      const copy = await snapshot(t, restored.versionId);
      expect(copy.version).toMatchObject({ parentVersionId: v1.versionId, status: "draft" });
      expect(copy.questions).toHaveLength(95);
    });

    it("gives the admin a default-line draft numbered after the seeded versions", async () => {
      const { t, seeded, admin } = await setup3();
      const { versionId, versionNo } = await admin.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Default next",
      });
      expect(versionNo).toBe(2);
      const copy = await snapshot(t, versionId);
      expect(copy.version!.ownerId).toBeUndefined();
      expect(copy.version!.status).toBe("draft");
      // The exam's default is unchanged until publish (T-603).
      const exam = await t.run((ctx) => ctx.db.get("exams", seeded.examId));
      expect(exam!.defaultVersionId).toBe(seeded.versionId);
    });

    it("refuses another tutor's version and an unpublished default draft (NOT_FOUND)", async () => {
      const { seeded, tutor, other, admin } = await setup3();
      const mine = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Mine",
      });
      expect(
        await codeOf(
          other.as.mutation(api.editor.createDraft, { fromVersionId: mine.versionId, label: "x" }),
        ),
      ).toBe("NOT_FOUND");
      const adminDraft = await admin.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Default draft",
      });
      expect(
        await codeOf(
          tutor.as.mutation(api.editor.createDraft, {
            fromVersionId: adminDraft.versionId,
            label: "x",
          }),
        ),
      ).toBe("NOT_FOUND");
    });

    it("rejects an empty or over-long label", async () => {
      const { seeded, tutor } = await setup3();
      for (const label of ["   ", "x".repeat(81)]) {
        expect(
          await codeOf(
            tutor.as.mutation(api.editor.createDraft, { fromVersionId: seeded.versionId, label }),
          ),
        ).toBe("VALIDATION_FAILED");
      }
    });

    it("requires an active tutor or admin", async () => {
      const { t, seeded } = await setup3();
      expect(
        await codeOf(
          t.mutation(api.editor.createDraft, { fromVersionId: seeded.versionId, label: "x" }),
        ),
      ).toBe("UNAUTHENTICATED");
      const removed = await seedSignedIn(t, { label: "gone", role: "tutor", status: "removed" });
      expect(
        await codeOf(
          removed.as.mutation(api.editor.createDraft, {
            fromVersionId: seeded.versionId,
            label: "x",
          }),
        ),
      ).toBe("FORBIDDEN");
    });
  });

  describe("myVersions", () => {
    it("shows a tutor their own versions and published defaults only (ED-5)", async () => {
      const { seeded, tutor, other, admin } = await setup3();
      const mine = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Mine",
      });
      const theirs = await other.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Theirs",
      });
      const adminDraft = await admin.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Default draft",
      });

      const list = await tutor.as.query(api.editor.myVersions, {});
      expect(list.map((v) => v.versionId)).toEqual([mine.versionId, seeded.versionId]);
      expect(list[0]).toMatchObject({
        status: "draft",
        ownerId: tutor.profileId,
        isDefault: false,
        editable: true,
        authored: true,
        parentVersionId: seeded.versionId,
      });
      expect(list[1]).toMatchObject({
        status: "published",
        ownerId: null,
        isDefault: true,
        editable: false,
        authored: false,
      });

      const all = await admin.as.query(api.editor.myVersions, {});
      expect(new Set(all.map((v) => v.versionId))).toEqual(
        new Set([seeded.versionId, mine.versionId, theirs.versionId, adminDraft.versionId]),
      );
      const byId = new Map(all.map((v) => [v.versionId, v]));
      expect(byId.get(adminDraft.versionId)!.editable).toBe(true);
      expect(byId.get(mine.versionId)!.editable).toBe(false); // owner edits only
      expect(byId.get(seeded.versionId)!.editable).toBe(false); // published
    });
  });

  describe("getDraft", () => {
    it("returns the owner's version with keys and oral questions", async () => {
      const { seeded, tutor } = await setup3();
      const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Mine",
      });
      const draft = await tutor.as.query(api.editor.getDraft, { versionId });
      expect(draft.version).toMatchObject({ versionId, editable: true, status: "draft" });
      expect(draft.questions).toHaveLength(95);
      expect(draft.questions.every((q) => q.key?.questionId === q.question._id)).toBe(true);
      expect(draft.questions.slice(0, 10).map((q) => q.question.section)).toEqual([
        ...Array<string>(5).fill("pbqA"),
        ...Array<string>(5).fill("pbqB"),
      ]);
      const mcqOrders = draft.questions.slice(10).map((q) => q.question.order);
      expect(mcqOrders).toEqual([...mcqOrders].sort((a, b) => a - b));
      expect(draft.oral).toHaveLength(10);
    });

    it("hides other tutors' versions and the default's keys from tutors", async () => {
      const { seeded, tutor, other, admin } = await setup3();
      const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Mine",
      });
      expect(await codeOf(other.as.query(api.editor.getDraft, { versionId }))).toBe("NOT_FOUND");
      expect(
        await codeOf(tutor.as.query(api.editor.getDraft, { versionId: seeded.versionId })),
      ).toBe("NOT_FOUND");
      // ED-5: the admin sees every version.
      const asAdmin = await admin.as.query(api.editor.getDraft, { versionId });
      expect(asAdmin.version.editable).toBe(false);
      expect(asAdmin.questions).toHaveLength(95);
    });
  });

  describe("requireEditableDraft (used by save/publish)", () => {
    it("refuses published versions and other owners' drafts", async () => {
      const { t, seeded, tutor, other, admin } = await setup3();
      const { versionId } = await tutor.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Mine",
      });
      const adminDraft = await admin.as.mutation(api.editor.createDraft, {
        fromVersionId: seeded.versionId,
        label: "Default draft",
      });
      const check = (who: { profileId: Id<"profiles"> }, id: Id<"examVersions">) =>
        t.run(async (ctx) => {
          const profile = (await ctx.db.get("profiles", who.profileId))!;
          return (await requireEditableDraft(ctx, profile, id))._id;
        });

      expect(await check(tutor, versionId)).toBe(versionId);
      expect(await check(admin, adminDraft.versionId)).toBe(adminDraft.versionId);
      expect(await codeOf(check(other, versionId))).toBe("NOT_FOUND");
      expect(await codeOf(check(tutor, adminDraft.versionId))).toBe("NOT_FOUND");
      expect(await codeOf(check(admin, versionId))).toBe("VALIDATION_FAILED");
      // Published: the seeded default, even for the admin, and a tutor's own.
      expect(await codeOf(check(admin, seeded.versionId))).toBe("VALIDATION_FAILED");
      await t.run((ctx) => ctx.db.patch("examVersions", versionId, { status: "published" }));
      expect(await codeOf(check(tutor, versionId))).toBe("VALIDATION_FAILED");
    });
  });
});
