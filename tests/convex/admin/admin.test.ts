/**
 * T-406: admin tutors, removal and restore, the audit log and deleting
 * attempts (LLD §5.3, §9.2; PRD AU-4, AU-5, AU-7, PR-5).
 */
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { MAX_DELETE_ATTEMPTS, RESPONSE_BATCH } from "../../../convex/lib/attemptDeletion";
import { writeAudit } from "../../../convex/lib/audit";
import { seedSignedIn, seedVersion, setup, type T } from "../lib/fixtures";

const START = new Date("2026-11-08T10:00:00Z").getTime();

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(START);
  vi.stubEnv("SITE_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-better-auth-secret-0123456789abcdef");
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

async function codeOf(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConvexError);
  return (err as ConvexError<string>).data;
}

const sessionsOf = (t: T, userId: string) =>
  t.run(async (ctx) => {
    const res = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "session",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { cursor: null, numItems: 100 },
    })) as { page: unknown[] };
    return res.page;
  });

const auditRows = (t: T) => t.run((ctx) => ctx.db.query("auditLog").collect());

/** An attempt with `responses` answered questions and optionally a share link. */
async function seedAttempt(
  t: T,
  versionId: Id<"examVersions">,
  opts: { responses?: number; shareLink?: boolean; withJob?: boolean } = {},
) {
  return await t.run(async (ctx) => {
    const attemptId = await ctx.db.insert("attempts", {
      anonKey: "anon",
      versionId,
      mode: "standard",
      status: "in_progress",
      startedAt: Date.now(),
      deadline: Date.now() + 90 * 60_000,
      shuffleSeed: 1,
    });
    if (opts.withJob) {
      const jobId = await ctx.scheduler.runAfter(60_000, internal.attempts.autoSubmit, {
        attemptId,
      });
      await ctx.db.patch("attempts", attemptId, { autoSubmitJobId: jobId });
    }
    for (let i = 0; i < (opts.responses ?? 0); i++) {
      const questionId = await ctx.db.insert("questions", {
        versionId,
        order: i,
        section: "mcq",
        displayNumber: String(i + 1),
        kind: "mcq",
        domain: "1.0",
        points: 1,
        stem: "Q",
      });
      await ctx.db.insert("responses", {
        attemptId,
        questionId,
        value: "A",
        flagged: false,
        updatedAt: Date.now(),
      });
    }
    if (opts.shareLink) {
      await ctx.db.insert("shareLinks", {
        attemptId,
        publicId: crypto.randomUUID(),
        anonKey: "anon",
        createdAt: Date.now(),
      });
    }
    return attemptId;
  });
}

describe("access (every admin function is admin-only)", () => {
  it("refuses the signed-out with UNAUTHENTICATED and tutors with FORBIDDEN", async () => {
    const t = setup();
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    const paginationOpts = { cursor: null, numItems: 10 };
    for (const caller of [t, tutor.as]) {
      const expected = caller === t ? "UNAUTHENTICATED" : "FORBIDDEN";
      expect(await codeOf(caller.query(api.admin.tutors, {}))).toBe(expected);
      expect(await codeOf(caller.query(api.admin.audit, { paginationOpts }))).toBe(expected);
      expect(
        await codeOf(caller.mutation(api.admin.removeTutor, { profileId: tutor.profileId })),
      ).toBe(expected);
      expect(
        await codeOf(caller.mutation(api.admin.restoreTutor, { profileId: tutor.profileId })),
      ).toBe(expected);
      expect(await codeOf(caller.mutation(api.admin.deleteAttempts, { attemptIds: [] }))).toBe(
        expected,
      );
    }
    expect(await t.run((ctx) => ctx.db.get("profiles", tutor.profileId))).toMatchObject({
      status: "active",
    });
  });

  it("refuses a removed admin profile", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "admin", role: "admin", status: "removed" });
    expect(await codeOf(as.query(api.admin.tutors, {}))).toBe("FORBIDDEN");
  });
});

describe("admin.tutors (AU-5)", () => {
  it("lists tutors, active and removed, newest first, without the admin", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "admin", role: "admin" });
    const a = await seedSignedIn(t, { label: "tutor-a", role: "tutor" });
    const b = await seedSignedIn(t, { label: "tutor-b", role: "tutor", status: "removed" });
    expect(await as.query(api.admin.tutors, {})).toEqual([
      {
        profileId: b.profileId,
        email: "tutor-b@example.com",
        name: null,
        status: "removed",
        createdAt: 0,
      },
      {
        profileId: a.profileId,
        email: "tutor-a@example.com",
        name: null,
        status: "active",
        createdAt: 0,
      },
    ]);
  });
});

describe("admin.removeTutor / restoreTutor (AU-4, AU-5)", () => {
  it("removes a tutor, ends their sessions at once and audits it", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    expect(await tutor.as.query(api.profiles.me, {})).not.toBeNull();

    await admin.as.mutation(api.admin.removeTutor, { profileId: tutor.profileId });

    expect(await t.run((ctx) => ctx.db.get("profiles", tutor.profileId))).toMatchObject({
      status: "removed",
    });
    expect(await sessionsOf(t, tutor.userId)).toHaveLength(0);
    // Their next call fails: the token's session is gone.
    expect(await tutor.as.query(api.profiles.me, {})).toBeNull();
    const rows = await auditRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "tutor.removed",
      actorId: admin.profileId,
      target: "tutor@example.com",
    });

    // Again: no second audit entry.
    await admin.as.mutation(api.admin.removeTutor, { profileId: tutor.profileId });
    expect(await auditRows(t)).toHaveLength(1);
  });

  it("won't remove or restore the admin (including themselves)", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    expect(
      await codeOf(admin.as.mutation(api.admin.removeTutor, { profileId: admin.profileId })),
    ).toBe("FORBIDDEN");
    expect(
      await codeOf(admin.as.mutation(api.admin.restoreTutor, { profileId: admin.profileId })),
    ).toBe("FORBIDDEN");
    expect(await sessionsOf(t, admin.userId)).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get("profiles", admin.profileId))).toMatchObject({
      status: "active",
    });
  });

  it("answers NOT_FOUND for a deleted profile", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    await t.run((ctx) => ctx.db.delete("profiles", tutor.profileId));
    expect(
      await codeOf(admin.as.mutation(api.admin.removeTutor, { profileId: tutor.profileId })),
    ).toBe("NOT_FOUND");
  });

  it("restores a removed tutor and audits it", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    await admin.as.mutation(api.admin.removeTutor, { profileId: tutor.profileId });
    await admin.as.mutation(api.admin.restoreTutor, { profileId: tutor.profileId });

    expect(await t.run((ctx) => ctx.db.get("profiles", tutor.profileId))).toMatchObject({
      status: "active",
    });
    expect(await t.query(internal.profiles.sessionAllowed, { authUserId: tutor.userId })).toBe(
      true,
    );
    expect((await auditRows(t)).map((r) => r.action)).toEqual(["tutor.removed", "tutor.restored"]);
    // Restoring an active tutor changes nothing.
    await admin.as.mutation(api.admin.restoreTutor, { profileId: tutor.profileId });
    expect(await auditRows(t)).toHaveLength(2);
  });

  it("won't restore a tutor whose email now has another active profile", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const old = await seedSignedIn(t, { label: "tutor", role: "tutor", status: "removed" });
    // Re-invited: a new auth user and active profile for the same email.
    await t.run((ctx) =>
      ctx.db.insert("profiles", {
        authUserId: "new-user",
        email: "tutor@example.com",
        role: "tutor",
        status: "active",
        createdAt: 1,
      }),
    );
    expect(
      await codeOf(admin.as.mutation(api.admin.restoreTutor, { profileId: old.profileId })),
    ).toBe("VALIDATION_FAILED");
  });
});

describe("admin.audit (AU-7)", () => {
  it("pages newest first with the actor's email and no ipHash", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    for (let i = 0; i < 5; i++) {
      vi.setSystemTime(START + i * 1000);
      await t.run((ctx) =>
        writeAudit(ctx, {
          action: "auth.signin",
          actorId: admin.profileId,
          target: `t${i}`,
          ipHash: "secret-hash",
        }),
      );
    }
    vi.setSystemTime(START + 10_000);
    await t.run((ctx) => writeAudit(ctx, { action: "auth.otp_failed", meta: { reason: "X" } }));

    const first = await admin.as.query(api.admin.audit, {
      paginationOpts: { cursor: null, numItems: 4 },
    });
    expect(first.isDone).toBe(false);
    expect(first.page.map((r) => r.target)).toEqual([null, "t4", "t3", "t2"]);
    expect(first.page[0]).toMatchObject({
      action: "auth.otp_failed",
      actorEmail: null,
      meta: { reason: "X" },
      at: START + 10_000,
    });
    expect(first.page[1]).toMatchObject({ actorEmail: "admin@example.com", meta: null });
    expect(JSON.stringify(first)).not.toContain("secret-hash");

    const second = await admin.as.query(api.admin.audit, {
      paginationOpts: { cursor: first.continueCursor, numItems: 4 },
    });
    expect(second.page.map((r) => r.target)).toEqual(["t1", "t0"]);
    expect(second.isDone).toBe(true);
  });
});

describe("admin.deleteAttempts (PR-5)", () => {
  it("deletes any attempt with its responses and share links, and audits the count", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const versionId = await seedVersion(t);
    const doomed = await seedAttempt(t, versionId, {
      responses: 3,
      shareLink: true,
      withJob: true,
    });
    const other = await seedAttempt(t, versionId, { responses: 2, shareLink: true });
    const kept = await seedAttempt(t, versionId, { responses: 1, shareLink: true });

    const res = await admin.as.mutation(api.admin.deleteAttempts, {
      attemptIds: [doomed, other, doomed],
    });
    expect(res).toEqual({ deleted: 2 });

    await t.run(async (ctx) => {
      expect(await ctx.db.get("attempts", doomed)).toBeNull();
      expect(await ctx.db.get("attempts", other)).toBeNull();
      expect(await ctx.db.get("attempts", kept)).not.toBeNull();
      const responses = await ctx.db.query("responses").collect();
      expect(responses.map((r) => r.attemptId)).toEqual([kept]);
      const links = await ctx.db.query("shareLinks").collect();
      expect(links.map((l) => l.attemptId)).toEqual([kept]);
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      expect(jobs.find((j) => j.args[0]?.attemptId === doomed)?.state.kind).toBe("canceled");
    });
    const rows = await auditRows(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      action: "attempt.deleted",
      actorId: admin.profileId,
      meta: { count: 2 },
    });

    // Already gone: nothing deleted, nothing audited.
    expect(await admin.as.mutation(api.admin.deleteAttempts, { attemptIds: [doomed] })).toEqual({
      deleted: 0,
    });
    expect(await auditRows(t)).toHaveLength(1);
  });

  it("deletes large response sets in scheduled batches", async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const versionId = await seedVersion(t);
    const a = await seedAttempt(t, versionId, { responses: RESPONSE_BATCH });
    const b = await seedAttempt(t, versionId, { responses: 5 });

    await admin.as.mutation(api.admin.deleteAttempts, { attemptIds: [a, b] });
    // The first batch used the whole budget; `b`'s responses are left for later.
    expect(await t.run((ctx) => ctx.db.query("responses").collect())).toHaveLength(5);

    vi.useRealTimers();
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run((ctx) => ctx.db.query("responses").collect())).toHaveLength(0);
  });

  it(`refuses more than ${MAX_DELETE_ATTEMPTS} ids`, async () => {
    const t = setup();
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const versionId = await seedVersion(t);
    const id = await seedAttempt(t, versionId);
    const ids = Array.from({ length: MAX_DELETE_ATTEMPTS + 1 }, () => id);
    expect(await codeOf(admin.as.mutation(api.admin.deleteAttempts, { attemptIds: ids }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await t.run((ctx) => ctx.db.get("attempts", id))).not.toBeNull();
  });
});
