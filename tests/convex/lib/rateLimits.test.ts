import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RATE_LIMITS, enforceRateLimit, tryRateLimit } from "../../../convex/lib/rateLimits";
import { setup } from "./fixtures";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

async function rateLimitedData(p: Promise<unknown>) {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConvexError);
  return (err as ConvexError<{ code: string; retryAfter: number }>).data;
}

describe("rate limits (LLD §12.1)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-08T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("defines the §12.1 limits", () => {
    const rates = Object.fromEntries(
      Object.entries(RATE_LIMITS).map(([k, v]) => [k, [v.rate, v.period]]),
    );
    expect(rates).toEqual({
      otpRequest: [1, MINUTE],
      otpRequestHourly: [5, HOUR],
      otpRequestIp: [30, HOUR],
      attemptStartAnon: [10, HOUR],
      attemptStartIp: [200, HOUR],
      shareLinkCreate: [20, 24 * HOUR],
      invitationCreate: [50, 24 * HOUR],
    });
  });

  it("allows 10 attempt starts per anonKey per hour, then RATE_LIMITED with retryAfter", async () => {
    const t = setup();
    for (let i = 0; i < 10; i++) {
      await t.run((ctx) => enforceRateLimit(ctx, "attemptStartAnon", "anon-a"));
    }
    const data = await rateLimitedData(
      t.run((ctx) => enforceRateLimit(ctx, "attemptStartAnon", "anon-a")),
    );
    expect(data.code).toBe("RATE_LIMITED");
    expect(data.retryAfter).toBeGreaterThan(0);
    expect(data.retryAfter).toBeLessThanOrEqual(HOUR / 10 + 1);

    // Keys are independent.
    await t.run((ctx) => enforceRateLimit(ctx, "attemptStartAnon", "anon-b"));

    // A token refills after retryAfter (plus a few ms for float rounding).
    vi.advanceTimersByTime(data.retryAfter + 5);
    await t.run((ctx) => enforceRateLimit(ctx, "attemptStartAnon", "anon-a"));
  });

  it("otpRequest enforces 1 per 60 s and 5 per hour per email", async () => {
    const t = setup();
    const email = "tutor@example.com";
    await t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email));
    const soon = await rateLimitedData(t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email)));
    expect(soon.retryAfter).toBeLessThanOrEqual(MINUTE);

    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(MINUTE);
      await t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email));
    }
    // Five used within ~4 minutes: the hourly window now blocks even though
    // the 60-second window has refilled.
    vi.advanceTimersByTime(MINUTE);
    const hourly = await rateLimitedData(
      t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email)),
    );
    expect(hourly.retryAfter).toBeGreaterThan(MINUTE);
  });

  it("a refused multi-window request does not spend the other window", async () => {
    const t = setup();
    const email = "x@example.com";
    await t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email));
    // Refused by the 60 s window several times...
    for (let i = 0; i < 5; i++) {
      await rateLimitedData(t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email)));
    }
    // ...so the hourly window still has 4 left.
    for (let i = 0; i < 4; i++) {
      vi.advanceTimersByTime(MINUTE);
      await t.run((ctx) => enforceRateLimit(ctx, "otpRequest", email));
    }
  });

  it("tryRateLimit returns false instead of throwing", async () => {
    const t = setup();
    expect(await t.run((ctx) => tryRateLimit(ctx, "otpRequestIp", "ip-1"))).toBe(true);
    for (let i = 0; i < 29; i++) await t.run((ctx) => tryRateLimit(ctx, "otpRequestIp", "ip-1"));
    expect(await t.run((ctx) => tryRateLimit(ctx, "otpRequestIp", "ip-1"))).toBe(false);
  });
});
