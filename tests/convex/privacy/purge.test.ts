// T-219: the purgeIpHashes cron (LLD §12.3, PRD PR-3). IP hashes on attempts
// and audit rows, rate-limiter buckets and Better Auth's raw IPs are removed
// after 30 days; newer ones and every other field stay as they were.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { components, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import crons from "../../../convex/crons";
import { rateLimiter } from "../../../convex/lib/rateLimits";
import { IP_HASH_RETENTION_MS, PURGE_BATCH } from "../../../convex/privacy";
import { seedVersion, setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T02:30:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;
const OLD = NOW - 31 * DAY;
const RECENT = NOW - 29 * DAY;
const hash = (n: number) => n.toString(16).padStart(64, "0");

async function insertAttempt(
  t: T,
  versionId: Id<"examVersions">,
  startedAt: number,
  ipHash: string | undefined,
): Promise<Id<"attempts">> {
  return await t.run((ctx) =>
    ctx.db.insert("attempts", {
      anonKey: "a".repeat(64),
      displayName: "Sam",
      versionId,
      mode: "standard",
      status: "submitted",
      startedAt,
      deadline: startedAt + 90 * 60_000,
      submittedAt: startedAt + 60 * 60_000,
      submittedBy: "student",
      shuffleSeed: 42,
      ...(ipHash !== undefined ? { ipHash } : {}),
    }),
  );
}

async function insertAudit(t: T, at: number, ipHash: string): Promise<Id<"auditLog">> {
  return await t.run((ctx) =>
    ctx.db.insert("auditLog", {
      action: "auth.otp_requested",
      target: "tutor@example.com",
      meta: { note: "kept" },
      ipHash,
      at,
    }),
  );
}

const getAttempt = (t: T, id: Id<"attempts">) =>
  t.run((ctx) => ctx.db.get("attempts", id)) as Promise<Doc<"attempts">>;
const getAudit = (t: T, id: Id<"auditLog">) =>
  t.run((ctx) => ctx.db.get("auditLog", id)) as Promise<Doc<"auditLog">>;

/** Run the cron's entry point and every job it schedules. */
async function runPurge(t: T) {
  await t.mutation(internal.privacy.purgeIpHashes, {});
  await t.finishAllScheduledFunctions(vi.runAllTimers);
}

describe("purgeIpHashes (T-219, PR-3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is scheduled daily at 02:30 UTC next to the existing jobs", () => {
    const jobs = (crons as unknown as { crons: Record<string, { schedule: unknown }> }).crons;
    expect(Object.keys(jobs).sort()).toEqual(
      ["expireInvitations", "purgeIpHashes", "sweepOpenAttempts"].sort(),
    );
    expect(jobs.purgeIpHashes!.schedule).toEqual({ type: "cron", cron: "30 2 * * *" });
    expect(IP_HASH_RETENTION_MS).toBe(30 * DAY);
  });

  it("clears 31-day-old hashes on attempts and audit rows and keeps 29-day-old ones", async () => {
    const t = setup();
    const versionId = await seedVersion(t);
    const oldAttempt = await insertAttempt(t, versionId, OLD, hash(1));
    const recentAttempt = await insertAttempt(t, versionId, RECENT, hash(2));
    const noHash = await insertAttempt(t, versionId, OLD, undefined);
    const oldAudit = await insertAudit(t, OLD, hash(3));
    const recentAudit = await insertAudit(t, RECENT, hash(4));
    const before = {
      oldAttempt: await getAttempt(t, oldAttempt),
      recentAttempt: await getAttempt(t, recentAttempt),
      noHash: await getAttempt(t, noHash),
      oldAudit: await getAudit(t, oldAudit),
      recentAudit: await getAudit(t, recentAudit),
    };

    await runPurge(t);

    // Only `ipHash` goes; every other field is unchanged.
    const { ipHash: _a, ...oldAttemptRest } = before.oldAttempt;
    expect(_a).toBe(hash(1));
    expect(await getAttempt(t, oldAttempt)).toEqual(oldAttemptRest);
    expect(await getAttempt(t, recentAttempt)).toEqual(before.recentAttempt);
    expect(await getAttempt(t, noHash)).toEqual(before.noHash);
    const { ipHash: _b, ...oldAuditRest } = before.oldAudit;
    expect(_b).toBe(hash(3));
    expect(await getAudit(t, oldAudit)).toEqual(oldAuditRest);
    expect(await getAudit(t, recentAudit)).toEqual(before.recentAudit);

    // The 29-day-old hashes go two days later.
    vi.setSystemTime(NOW + 2 * DAY);
    await runPurge(t);
    expect((await getAttempt(t, recentAttempt)).ipHash).toBeUndefined();
    expect((await getAudit(t, recentAudit)).ipHash).toBeUndefined();
  });

  it("works in bounded pages and reschedules itself until every store is done", async () => {
    const t = setup();
    const versionId = await seedVersion(t);
    const old: Id<"attempts">[] = [];
    const recent: Id<"attempts">[] = [];
    // Interleave old and recent rows across more than two pages of the index.
    for (let i = 0; i < PURGE_BATCH * 2 + 10; i++) {
      const isOld = i % 2 === 0;
      const id = await insertAttempt(t, versionId, isOld ? OLD - i : RECENT + i, hash(i));
      (isOld ? old : recent).push(id);
    }

    const first = await t.mutation(internal.privacy.purgeAttemptIpHashes, {
      cutoff: NOW - IP_HASH_RETENTION_MS,
      cursor: null,
    });
    expect(first).toBeGreaterThan(0);
    expect(first).toBeLessThanOrEqual(PURGE_BATCH);
    const pending = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(pending.filter((j) => j.name.includes("purgeAttemptIpHashes"))).toHaveLength(1);

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const docs = await t.run(async (ctx) => ({
      old: await Promise.all(old.map((id) => ctx.db.get("attempts", id))),
      recent: await Promise.all(recent.map((id) => ctx.db.get("attempts", id))),
    }));
    expect(docs.old.every((d) => d!.ipHash === undefined)).toBe(true);
    expect(docs.recent.every((d) => typeof d!.ipHash === "string")).toBe(true);
  });

  it("drops rate-limiter buckets first created more than 30 days ago", async () => {
    const t = setup();
    vi.setSystemTime(OLD);
    await t.run((ctx) => rateLimiter.limit(ctx, "attemptStartIp", { key: hash(10) }));
    vi.setSystemTime(RECENT);
    await t.run((ctx) => rateLimiter.limit(ctx, "attemptStartIp", { key: hash(11) }));
    vi.setSystemTime(NOW);

    await runPurge(t);

    // `ts` is 0 when the component has no row for the key.
    const value = (key: string) =>
      t.run((ctx) => rateLimiter.getValue(ctx, "attemptStartIp", { key }));
    expect((await value(hash(10))).ts).toBe(0);
    expect((await value(hash(11))).ts).toBe(RECENT);
  });

  it("removes Better Auth's raw IPs older than 30 days: rateLimit rows and session.ipAddress", async () => {
    const t = setup();
    const create = (model: "rateLimit" | "session", data: Record<string, unknown>) =>
      t.run(
        async (ctx) =>
          (
            (await ctx.runMutation(components.betterAuth.adapter.create, {
              input: { model, data } as never,
            })) as { _id: string }
          )._id,
      );
    const oldLimit = await create("rateLimit", {
      key: "203.0.113.7/email-otp/send-verification-otp",
      count: 1,
      lastRequest: OLD,
    });
    const recentLimit = await create("rateLimit", {
      key: "203.0.113.8/email-otp/send-verification-otp",
      count: 2,
      lastRequest: RECENT,
    });
    const session = (createdAt: number, ip: string) =>
      create("session", {
        userId: "user-1",
        token: crypto.randomUUID(),
        createdAt,
        updatedAt: NOW - DAY,
        expiresAt: NOW + 6 * DAY,
        ipAddress: ip,
        userAgent: "Firefox",
      });
    const oldSession = await session(OLD, "203.0.113.7");
    const recentSession = await session(RECENT, "203.0.113.8");

    const find = (model: "rateLimit" | "session", id: string) =>
      t.run((ctx) =>
        ctx.runQuery(components.betterAuth.adapter.findOne, {
          model,
          where: [{ field: "_id", value: id }],
        }),
      ) as Promise<Record<string, unknown> | null>;
    const oldSessionBefore = await find("session", oldSession);
    const recentSessionBefore = await find("session", recentSession);
    const recentLimitBefore = await find("rateLimit", recentLimit);

    await runPurge(t);

    expect(await find("rateLimit", oldLimit)).toBeNull();
    expect(await find("rateLimit", recentLimit)).toEqual(recentLimitBefore);
    expect(await find("session", oldSession)).toEqual({ ...oldSessionBefore, ipAddress: null });
    expect(await find("session", recentSession)).toEqual(recentSessionBefore);
  });
});
