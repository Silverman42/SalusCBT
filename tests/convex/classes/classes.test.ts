// T-501: classes.create / update / mine / lookupCode (LLD §5.1, §5.2; CL-1 to CL-4, EX-21).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { allocateClassCode, CLASS_CODE_ATTEMPTS } from "../../../convex/lib/classCodes";
import { CLASS_CODE_PATTERN } from "../../../convex/lib/codes";
import { errorCodeOf } from "../../../convex/lib/errors";
import { seedProfile, seedSignedIn, seedVersion, setup, type T } from "../lib/fixtures";

const SECRET = "test-server-secret-0123456789abcdef";
const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

/** A published (or other status) version owned by `ownerId`, on the seeded exam. */
async function seedOwnedVersion(
  t: T,
  base: Id<"examVersions">,
  ownerId: Id<"profiles">,
  status: "draft" | "published" | "archived" = "published",
): Promise<Id<"examVersions">> {
  return await t.run(async (ctx) => {
    const { examId } = (await ctx.db.get("examVersions", base))!;
    return await ctx.db.insert("examVersions", {
      examId,
      ownerId,
      label: `Own ${status}`,
      versionNo: 2,
      status,
      totalPoints: 102,
      updatedAt: 0,
    });
  });
}

async function setDefault(t: T, versionId: Id<"examVersions">) {
  await t.run(async (ctx) => {
    const { examId } = (await ctx.db.get("examVersions", versionId))!;
    await ctx.db.patch("exams", examId, { defaultVersionId: versionId });
  });
}

describe("classes (T-501)", () => {
  beforeEach(() => {
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("create", () => {
    it("creates an open class with a SEC-XXXX code and audits it", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const tutor = await seedSignedIn(t, { label: "a", role: "tutor" });
      const { classId, code } = await tutor.as.mutation(api.classes.create, {
        name: "  Evening group ",
        versionId,
      });
      expect(code).toMatch(CLASS_CODE_PATTERN);
      const cls = await t.run((ctx) => ctx.db.get("classes", classId));
      expect(cls).toMatchObject({
        tutorId: tutor.profileId,
        name: "Evening group",
        code,
        versionId,
        timeMultiplier: 1,
        status: "open",
      });
      const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actorId: tutor.profileId,
        action: "class.created",
        target: classId,
      });
    });

    it("stores an EX-21 multiplier and rejects others", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const { as } = await seedSignedIn(t, { label: "a", role: "tutor" });
      const { classId } = await as.mutation(api.classes.create, {
        name: "Extra time",
        versionId,
        timeMultiplier: 1.5,
      });
      expect((await t.run((ctx) => ctx.db.get("classes", classId)))!.timeMultiplier).toBe(1.5);
      expect(
        await codeOf(as.mutation(api.classes.create, { name: "x", versionId, timeMultiplier: 3 })),
      ).toBe("VALIDATION_FAILED");
    });

    it("rejects a blank or over-long name", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const { as } = await seedSignedIn(t, { label: "a", role: "tutor" });
      expect(await codeOf(as.mutation(api.classes.create, { name: "   ", versionId }))).toBe(
        "VALIDATION_FAILED",
      );
      expect(
        await codeOf(as.mutation(api.classes.create, { name: "x".repeat(81), versionId })),
      ).toBe("VALIDATION_FAILED");
    });

    it("accepts the tutor's own published version but not a draft or another tutor's", async () => {
      const t = setup();
      const base = await seedVersion(t);
      const a = await seedSignedIn(t, { label: "a", role: "tutor" });
      const b = await seedSignedIn(t, { label: "b", role: "tutor" });
      const own = await seedOwnedVersion(t, base, a.profileId);
      const draft = await seedOwnedVersion(t, base, a.profileId, "draft");
      const theirs = await seedOwnedVersion(t, base, b.profileId);

      await a.as.mutation(api.classes.create, { name: "Own", versionId: own });
      expect(await codeOf(a.as.mutation(api.classes.create, { name: "D", versionId: draft }))).toBe(
        "NOT_FOUND",
      );
      expect(
        await codeOf(a.as.mutation(api.classes.create, { name: "B", versionId: theirs })),
      ).toBe("NOT_FOUND");
    });

    it("requires a signed-in active tutor", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      expect(await codeOf(t.mutation(api.classes.create, { name: "x", versionId }))).toBe(
        "UNAUTHENTICATED",
      );
      const removed = await seedSignedIn(t, { label: "r", role: "tutor", status: "removed" });
      expect(await codeOf(removed.as.mutation(api.classes.create, { name: "x", versionId }))).toBe(
        "FORBIDDEN",
      );
    });

    it("retries on a code clash and gives up after a bounded number of draws", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const tutorId = await seedProfile(t, { authUserId: "x", role: "tutor" });
      await t.run((ctx) =>
        ctx.db.insert("classes", {
          tutorId,
          name: "Taken",
          code: "SEC-AAAA",
          versionId,
          timeMultiplier: 1,
          status: "open",
          createdAt: 0,
        }),
      );
      const draws = ["SEC-AAAA", "SEC-AAAA", "SEC-BBBB"];
      const code = await t.run((ctx) => allocateClassCode(ctx, () => draws.shift()!));
      expect(code).toBe("SEC-BBBB");

      let n = 0;
      const always = () => {
        n++;
        return "SEC-AAAA";
      };
      await expect(t.run((ctx) => allocateClassCode(ctx, always))).rejects.toThrow();
      expect(n).toBe(CLASS_CODE_ATTEMPTS);
    });
  });

  describe("update", () => {
    async function withClass(t: T) {
      const versionId = await seedVersion(t);
      await setDefault(t, versionId);
      const a = await seedSignedIn(t, { label: "a", role: "tutor" });
      const { classId, code } = await a.as.mutation(api.classes.create, {
        name: "Evening",
        versionId,
      });
      return { versionId, a, classId, code };
    }

    it("tutor A cannot update tutor B's class (NOT_FOUND)", async () => {
      const t = setup();
      const { classId } = await withClass(t);
      const b = await seedSignedIn(t, { label: "b", role: "tutor" });
      expect(await codeOf(b.as.mutation(api.classes.update, { classId, status: "closed" }))).toBe(
        "NOT_FOUND",
      );
      expect((await t.run((ctx) => ctx.db.get("classes", classId)))!.status).toBe("open");
    });

    it("the admin can update any class", async () => {
      const t = setup();
      const { classId } = await withClass(t);
      const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
      await admin.as.mutation(api.classes.update, { classId, name: "Renamed" });
      expect((await t.run((ctx) => ctx.db.get("classes", classId)))!.name).toBe("Renamed");
    });

    it("closing refuses new attempts, keeps past ones, and audits class.closed once", async () => {
      const t = setup();
      const { a, classId, code } = await withClass(t);
      const start = (n: number) =>
        t.mutation(api.attempts.start, {
          serverSecret: SECRET,
          anonToken: token(n),
          mode: "standard",
          ipHash: "a".repeat(64),
          classCode: code,
          displayName: "Sam",
        });
      const { attemptId } = await start(1);

      await a.as.mutation(api.classes.update, { classId, status: "closed" });
      await a.as.mutation(api.classes.update, { classId, status: "closed" });
      expect(await codeOf(start(2))).toBe("CLASS_CLOSED");
      const past = await t.run((ctx) => ctx.db.get("attempts", attemptId));
      expect(past).toMatchObject({ classId, status: "in_progress" });
      expect(await t.query(api.classes.lookupCode, { code })).toEqual({
        name: "Evening",
        open: false,
      });

      const closed = await t.run((ctx) =>
        ctx.db
          .query("auditLog")
          .filter((q) => q.eq(q.field("action"), "class.closed"))
          .collect(),
      );
      expect(closed).toHaveLength(1);

      await a.as.mutation(api.classes.update, { classId, status: "open" });
      await start(3);
    });

    it("changing the version affects new attempts only", async () => {
      const t = setup();
      const { versionId, a, classId, code } = await withClass(t);
      const own = await seedOwnedVersion(t, versionId, a.profileId);
      const start = (n: number) =>
        t.mutation(api.attempts.start, {
          serverSecret: SECRET,
          anonToken: token(n),
          mode: "standard",
          ipHash: "a".repeat(64),
          classCode: code,
          displayName: "Sam",
        });
      const first = await start(1);
      await a.as.mutation(api.classes.update, { classId, versionId: own, timeMultiplier: 2 });
      const second = await start(2);
      const [x, y] = await t.run(async (ctx) => [
        await ctx.db.get("attempts", first.attemptId),
        await ctx.db.get("attempts", second.attemptId),
      ]);
      expect(x!.versionId).toBe(versionId);
      expect(y!.versionId).toBe(own);
      expect(second.deadline - y!.startedAt).toBe(180 * 60_000);
    });

    it("validates name, multiplier and version", async () => {
      const t = setup();
      const { versionId, a, classId } = await withClass(t);
      const b = await seedSignedIn(t, { label: "b", role: "tutor" });
      const theirs = await seedOwnedVersion(t, versionId, b.profileId);
      expect(await codeOf(a.as.mutation(api.classes.update, { classId, name: "" }))).toBe(
        "VALIDATION_FAILED",
      );
      expect(await codeOf(a.as.mutation(api.classes.update, { classId, timeMultiplier: 0 }))).toBe(
        "VALIDATION_FAILED",
      );
      expect(await codeOf(a.as.mutation(api.classes.update, { classId, versionId: theirs }))).toBe(
        "NOT_FOUND",
      );
    });
  });

  describe("mine", () => {
    it("tutors see only their own classes; the admin sees all", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const a = await seedSignedIn(t, { label: "a", role: "tutor" });
      const b = await seedSignedIn(t, { label: "b", role: "tutor" });
      const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
      await a.as.mutation(api.classes.create, { name: "A1", versionId });
      await a.as.mutation(api.classes.create, { name: "A2", versionId, timeMultiplier: 1.25 });
      await b.as.mutation(api.classes.create, { name: "B1", versionId });

      const mineA = await a.as.query(api.classes.mine, {});
      expect(mineA.map((c) => c.name)).toEqual(["A2", "A1"]);
      expect(mineA[0]).toMatchObject({
        status: "open",
        versionId,
        versionLabel: "Default",
        timeMultiplier: 1.25,
        tutorId: a.profileId,
      });
      expect((await b.as.query(api.classes.mine, {})).map((c) => c.name)).toEqual(["B1"]);
      expect((await admin.as.query(api.classes.mine, {})).map((c) => c.name).sort()).toEqual([
        "A1",
        "A2",
        "B1",
      ]);
      expect(await codeOf(t.query(api.classes.mine, {}))).toBe("UNAUTHENTICATED");
    });
  });

  describe("lookupCode", () => {
    it("returns only name and open status, with start's normalisation", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const { as } = await seedSignedIn(t, { label: "a", role: "tutor" });
      const { code } = await as.mutation(api.classes.create, { name: "Evening", versionId });
      const loose = ` ${code.toLowerCase().slice(0, 4)} ${code.toLowerCase().slice(4)} `;
      expect(await t.query(api.classes.lookupCode, { code: loose })).toEqual({
        name: "Evening",
        open: true,
      });
    });

    it("returns null for unknown, blank or over-long codes", async () => {
      const t = setup();
      expect(await t.query(api.classes.lookupCode, { code: "SEC-ZZZZ" })).toBeNull();
      expect(await t.query(api.classes.lookupCode, { code: "  " })).toBeNull();
      expect(await t.query(api.classes.lookupCode, { code: "S".repeat(33) })).toBeNull();
    });

    it("reports not open when the class's version is no longer published", async () => {
      const t = setup();
      const versionId = await seedVersion(t);
      const { as } = await seedSignedIn(t, { label: "a", role: "tutor" });
      const { code } = await as.mutation(api.classes.create, { name: "Evening", versionId });
      await t.run((ctx) => ctx.db.patch("examVersions", versionId, { status: "archived" }));
      expect(await t.query(api.classes.lookupCode, { code })).toEqual({
        name: "Evening",
        open: false,
      });
    });
  });
});
