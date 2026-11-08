// T-504: shareLinks.create / revoke / forAttempt / view (CL-9, SE-3; LLD §5.1,
// §8.3, §12.1). Uses the real seed.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorCodeOf } from "../../../convex/lib/errors";
import { PUBLIC_ID_PATTERN } from "../../../convex/shareLinks";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "b".repeat(64);
const seed = seedJson as SeedExam;

const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

type Ctx = { t: T; attemptId: Id<"attempts">; versionId: Id<"examVersions"> };

async function startAttempt(t: T, tok = token(), extra: Record<string, unknown> = {}) {
  const { attemptId } = await t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken: tok,
    mode: "standard",
    ipHash: IP_HASH,
    ...extra,
  });
  return attemptId;
}

async function submitted(extra: Record<string, unknown> = {}): Promise<Ctx> {
  const t = setup();
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const attemptId = await startAttempt(t, token(), extra);
  await t.mutation(api.attempts.submit, { attemptId, anonToken: token() });
  return { t, attemptId, versionId };
}

const create = (c: Ctx, anonToken = token(), attemptId = c.attemptId) =>
  c.t.mutation(api.shareLinks.create, { attemptId, anonToken });
const revoke = (c: Ctx, publicId: string, anonToken = token()) =>
  c.t.mutation(api.shareLinks.revoke, { publicId, anonToken });
const view = (c: Ctx, publicId: string) => c.t.query(api.shareLinks.view, { publicId });
const forAttempt = (c: Ctx, anonToken = token()) =>
  c.t.query(api.shareLinks.forAttempt, { attemptId: c.attemptId, anonToken });

describe("shareLinks (T-504)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("create", () => {
    it("makes a 22-character, 128-bit publicId for the owner of a submitted attempt", async () => {
      const c = await submitted();
      const { publicId } = await create(c);
      expect(publicId).toMatch(PUBLIC_ID_PATTERN);
      const rows = await c.t.run((ctx) => ctx.db.query("shareLinks").collect());
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ attemptId: c.attemptId, publicId });
      expect(rows[0]!.createdAt).toBeGreaterThanOrEqual(NOW);
      expect(rows[0]!.revokedAt).toBeUndefined();
    });

    it("is idempotent: one active link per attempt", async () => {
      const c = await submitted();
      const a = await create(c);
      const b = await create(c);
      expect(b).toEqual(a);
      expect(await c.t.run((ctx) => ctx.db.query("shareLinks").collect())).toHaveLength(1);
    });

    it("refuses an attempt that isn't submitted (NOT_FOUND)", async () => {
      const t = setup();
      await t.mutation(internal.seed.importExam, { seed });
      const attemptId = await startAttempt(t);
      const c = { t, attemptId } as Ctx;
      expect(await codeOf(create(c))).toBe("NOT_FOUND");
      await t.run((ctx) => ctx.db.patch("attempts", attemptId, { status: "expired" }));
      expect(await codeOf(create(c))).toBe("NOT_FOUND");
    });

    it("refuses another token (NOT_FOUND) and a malformed token (BAD_TOKEN)", async () => {
      const c = await submitted();
      expect(await codeOf(create(c, token(1)))).toBe("NOT_FOUND");
      expect(await codeOf(create(c, "short"))).toBe("BAD_TOKEN");
      expect(await c.t.run((ctx) => ctx.db.query("shareLinks").collect())).toHaveLength(0);
    });

    it("spends a shareLinkCreate token only for a new link (20 per day)", async () => {
      const c = await submitted();
      // 20 create → revoke cycles use the day's allowance; repeats in between are free.
      for (let i = 0; i < 20; i++) {
        const { publicId } = await create(c);
        await create(c);
        await revoke(c, publicId);
      }
      expect(await codeOf(create(c))).toBe("RATE_LIMITED");
      vi.setSystemTime(NOW + 24 * 60 * 60_000);
      expect((await create(c)).publicId).toMatch(PUBLIC_ID_PATTERN);
    });
  });

  describe("revoke", () => {
    it("stops the link at once; revoking again is a no-op; create then makes a new id", async () => {
      const c = await submitted();
      const { publicId } = await create(c);
      expect(await view(c, publicId)).not.toBeNull();
      vi.setSystemTime(NOW + 5_000);
      await revoke(c, publicId);
      expect(await view(c, publicId)).toBeNull();
      await revoke(c, publicId);
      const row = await c.t.run((ctx) => ctx.db.query("shareLinks").first());
      expect(row!.revokedAt).toBeGreaterThanOrEqual(NOW + 5_000);
      expect(await forAttempt(c)).toBeNull();

      const again = await create(c);
      expect(again.publicId).not.toBe(publicId);
      expect(await view(c, publicId)).toBeNull();
      expect(await view(c, again.publicId)).not.toBeNull();
    });

    it("refuses another token, an unknown id and a malformed id alike (NOT_FOUND)", async () => {
      const c = await submitted();
      const { publicId } = await create(c);
      expect(await codeOf(revoke(c, publicId, token(1)))).toBe("NOT_FOUND");
      expect(await codeOf(revoke(c, "A".repeat(22)))).toBe("NOT_FOUND");
      expect(await codeOf(revoke(c, "bogus"))).toBe("NOT_FOUND");
      expect(await codeOf(revoke(c, publicId, "short"))).toBe("BAD_TOKEN");
      expect(await view(c, publicId)).not.toBeNull();
    });
  });

  describe("forAttempt", () => {
    it("returns the owner's active link or null, and hides the attempt from others", async () => {
      const c = await submitted();
      expect(await forAttempt(c)).toBeNull();
      const { publicId } = await create(c);
      const row = await c.t.run((ctx) => ctx.db.query("shareLinks").first());
      expect(await forAttempt(c)).toEqual({ publicId, createdAt: row!.createdAt });
      expect(await codeOf(forAttempt(c, token(1)))).toBe("NOT_FOUND");
    });
  });

  describe("view", () => {
    it("returns the result and review of a live link, matching the owner's own view", async () => {
      const c = await submitted();
      const { publicId } = await create(c);
      const shared = await view(c, publicId);
      const own = { attemptId: c.attemptId, anonToken: token() };
      const { attemptId: _a, ...result } = await c.t.query(api.review.getResult, own);
      expect(shared).toEqual({ result, review: await c.t.query(api.review.getReview, own) });
    });

    it("allow-lists its fields: no anonKey, ip hash, class, display name or attempt id", async () => {
      const t = setup();
      const { versionId } = await t.mutation(internal.seed.importExam, { seed });
      const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
      const { code } = await tutor.as.mutation(api.classes.create, { name: "K", versionId });
      const attemptId = await startAttempt(t, token(), { classCode: code, displayName: "Sam Q" });
      await t.mutation(api.attempts.submit, { attemptId, anonToken: token() });
      const c = { t, attemptId, versionId };
      const { publicId } = await create(c);
      const shared = await view(c, publicId);
      expect(shared).not.toBeNull();

      expect(Object.keys(shared!).sort()).toEqual(["result", "review"]);
      expect(Object.keys(shared!.result).sort()).toEqual(
        [
          "comfortScaled",
          "domainTarget",
          "examTitle",
          "mode",
          "passScaled",
          "result",
          "startedAt",
          "submittedAt",
          "submittedBy",
        ].sort(),
      );
      const attempt = await t.run((ctx) => ctx.db.get("attempts", attemptId));
      const json = JSON.stringify(shared);
      for (const secret of [
        attempt!.anonKey,
        IP_HASH,
        token(),
        code,
        "Sam Q",
        attemptId,
        attempt!.classId!,
        '"anonKey"',
        '"ipHash"',
        '"classId"',
        '"displayName"',
        '"attemptId"',
      ]) {
        expect(json).not.toContain(secret);
      }
    });

    it("unknown, malformed, revoked and deleted links all return null", async () => {
      const c = await submitted();
      const { publicId } = await create(c);
      expect(await view(c, "A".repeat(22))).toBeNull();
      expect(await view(c, "bogus")).toBeNull();
      expect(await view(c, "")).toBeNull();
      expect(await view(c, `${publicId}x`)).toBeNull();

      // Deleting the attempt deletes the link (CL-11); a stray link to a
      // missing attempt is also null.
      await c.t.run((ctx) => ctx.db.delete("attempts", c.attemptId));
      expect(await view(c, publicId)).toBeNull();
    });

    it("is null if the link's owner no longer matches the attempt", async () => {
      const c = await submitted();
      const { publicId } = await create(c);
      await c.t.run(async (ctx) => {
        const link = await ctx.db.query("shareLinks").first();
        await ctx.db.patch("shareLinks", link!._id, { anonKey: "f".repeat(64) });
      });
      expect(await view(c, publicId)).toBeNull();
    });
  });
});
