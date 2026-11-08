// T-507: `content.oralQuestions` (LLD §5.1; PRD CL-10). Tutor-only: model
// answers are marking material (the leak test scans for them).

import { describe, expect, it } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup } from "../lib/fixtures";

const seed = seedJson as SeedExam;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

async function world() {
  const t = setup();
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
  const other = await seedSignedIn(t, { label: "other", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  return { t, versionId, tutor, other, admin };
}

const expected = [...seed.oralQuestions]
  .sort((a, b) => a.order - b.order)
  .map(({ order, question, modelAnswer }) => ({ order, question, modelAnswer }));

describe("content.oralQuestions (T-507)", () => {
  it("returns all 10 oral questions of the default version, in order, with model answers", async () => {
    const { versionId, tutor } = await world();
    const set = await tutor.as.query(api.content.oralQuestions, { versionId });
    expect(set).toMatchObject({ versionId, versionNo: 1, isDefault: true });
    expect(set!.questions).toHaveLength(10);
    expect(set!.questions).toEqual(expected);
    for (const q of set!.questions) {
      expect(q.question.length).toBeGreaterThan(0);
      expect(q.modelAnswer.length).toBeGreaterThan(0);
    }
  });

  it("without a versionId, uses the default exam's current version", async () => {
    const { versionId, tutor, admin } = await world();
    expect((await tutor.as.query(api.content.oralQuestions, {}))?.versionId).toBe(versionId);
    expect((await admin.as.query(api.content.oralQuestions, {}))?.questions).toEqual(expected);
  });

  it("is null without a default exam", async () => {
    const t = setup();
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    expect(await tutor.as.query(api.content.oralQuestions, {})).toBeNull();
  });

  it("refuses anonymous callers (students), so model answers never reach them", async () => {
    const { t, versionId } = await world();
    expect(await codeOf(t.query(api.content.oralQuestions, { versionId }))).toBe("UNAUTHENTICATED");
    expect(await codeOf(t.query(api.content.oralQuestions, {}))).toBe("UNAUTHENTICATED");
  });

  it("serves a tutor's own draft, hides it from other tutors, and the admin sees it", async () => {
    const { versionId, tutor, other, admin } = await world();
    const draft = await tutor.as.mutation(api.editor.createDraft, {
      fromVersionId: versionId,
      label: "Mine",
    });
    const own = await tutor.as.query(api.content.oralQuestions, { versionId: draft.versionId });
    expect(own).toMatchObject({ label: "Mine", isDefault: false });
    expect(own!.questions).toEqual(expected);
    expect(
      await codeOf(other.as.query(api.content.oralQuestions, { versionId: draft.versionId })),
    ).toBe("NOT_FOUND");
    expect(
      (await admin.as.query(api.content.oralQuestions, { versionId: draft.versionId }))?.label,
    ).toBe("Mine");
  });

  it("hides an unpublished default draft from tutors", async () => {
    const { versionId, tutor, admin } = await world();
    const draft = await admin.as.mutation(api.editor.createDraft, {
      fromVersionId: versionId,
      label: "Next default",
    });
    expect(
      await codeOf(tutor.as.query(api.content.oralQuestions, { versionId: draft.versionId })),
    ).toBe("NOT_FOUND");
  });
});
