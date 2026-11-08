// T-204: attempts.start (LLD §7.1) — server secret, rate limits, class codes,
// server-set deadline with the class time multiplier, scheduled auto-submit.

import type { FunctionArgs } from "convex/server";
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { sha256Hex } from "../../../convex/lib/codes";
import { errorCodeOf } from "../../../convex/lib/errors";
import { questionSeed, shuffled } from "../../../convex/lib/rng";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedProfile, seedVersion, setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const MINUTE = 60_000;
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "a".repeat(64);

/** A valid 43-character anon token, distinct per `n`. */
const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

type StartArgs = FunctionArgs<typeof api.attempts.start>;

function startArgs(over: Partial<StartArgs> = {}): StartArgs {
  return { serverSecret: SECRET, anonToken: token(), mode: "standard", ipHash: IP_HASH, ...over };
}

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return err;
}

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  return errorCodeOf(await errorOf(p));
}

/** `seedVersion` plus the exam's `defaultVersionId`, as `seed.importExam` leaves it. */
async function seedDefault(t: T): Promise<Id<"examVersions">> {
  const versionId = await seedVersion(t);
  await t.run(async (ctx) => {
    const version = (await ctx.db.get("examVersions", versionId))!;
    await ctx.db.patch("exams", version.examId, { defaultVersionId: versionId });
  });
  return versionId;
}

async function seedClass(
  t: T,
  c: {
    versionId: Id<"examVersions">;
    code?: string;
    status?: "open" | "closed";
    timeMultiplier?: number;
  },
): Promise<Id<"classes">> {
  const tutorId = await seedProfile(t, { authUserId: `tutor-${c.code ?? "x"}`, role: "tutor" });
  return await t.run((ctx) =>
    ctx.db.insert("classes", {
      tutorId,
      name: "Evening group",
      code: c.code ?? "SEC-4K7Q",
      versionId: c.versionId,
      timeMultiplier: c.timeMultiplier ?? 1,
      status: c.status ?? "open",
      createdAt: 0,
    }),
  );
}

describe("attempts.start (T-204)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("creates an in-progress attempt on the default version with a server-set 90-minute deadline", async () => {
    const t = setup();
    const versionId = await seedDefault(t);

    // A client-supplied time can't move the deadline: there is no such argument.
    const result = await t.mutation(api.attempts.start, startArgs({ displayName: "  Ada  " }));
    expect(Object.keys(result).sort()).toEqual(["attemptId", "deadline", "serverNow"]);
    // Server clock (convex-test may tick a millisecond past the faked time).
    expect(result.serverNow - NOW).toBeGreaterThanOrEqual(0);
    expect(result.serverNow - NOW).toBeLessThan(1000);
    expect(result.deadline).toBe(result.serverNow + 90 * MINUTE);

    const attempt = (await t.run((ctx) => ctx.db.get("attempts", result.attemptId)))!;
    expect(attempt).toMatchObject({
      anonKey: await sha256Hex(token()),
      displayName: "Ada",
      versionId,
      mode: "standard",
      status: "in_progress",
      startedAt: result.serverNow,
      deadline: result.deadline,
      ipHash: IP_HASH,
    });
    expect(attempt.classId).toBeUndefined();
    // The raw token is never stored (D4).
    expect(JSON.stringify(attempt)).not.toContain(token());
    expect(Number.isInteger(attempt.shuffleSeed)).toBe(true);
    expect(attempt.shuffleSeed).toBeGreaterThanOrEqual(0);
    expect(attempt.shuffleSeed).toBeLessThan(2 ** 32);
  });

  it("schedules autoSubmit at deadline + 30 s and stores the job id", async () => {
    const t = setup();
    await seedDefault(t);
    const { attemptId, deadline } = await t.mutation(api.attempts.start, startArgs());
    const job = await t.run(async (ctx) => {
      const attempt = (await ctx.db.get("attempts", attemptId))!;
      return await ctx.db.system.get("_scheduled_functions", attempt.autoSubmitJobId!);
    });
    expect(job).toMatchObject({
      name: "attempts:autoSubmit",
      args: [{ attemptId }],
      scheduledTime: deadline + 30_000,
      state: { kind: "pending" },
    });
  });

  it("stores the retake mode (PB-4)", async () => {
    const t = setup();
    await seedDefault(t);
    const { attemptId } = await t.mutation(api.attempts.start, startArgs({ mode: "retake" }));
    const attempt = await t.run((ctx) => ctx.db.get("attempts", attemptId));
    expect(attempt!.mode).toBe("retake");
  });

  describe("server secret (SE-5, LLD §15.2)", () => {
    it("rejects a wrong secret with FORBIDDEN and writes nothing", async () => {
      const t = setup();
      await seedDefault(t);
      expect(
        await codeOf(t.mutation(api.attempts.start, startArgs({ serverSecret: "nope" }))),
      ).toBe("FORBIDDEN");
      expect(
        await codeOf(t.mutation(api.attempts.start, startArgs({ serverSecret: `${SECRET}x` }))),
      ).toBe("FORBIDDEN");
      expect(await codeOf(t.mutation(api.attempts.start, startArgs({ serverSecret: "" })))).toBe(
        "FORBIDDEN",
      );
      expect(await t.run((ctx) => ctx.db.query("attempts").take(10))).toEqual([]);
    });

    it("refuses every call, even an empty secret, when SERVER_SECRET is unset", async () => {
      const t = setup();
      await seedDefault(t);
      for (const value of [undefined, ""]) {
        if (value === undefined) delete process.env.SERVER_SECRET;
        else vi.stubEnv("SERVER_SECRET", value);
        for (const serverSecret of ["", SECRET]) {
          const err = await errorOf(t.mutation(api.attempts.start, startArgs({ serverSecret })));
          expect(String(err)).toMatch(/SERVER_SECRET is not set/);
        }
      }
      expect(await t.run((ctx) => ctx.db.query("attempts").take(10))).toEqual([]);
    });

    it("checks the secret before the token", async () => {
      const t = setup();
      await seedDefault(t);
      expect(
        await codeOf(
          t.mutation(api.attempts.start, startArgs({ serverSecret: "nope", anonToken: "bad" })),
        ),
      ).toBe("FORBIDDEN");
    });
  });

  it("rejects a malformed anon token with BAD_TOKEN", async () => {
    const t = setup();
    await seedDefault(t);
    for (const anonToken of ["", "short", `${token()}x`, `${token().slice(0, 42)}!`]) {
      expect(await codeOf(t.mutation(api.attempts.start, startArgs({ anonToken })))).toBe(
        "BAD_TOKEN",
      );
    }
  });

  describe("rate limits (LLD §12.1)", () => {
    it("allows 10 starts per token per hour; the 11th is RATE_LIMITED with retryAfter", async () => {
      const t = setup();
      await seedDefault(t);
      for (let i = 0; i < 10; i++) await t.mutation(api.attempts.start, startArgs());
      const err = await errorOf(t.mutation(api.attempts.start, startArgs()));
      expect(err).toBeInstanceOf(ConvexError);
      const data = (err as ConvexError<{ code: string; retryAfter: number }>).data;
      expect(data.code).toBe("RATE_LIMITED");
      expect(data.retryAfter).toBeGreaterThan(0);
      expect(data.retryAfter).toBeLessThanOrEqual(6 * MINUTE + 1);

      // Another token is unaffected, and the first refills after retryAfter.
      await t.mutation(api.attempts.start, startArgs({ anonToken: token(1) }));
      vi.advanceTimersByTime(data.retryAfter + 5);
      await t.mutation(api.attempts.start, startArgs());
    });

    it("allows 200 starts per IP hash per hour across tokens; the 201st is RATE_LIMITED", async () => {
      const t = setup();
      await seedDefault(t);
      for (let i = 0; i < 200; i++) {
        await t.mutation(api.attempts.start, startArgs({ anonToken: token(Math.floor(i / 10)) }));
      }
      expect(
        await codeOf(t.mutation(api.attempts.start, startArgs({ anonToken: token(99) }))),
      ).toBe("RATE_LIMITED");
      await t.mutation(
        api.attempts.start,
        startArgs({ anonToken: token(99), ipHash: "b".repeat(64) }),
      );
    });

    it("a refused start (closed class) doesn't spend the token's allowance", async () => {
      const t = setup();
      const versionId = await seedDefault(t);
      await seedClass(t, { versionId, status: "closed" });
      for (let i = 0; i < 12; i++) {
        expect(
          await codeOf(
            t.mutation(
              api.attempts.start,
              startArgs({ classCode: "SEC-4K7Q", displayName: "Ada" }),
            ),
          ),
        ).toBe("CLASS_CLOSED");
      }
      for (let i = 0; i < 10; i++) await t.mutation(api.attempts.start, startArgs());
    });
  });

  describe("class codes (CL-4, EX-21)", () => {
    it("normalises the code, joins the class's version and records the class", async () => {
      const t = setup();
      await seedDefault(t);
      const classVersion = await seedVersion(t); // a second exam row + version
      const classId = await seedClass(t, { versionId: classVersion, code: "SEC-4K7Q" });

      const { attemptId } = await t.mutation(
        api.attempts.start,
        startArgs({ classCode: "  sec-4k 7q ", displayName: "Grace" }),
      );
      const attempt = await t.run((ctx) => ctx.db.get("attempts", attemptId));
      expect(attempt).toMatchObject({ classId, versionId: classVersion, displayName: "Grace" });
    });

    it("unknown code → CLASS_UNKNOWN; closed class → CLASS_CLOSED", async () => {
      const t = setup();
      const versionId = await seedDefault(t);
      await seedClass(t, { versionId, code: "SEC-CL0S", status: "closed" });
      const args = { displayName: "Ada" };
      expect(
        await codeOf(t.mutation(api.attempts.start, startArgs({ ...args, classCode: "SEC-ZZZZ" }))),
      ).toBe("CLASS_UNKNOWN");
      expect(
        await codeOf(
          t.mutation(api.attempts.start, startArgs({ ...args, classCode: "x".repeat(500) })),
        ),
      ).toBe("CLASS_UNKNOWN");
      expect(
        await codeOf(t.mutation(api.attempts.start, startArgs({ ...args, classCode: "sec-cl0s" }))),
      ).toBe("CLASS_CLOSED");
    });

    it("a blank class code means no class", async () => {
      const t = setup();
      const versionId = await seedDefault(t);
      const { attemptId } = await t.mutation(api.attempts.start, startArgs({ classCode: "   " }));
      const attempt = await t.run((ctx) => ctx.db.get("attempts", attemptId));
      expect(attempt).toMatchObject({ versionId });
      expect(attempt!.classId).toBeUndefined();
    });

    it("requires a display name of 1–40 characters after trimming for a class", async () => {
      const t = setup();
      const versionId = await seedDefault(t);
      await seedClass(t, { versionId });
      for (const displayName of [undefined, "", "    ", "x".repeat(41)]) {
        expect(
          await codeOf(
            t.mutation(
              api.attempts.start,
              startArgs({
                classCode: "SEC-4K7Q",
                ...(displayName !== undefined ? { displayName } : {}),
              }),
            ),
          ),
        ).toBe("VALIDATION_FAILED");
      }
      const { attemptId } = await t.mutation(
        api.attempts.start,
        startArgs({ classCode: "SEC-4K7Q", displayName: ` ${"x".repeat(40)} ` }),
      );
      const attempt = await t.run((ctx) => ctx.db.get("attempts", attemptId));
      expect(attempt!.displayName).toBe("x".repeat(40));
    });

    it("multiplies the time limit by the class's timeMultiplier (EX-21)", async () => {
      const t = setup();
      const versionId = await seedDefault(t);
      const cases: [string, number, number][] = [
        ["SEC-AAAA", 1, 90],
        ["SEC-BBBB", 1.25, 112.5],
        ["SEC-CCCC", 1.5, 135],
        ["SEC-DDDD", 2, 180],
      ];
      for (const [code, timeMultiplier] of cases) {
        await seedClass(t, { versionId, code, timeMultiplier });
      }
      for (const [i, [code, , minutes]] of cases.entries()) {
        const { deadline, serverNow } = await t.mutation(
          api.attempts.start,
          startArgs({ anonToken: token(i), classCode: code, displayName: "Ada" }),
        );
        expect(deadline - serverNow).toBe(minutes * MINUTE);
      }
    });
  });

  it("NOT_FOUND when there is no published default version", async () => {
    const t = setup();
    expect(await codeOf(t.mutation(api.attempts.start, startArgs()))).toBe("NOT_FOUND");
  });

  it("works on the real imported seed; the stored seed gives a stable option order", async () => {
    const t = setup();
    const { versionId } = await t.mutation(internal.seed.importExam, {
      seed: seedJson as SeedExam,
    });
    const first = await t.mutation(api.attempts.start, startArgs());
    const second = await t.mutation(api.attempts.start, startArgs({ anonToken: token(1) }));
    expect(first.deadline - first.serverNow).toBe(90 * MINUTE);

    const { a, b, q } = await t.run(async (ctx) => ({
      a: (await ctx.db.get("attempts", first.attemptId))!,
      b: (await ctx.db.get("attempts", second.attemptId))!,
      q: (await ctx.db
        .query("questions")
        .withIndex("by_version_section_order", (x) =>
          x.eq("versionId", versionId).eq("section", "mcq"),
        )
        .first())!,
    }));
    expect(a.versionId).toBe(versionId);
    expect(a.shuffleSeed).not.toBe(b.shuffleSeed); // 1 in 2^32 chance of a false failure
    const order = (seed: number) =>
      shuffled(q.options!, questionSeed(seed, q._id)).map((o) => o.id);
    // T-205 recomputes the order from the stored seed; it must not drift.
    expect(order(a.shuffleSeed)).toEqual(order(a.shuffleSeed));
    expect([...order(a.shuffleSeed)].sort()).toEqual(q.options!.map((o) => o.id).sort());
  });

  it("returns no answer-key data (SE-1)", async () => {
    const t = setup();
    await t.mutation(internal.seed.importExam, { seed: seedJson as SeedExam });
    const result = await t.mutation(api.attempts.start, startArgs());
    const json = JSON.stringify(result);
    for (const word of ["correct", "explanation", "parts", "answer", "key", "payload"]) {
      expect(json).not.toContain(word);
    }
  });
});
