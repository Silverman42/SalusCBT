/**
 * T-404: admin bootstrap, the session gate, sign-in audit entries and
 * `profiles.me` (LLD §9.2, §12.2, PRD AU-4, AU-6, AU-7).
 *
 * As in signIn.test.ts, only `Date` is faked and codes are read from the
 * scheduled `email.send.send` jobs.
 */
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../../convex/_generated/api";
import { ACCOUNT_INACTIVE, createAuth } from "../../../convex/auth";
import { requireProfile } from "../../../convex/lib/guards";
import { CLIENT_IP_HEADER } from "../../../convex/lib/clientIp";
import { endSessions } from "../../../convex/profiles";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const SITE = "http://localhost:3000";
const SECRET = "test-better-auth-secret-0123456789abcdef";
const START = new Date("2026-11-08T10:00:00Z").getTime();

let ipCounter = 0;
const freshIp = () => `198.51.100.${++ipCounter % 250}`;

function post(t: T, path: string, body: unknown, headers: Record<string, string> = {}) {
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

const requestCode = (t: T, email: string) =>
  post(t, "/email-otp/send-verification-otp", { email, type: "sign-in" });
const signIn = (t: T, email: string, otp: string) => post(t, "/sign-in/email-otp", { email, otp });

async function codesSentTo(t: T, email: string): Promise<string[]> {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs
    .map((j) => j.args[0] as { to?: string; tag?: string; text?: string })
    .filter((m) => m.tag === "otp" && m.to === email)
    .map((m) => /code is: (\d+)/.exec(m.text ?? "")![1]!);
}

/** An invited tutor: Better Auth user plus profile, as `invitations.accept` will make. */
async function invite(t: T, email: string) {
  return await t.run(async (ctx) => {
    const auth = await createAuth(ctx).$context;
    const user = await auth.internalAdapter.createUser(
      { email, name: email, emailVerified: true },
      { method: "invitation" },
    );
    const profileId = await ctx.db.insert("profiles", {
      authUserId: user.id,
      email,
      role: "tutor",
      status: "active",
      createdAt: Date.now(),
    });
    return { userId: user.id, profileId };
  });
}

async function signInByCode(t: T, email: string) {
  await requestCode(t, email);
  const [code] = await codesSentTo(t, email);
  return await signIn(t, email, code!);
}

const auditRows = (t: T) => t.run((ctx) => ctx.db.query("auditLog").collect());

const sessionsOf = (t: T, userId: string) =>
  t.run(async (ctx) => {
    const res = (await ctx.runQuery(components.betterAuth.adapter.findMany, {
      model: "session",
      where: [{ field: "userId", value: userId }],
      paginationOpts: { cursor: null, numItems: 100 },
    })) as { page: unknown[] };
    return res.page;
  });

async function errorOf(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  return err instanceof ConvexError ? String(err.data) : (err as Error).message;
}

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

describe("profiles.ensureAdmin (AU-6)", () => {
  it("refuses clearly when ADMIN_EMAIL is unset", async () => {
    vi.stubEnv("ADMIN_EMAIL", "");
    const t = setup();
    expect(await errorOf(t.mutation(internal.profiles.ensureAdmin, {}))).toMatch(
      /ADMIN_EMAIL is not set/,
    );
    expect(await t.run((ctx) => ctx.db.query("profiles").collect())).toHaveLength(0);
  });

  it("creates the auth user and an active admin profile once, then reports it exists", async () => {
    vi.stubEnv("ADMIN_EMAIL", "  Admin@Example.com ");
    const t = setup();
    expect(await t.mutation(internal.profiles.ensureAdmin, {})).toEqual({
      status: "created",
      email: "admin@example.com",
    });
    expect(await t.mutation(internal.profiles.ensureAdmin, {})).toEqual({
      status: "exists",
      email: "admin@example.com",
    });

    const profiles = await t.run((ctx) => ctx.db.query("profiles").collect());
    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toMatchObject({
      email: "admin@example.com",
      role: "admin",
      status: "active",
    });
    const user = (await t.run((ctx) =>
      ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "email", value: "admin@example.com" }],
      }),
    )) as { _id: string; emailVerified: boolean } | null;
    expect(user?._id).toBe(profiles[0]!.authUserId);
    expect(user?.emailVerified).toBe(true);
  });

  it("lets the new admin sign in by code", async () => {
    vi.stubEnv("ADMIN_EMAIL", "admin@example.com");
    const t = setup();
    await t.mutation(internal.profiles.ensureAdmin, {});
    expect((await signInByCode(t, "admin@example.com")).status).toBe(200);
  });

  it("refuses a second admin when ADMIN_EMAIL changes", async () => {
    vi.stubEnv("ADMIN_EMAIL", "first@example.com");
    const t = setup();
    await t.mutation(internal.profiles.ensureAdmin, {});
    vi.stubEnv("ADMIN_EMAIL", "second@example.com");
    expect(await errorOf(t.mutation(internal.profiles.ensureAdmin, {}))).toMatch(
      /second admin.*first@example\.com/,
    );
    const admins = await t.run((ctx) => ctx.db.query("profiles").collect());
    expect(admins.map((p) => p.email)).toEqual(["first@example.com"]);
  });

  it("refuses an email that already has an active tutor profile", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    vi.stubEnv("ADMIN_EMAIL", "tutor@example.com");
    expect(await errorOf(t.mutation(internal.profiles.ensureAdmin, {}))).toMatch(
      /active tutor profile/,
    );
  });
});

describe("session gate and sign-in audit (AU-4, AU-7)", () => {
  it("audits the code request and the sign-in of an active tutor", async () => {
    const t = setup();
    const { profileId } = await invite(t, "tutor@example.com");
    expect((await signInByCode(t, "tutor@example.com")).status).toBe(200);

    const rows = await auditRows(t);
    expect(rows.map((r) => r.action)).toEqual(["auth.otp_requested", "auth.signin"]);
    expect(rows[0]).toMatchObject({ target: "tutor@example.com" });
    expect(rows[0]!.actorId).toBeUndefined();
    expect(rows[1]).toMatchObject({ actorId: profileId, target: "tutor@example.com" });
    for (const r of rows) expect(r.ipHash).toBeUndefined(); // no peer IP in convex-test
  });

  it("won't create a session for a tutor removed after their code was sent", async () => {
    const t = setup();
    const { userId, profileId } = await invite(t, "tutor@example.com");
    await requestCode(t, "tutor@example.com");
    const [code] = await codesSentTo(t, "tutor@example.com");
    await t.run((ctx) => ctx.db.patch("profiles", profileId, { status: "removed" }));

    const res = await signIn(t, "tutor@example.com", code!);
    expect(res.status).toBe(403);
    expect(((await res.json()) as { code?: string }).code).toBe(ACCOUNT_INACTIVE);
    expect(res.headers.get("set-cookie") ?? "").not.toMatch(/session_token=[^;]+/);
    expect(await sessionsOf(t, userId)).toHaveLength(0);

    const rows = await auditRows(t);
    expect(rows.map((r) => r.action)).toEqual(["auth.otp_requested", "auth.otp_failed"]);
    expect(rows[1]!.meta).toEqual({ reason: ACCOUNT_INACTIVE });
  });

  it("audits a wrong code with its reason, but not guesses at unknown emails", async () => {
    const t = setup();
    await invite(t, "tutor@example.com");
    await requestCode(t, "tutor@example.com");
    const [code] = await codesSentTo(t, "tutor@example.com");
    const wrong = code === "000000" ? "111111" : "000000";
    expect((await signIn(t, "tutor@example.com", wrong)).status).toBe(400);
    expect((await signIn(t, "stranger@example.com", "123456")).status).toBe(400);

    const failed = (await auditRows(t)).filter((r) => r.action === "auth.otp_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({
      target: "tutor@example.com",
      meta: { reason: "INVALID_OTP" },
    });
    expect(JSON.stringify(failed)).not.toContain(code!);
  });

  it("doesn't audit refused code requests", async () => {
    const t = setup();
    await requestCode(t, "stranger@example.com");
    expect(await auditRows(t)).toHaveLength(0);
  });

  it("audits sign-out and deletes the session", async () => {
    const t = setup();
    const { userId, profileId } = await invite(t, "tutor@example.com");
    const res = await signInByCode(t, "tutor@example.com");
    const cookie = /(better-auth\.session_token=[^;]+)/.exec(res.headers.get("set-cookie") ?? "");
    expect(cookie).not.toBeNull();
    expect(await sessionsOf(t, userId)).toHaveLength(1);

    const out = await post(t, "/sign-out", {}, { cookie: cookie![1]! });
    expect(out.status).toBe(200);
    expect(await sessionsOf(t, userId)).toHaveLength(0);
    const rows = await auditRows(t);
    expect(rows.at(-1)).toMatchObject({
      action: "auth.signout",
      actorId: profileId,
      target: "tutor@example.com",
    });
  });
});

describe("endSessions (AU-4: a removed tutor is signed out)", () => {
  it("deletes every session, so the Convex token stops working at once", async () => {
    const t = setup();
    const { userId, as } = await seedSignedIn(t, { label: "tutor-1", role: "tutor" });
    await t.run(async (ctx) => {
      // A second device.
      await ctx.runMutation(components.betterAuth.adapter.create, {
        input: {
          model: "session",
          data: {
            userId,
            token: crypto.randomUUID(),
            expiresAt: Date.now() + 60_000,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          },
        },
      });
    });
    expect(await sessionsOf(t, userId)).toHaveLength(2);
    expect(await as.query(api.profiles.me, {})).not.toBeNull();

    await t.run((ctx) => endSessions(ctx, userId));

    expect(await sessionsOf(t, userId)).toHaveLength(0);
    expect(await as.query(api.profiles.me, {})).toBeNull();
    const err = await as.run((ctx) => requireProfile(ctx, ["tutor"])).catch((e: unknown) => e);
    expect((err as ConvexError<string>).data).toBe("UNAUTHENTICATED");
  });
});

describe("profiles.me", () => {
  it("returns null when signed out", async () => {
    const t = setup();
    expect(await t.query(api.profiles.me, {})).toBeNull();
  });

  it("returns only role, name, email and status", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "admin", role: "admin" });
    expect(await as.query(api.profiles.me, {})).toEqual({
      role: "admin",
      name: null,
      email: "admin@example.com",
      status: "active",
    });
  });

  it("shows a removed profile as removed", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "gone", role: "tutor", status: "removed" });
    expect(await as.query(api.profiles.me, {})).toMatchObject({ status: "removed" });
  });
});
