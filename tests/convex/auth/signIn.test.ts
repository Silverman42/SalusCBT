/**
 * T-402: Better Auth configuration (LLD §9.1, PRD AU-1 to AU-4), exercised
 * through the real `/api/auth/*` HTTP routes in convex-test.
 *
 * Only `Date` is faked: moving the clock with `vi.setSystemTime` expires
 * codes and refills limits, and scheduled emails never run, so each test
 * reads the code from the scheduled `email.send.send` job instead.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { components } from "../../../convex/_generated/api";
import { AUTH_LIMITS, createAuth } from "../../../convex/auth";
import { CLIENT_IP_HEADER, PROXY_SECRET_HEADER } from "../../../convex/lib/clientIp";
import { setup, type T } from "../lib/fixtures";

const SITE = "http://localhost:3000";
const SECRET = "test-better-auth-secret-0123456789abcdef";
const MINUTE = 60_000;
const START = new Date("2026-11-08T10:00:00Z").getTime();

let ipCounter = 0;
/** A fresh documentation-range IP, so Better Auth's per-IP limits stay out of the way. */
const freshIp = () => `198.51.100.${++ipCounter % 250}`;

/** A test client, possibly with request metadata attached (which drops registerComponent). */
type Caller = Pick<T, "fetch">;

async function invite(t: T, email: string, status: "active" | "removed" = "active") {
  await t.run(async (ctx) => {
    const auth = await createAuth(ctx).$context;
    const user = await auth.internalAdapter.createUser(
      { email, name: email, emailVerified: true },
      { method: "invitation" },
    );
    await ctx.db.insert("profiles", {
      authUserId: user.id,
      email,
      role: "tutor",
      status,
      createdAt: Date.now(),
    });
  });
}

function post(t: Caller, path: string, body: unknown, headers: Record<string, string> = {}) {
  return t.fetch(`/api/auth${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: SITE,
      [CLIENT_IP_HEADER]: freshIp(),
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function requestCode(
  t: Caller,
  email: string,
  opts: { type?: string; headers?: Record<string, string> } = {},
) {
  return post(
    t,
    "/email-otp/send-verification-otp",
    { email, type: opts.type ?? "sign-in" },
    opts.headers,
  );
}

function signIn(t: T, email: string, otp: string, headers?: Record<string, string>) {
  return post(t, "/sign-in/email-otp", { email, otp }, headers);
}

/** Codes scheduled for `email`, oldest first. */
async function codesSentTo(t: T, email: string): Promise<string[]> {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs
    .map((j) => j.args[0] as { to?: string; tag?: string; text?: string })
    .filter((m) => m.tag === "otp" && m.to === email)
    .map((m) => /code is: (\d+)/.exec(m.text ?? "")![1]!);
}

async function errorCode(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { code?: string }).code;
}

describe("Better Auth sign-in by code (T-402)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    vi.stubEnv("SITE_URL", SITE);
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
    vi.stubEnv("SERVER_SECRET", "");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("sends a 6-digit code to an active tutor; signing in sets an HttpOnly cookie and a 7-day session (AU-1, AU-4)", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");

    const res = await requestCode(t, "tutor@example.com");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
    const codes = await codesSentTo(t, "tutor@example.com");
    expect(codes).toHaveLength(1);
    expect(codes[0]).toMatch(/^\d{6}$/);

    const signedIn = await signIn(t, "tutor@example.com", codes[0]!);
    expect(signedIn.status).toBe(200);
    const { token } = (await signedIn.json()) as { token: string };
    expect(signedIn.headers.get("set-cookie")).toMatch(/session_token=.*HttpOnly/i);

    const session = (await t.run((ctx) =>
      ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "session",
        where: [{ field: "token", value: token }],
      }),
    )) as { expiresAt: number } | null;
    expect(session?.expiresAt).toBe(START + AUTH_LIMITS.sessionExpiresInS * 1000);
  });

  it("answers unknown, removed and non-sign-in requests the same way and sends nothing", async () => {
    const t = setup();
    await invite(t, "active@example.com");
    await invite(t, "removed@example.com", "removed");

    const responses = [
      await requestCode(t, "nobody@example.com"),
      await requestCode(t, "removed@example.com"),
      await requestCode(t, "active@example.com", { type: "email-verification" }),
      await requestCode(t, "active@example.com", { type: "forget-password" }),
    ];
    for (const res of responses) {
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('{"success":true}');
    }
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(jobs).toHaveLength(0);
  });

  it("doesn't create a user for an unknown email (sign-up is closed)", async () => {
    const t = setup();
    await requestCode(t, "stranger@example.com");
    const res = await signIn(t, "stranger@example.com", "123456");
    expect(res.status).toBe(400);
    const user = await t.run((ctx) =>
      ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "email", value: "stranger@example.com" }],
      }),
    );
    expect(user).toBeNull();
  });

  it("accepts a code until 10 minutes have passed, then refuses it (AU-2)", async () => {
    const t = setup();
    await invite(t, "early@example.com");
    await invite(t, "late@example.com");
    await requestCode(t, "early@example.com");
    await requestCode(t, "late@example.com");
    const [early] = await codesSentTo(t, "early@example.com");
    const [late] = await codesSentTo(t, "late@example.com");

    vi.setSystemTime(START + 10 * MINUTE - 1000);
    expect((await signIn(t, "early@example.com", early!)).status).toBe(200);

    vi.setSystemTime(START + 10 * MINUTE + 1000);
    const res = await signIn(t, "late@example.com", late!);
    expect(res.status).toBe(400);
    expect(await errorCode(res)).toBe("OTP_EXPIRED");
  });

  it("allows 5 tries; the 6th is refused even with the right code (AU-2)", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    await requestCode(t, "tutor@example.com");
    const [code] = await codesSentTo(t, "tutor@example.com");
    const wrong = code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) {
      const res = await signIn(t, "tutor@example.com", wrong);
      expect(res.status).toBe(400);
      expect(await errorCode(res)).toBe("INVALID_OTP");
    }
    const sixth = await signIn(t, "tutor@example.com", code!);
    expect(sixth.status).toBe(403);
    expect(await errorCode(sixth)).toBe("TOO_MANY_ATTEMPTS");
    // The code is gone: trying again doesn't revive it.
    expect((await signIn(t, "tutor@example.com", code!)).status).toBe(400);
  });

  it("signs in on the 5th try after 4 wrong ones", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    await requestCode(t, "tutor@example.com");
    const [code] = await codesSentTo(t, "tutor@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await signIn(t, "tutor@example.com", wrong);
    expect((await signIn(t, "tutor@example.com", code!)).status).toBe(200);
  });

  it("refuses a second request from the same IP within 60 s with 429 (AU-3)", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    const ip = { [CLIENT_IP_HEADER]: "203.0.113.7" };
    expect((await requestCode(t, "tutor@example.com", { headers: ip })).status).toBe(200);
    expect((await requestCode(t, "other@example.com", { headers: ip })).status).toBe(429);
    vi.setSystemTime(START + MINUTE + 1000);
    expect((await requestCode(t, "other@example.com", { headers: ip })).status).toBe(200);
  });

  it("silently drops a second request for the same email within 60 s, keeping the first code valid (AU-3)", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    await requestCode(t, "tutor@example.com");
    vi.setSystemTime(START + 30_000);
    const again = await requestCode(t, "tutor@example.com"); // another IP
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ success: true });
    const codes = await codesSentTo(t, "tutor@example.com");
    expect(codes).toHaveLength(1);
    // The refused request didn't replace the code that was sent.
    expect((await signIn(t, "tutor@example.com", codes[0]!)).status).toBe(200);

    vi.setSystemTime(START + MINUTE + 1000);
    await requestCode(t, "tutor@example.com");
    expect(await codesSentTo(t, "tutor@example.com")).toHaveLength(2);
  });

  it("sends at most 5 codes per email per hour (AU-3)", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    for (let i = 0; i < 6; i++) {
      vi.setSystemTime(START + i * (MINUTE + 1000));
      expect((await requestCode(t, "tutor@example.com")).status).toBe(200);
    }
    expect(await codesSentTo(t, "tutor@example.com")).toHaveLength(5);
  });

  it("disables the emailOTP endpoints Salus doesn't use", async () => {
    const t = setup();
    for (const path of [
      "/email-otp/check-verification-otp",
      "/email-otp/verify-email",
      "/email-otp/request-password-reset",
      "/forget-password/email-otp",
      "/email-otp/reset-password",
    ]) {
      expect((await post(t, path, { email: "a@example.com", otp: "1" })).status).toBe(404);
    }
    expect(
      (await post(t, "/sign-up/email", { email: "a@example.com", password: "x".repeat(12) }))
        .status,
    ).toBeGreaterThanOrEqual(400);
  });

  describe("per-IP limit (otpRequestIp, 30/hour) and the proxy secret", () => {
    /** 30 requests for unknown emails, each with a different claimed client IP. */
    async function spendIpAllowance(t: Caller, headers: () => Record<string, string>) {
      for (let i = 0; i < 30; i++) {
        await requestCode(t, `filler-${i}@example.com`, { headers: headers() });
      }
    }

    it("ignores a forged client-IP header and limits the real caller address", async () => {
      vi.stubEnv("SERVER_SECRET", "proxy-secret");
      const base = setup();
      await invite(base, "tutor@example.com");
      const direct = base.withRequestMetadata({ ip: "192.0.2.50" });
      const forged = () => ({ [CLIENT_IP_HEADER]: freshIp(), [PROXY_SECRET_HEADER]: "guess" });
      await spendIpAllowance(direct, forged);
      await requestCode(direct, "tutor@example.com", { headers: forged() });
      expect(await codesSentTo(base, "tutor@example.com")).toHaveLength(0);
    });

    it("trusts the client-IP header when the proxy secret matches", async () => {
      vi.stubEnv("SERVER_SECRET", "proxy-secret");
      const base = setup();
      await invite(base, "tutor@example.com");
      // Every request arrives from the proxy's address.
      const proxy = base.withRequestMetadata({ ip: "192.0.2.1" });
      const viaProxy = () => ({
        [CLIENT_IP_HEADER]: freshIp(),
        [PROXY_SECRET_HEADER]: "proxy-secret",
      });
      await spendIpAllowance(proxy, viaProxy);
      await requestCode(proxy, "tutor@example.com", { headers: viaProxy() });
      expect(await codesSentTo(base, "tutor@example.com")).toHaveLength(1);
    });

    it("never trusts the header when SERVER_SECRET is unset", async () => {
      const base = setup();
      await invite(base, "tutor@example.com");
      const proxy = base.withRequestMetadata({ ip: "192.0.2.1" });
      const viaProxy = () => ({ [CLIENT_IP_HEADER]: freshIp(), [PROXY_SECRET_HEADER]: "" });
      const errors = vi.spyOn(console, "error").mockImplementation(() => {});
      await spendIpAllowance(proxy, viaProxy);
      await requestCode(proxy, "tutor@example.com", { headers: viaProxy() });
      expect(await codesSentTo(base, "tutor@example.com")).toHaveLength(0);
      errors.mockRestore();
    });
  });
});
