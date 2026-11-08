/**
 * T-410: the Stage 4 gate, end to end in convex-test (LLD §9, §12, PRD
 * AU-1 to AU-7): "An invited tutor can register and sign in by code;
 * expired, reused and wrong codes are rejected; a removed tutor is signed
 * out".
 *
 * Everything a browser would do goes through the real `/api/auth/*` HTTP
 * routes with the session cookie they set; Convex functions are then called
 * with the claims of the JWT that `/api/auth/convex/token` issues for that
 * cookie (convex-test doesn't verify JWTs, so `withIdentity` stands in for
 * the Convex client). Only `Date` is faked; scheduled emails never run, so
 * the invite link and the codes are read from the scheduled
 * `email.send.send` jobs, as the console provider would print them.
 */
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { ACCOUNT_INACTIVE } from "../../../convex/auth";
import { CLIENT_IP_HEADER } from "../../../convex/lib/clientIp";
import { setup, type T } from "../lib/fixtures";

const SITE = "http://localhost:3000";
const SECRET = "test-better-auth-secret-0123456789abcdef";
const ADMIN = "admin@example.com";
const TUTOR = "new.tutor@example.com";
const MINUTE = 60_000;
const START = new Date("2026-11-08T10:00:00Z").getTime();

let ipCounter = 0;
/** A fresh documentation-range IP per request, so per-IP limits stay out of the way. */
const freshIp = () => `198.51.100.${++ipCounter % 250}`;

type Mail = { to?: string; tag?: string; text?: string };

async function mails(t: T, tag: string, to: string): Promise<Mail[]> {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs.map((j) => j.args[0] as Mail).filter((m) => m.tag === tag && m.to === to);
}

/** Codes emailed to `email`, oldest first. */
async function codesSentTo(t: T, email: string): Promise<string[]> {
  return (await mails(t, "otp", email)).map((m) => /code is: (\d{6})/.exec(m.text ?? "")![1]!);
}

/** The newest invite link's token for `email`. */
async function inviteTokenFor(t: T, email: string): Promise<string> {
  const sent = await mails(t, "invite", email);
  const link = new RegExp(`${SITE}/invite/([A-Za-z0-9_-]{43})`).exec(sent.at(-1)?.text ?? "");
  expect(link, "invitation email with a link").not.toBeNull();
  return link![1]!;
}

function authFetch(
  t: T,
  method: "GET" | "POST",
  path: string,
  opts: { body?: unknown; cookie?: string } = {},
) {
  return t.fetch(`/api/auth${path}`, {
    method,
    headers: {
      origin: SITE,
      [CLIENT_IP_HEADER]: freshIp(),
      ...(opts.body !== undefined ? { "content-type": "application/json" } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
}

const requestCode = (t: T, email: string) =>
  authFetch(t, "POST", "/email-otp/send-verification-otp", {
    body: { email, type: "sign-in" },
  });
const verifyCode = (t: T, email: string, otp: string) =>
  authFetch(t, "POST", "/sign-in/email-otp", { body: { email, otp } });

async function errorCode(res: Response): Promise<string | undefined> {
  return ((await res.json()) as { code?: string } | null)?.code;
}

/** The `name=value` pairs of a response's Set-Cookie headers, as a Cookie header. */
function cookieFrom(res: Response): string {
  return res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0]!)
    .join("; ");
}

/** A browser: the session cookie, and Convex calls made with the JWT the cookie buys. */
type Browser = { cookie: string; t: ReturnType<T["withIdentity"]> };

/** Request a code, read it from the email, sign in with it. */
async function signInByCode(t: T, email: string): Promise<Browser> {
  const before = (await codesSentTo(t, email)).length;
  expect((await requestCode(t, email)).status).toBe(200);
  const codes = await codesSentTo(t, email);
  expect(codes).toHaveLength(before + 1);
  const res = await verifyCode(t, email, codes.at(-1)!);
  expect(res.status).toBe(200);
  const cookie = cookieFrom(res);
  expect(cookie).toMatch(/session_token=/);
  return { cookie, t: await convexClientFor(t, cookie) };
}

function decodeJwt(jwt: string): Record<string, unknown> {
  const [, payload] = jwt.split(".");
  return JSON.parse(atob(payload!.replace(/-/g, "+").replace(/_/g, "/"))) as Record<
    string,
    unknown
  >;
}

/** What the Convex client does: trade the cookie for a JWT, call functions with its claims. */
async function convexClientFor(t: T, cookie: string) {
  const res = await authFetch(t, "GET", "/convex/token", { cookie });
  expect(res.status).toBe(200);
  const { token } = (await res.json()) as { token: string };
  const claims = decodeJwt(token);
  expect(claims.sub).toEqual(expect.any(String));
  expect(claims.sessionId).toEqual(expect.any(String));
  return t.withIdentity({ subject: claims.sub as string, sessionId: claims.sessionId as string });
}

async function getSession(t: T, cookie: string) {
  const res = await authFetch(t, "GET", "/get-session", { cookie });
  expect(res.status).toBe(200);
  return (await res.json()) as { user: { email: string } } | null;
}

async function convexErrorOf(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConvexError);
  return (err as ConvexError<string>).data;
}

describe("Stage 4 gate (T-410)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(START);
    vi.stubEnv("SITE_URL", SITE);
    vi.stubEnv("BETTER_AUTH_SECRET", SECRET);
    vi.stubEnv("SERVER_SECRET", "");
    vi.stubEnv("ADMIN_EMAIL", ADMIN);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("invited tutor registers and signs in by code; bad codes are rejected; a removed tutor is signed out", async () => {
    const t = setup();
    let now = START;
    const advance = (ms: number) => vi.setSystemTime((now += ms));

    // 1. Deploy bootstrap: the admin from ADMIN_EMAIL (AU-6).
    expect(await t.mutation(internal.profiles.ensureAdmin, {})).toEqual({
      status: "created",
      email: ADMIN,
    });

    // 2. The admin signs in by code.
    const admin = await signInByCode(t, ADMIN);
    expect(await admin.t.query(api.profiles.me, {})).toMatchObject({
      role: "admin",
      email: ADMIN,
      status: "active",
    });

    // 3. The admin invites a tutor; the link arrives by email (AU-5).
    await admin.t.mutation(api.invitations.create, { email: TUTOR });
    const inviteToken = await inviteTokenFor(t, TUTOR);

    // Before accepting there is no account, so no code is sent.
    advance(MINUTE + 1000);
    expect((await requestCode(t, TUTOR)).status).toBe(200);
    expect(await codesSentTo(t, TUTOR)).toHaveLength(0);

    // 4. The tutor opens the link and accepts: account and profile exist.
    expect(await t.query(api.invitations.peek, { token: inviteToken })).toEqual({
      email: TUTOR,
      valid: true,
    });
    expect(await t.action(api.invitations.accept, { token: inviteToken })).toEqual({
      email: TUTOR,
    });
    // The link works once.
    expect(await convexErrorOf(t.action(api.invitations.accept, { token: inviteToken }))).toBe(
      "NOT_FOUND",
    );

    // 5. The tutor asks for a code; a wrong one is rejected.
    advance(MINUTE + 1000);
    expect((await requestCode(t, TUTOR)).status).toBe(200);
    const [code1] = await codesSentTo(t, TUTOR);
    expect(code1).toMatch(/^\d{6}$/);
    const wrong = code1 === "000000" ? "111111" : "000000";
    const wrongRes = await verifyCode(t, TUTOR, wrong);
    expect(wrongRes.status).toBe(400);
    expect(await errorCode(wrongRes)).toBe("INVALID_OTP");

    // 6. The right code signs in: HttpOnly cookie, Better Auth session,
    //    Convex JWT that `profiles.me` and a tutor-guarded query accept.
    const signedIn = await verifyCode(t, TUTOR, code1!);
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("set-cookie")).toMatch(/session_token=[^;]+;.*HttpOnly/i);
    const tutor: Browser = {
      cookie: cookieFrom(signedIn),
      t: await convexClientFor(t, cookieFrom(signedIn)),
    };
    expect((await getSession(t, tutor.cookie))?.user.email).toBe(TUTOR);
    expect(await tutor.t.query(api.profiles.me, {})).toEqual({
      role: "tutor",
      name: null,
      email: TUTOR,
      status: "active",
    });
    expect(await tutor.t.query(api.classes.mine, {})).toEqual([]);
    // ... but not an admin one.
    expect(await convexErrorOf(tutor.t.query(api.admin.tutors, {}))).toBe("FORBIDDEN");

    // 7. Reusing the same code is rejected.
    const reused = await verifyCode(t, TUTOR, code1!);
    expect(reused.status).toBe(400);
    expect(await errorCode(reused)).toBe("INVALID_OTP");

    // 8. A code used after 10 minutes is rejected (AU-2).
    advance(MINUTE + 1000);
    expect((await requestCode(t, TUTOR)).status).toBe(200);
    const code2 = (await codesSentTo(t, TUTOR))[1]!;
    advance(10 * MINUTE + 1000);
    const expired = await verifyCode(t, TUTOR, code2);
    expect(expired.status).toBe(400);
    expect(await errorCode(expired)).toBe("OTP_EXPIRED");

    // The tutor holds one more fresh code when the admin removes them.
    expect((await requestCode(t, TUTOR)).status).toBe(200);
    const code3 = (await codesSentTo(t, TUTOR))[2]!;

    // 9. The admin removes the tutor (AU-4, AU-5).
    const [row] = await admin.t.query(api.admin.tutors, {});
    expect(row).toMatchObject({ email: TUTOR, status: "active" });
    await admin.t.mutation(api.admin.removeTutor, { profileId: row!.profileId });

    // 10. The existing session is gone: cookie and Convex token both stop working.
    expect(await getSession(t, tutor.cookie)).toBeNull();
    expect(await tutor.t.query(api.profiles.me, {})).toBeNull();
    expect(await convexErrorOf(tutor.t.query(api.classes.mine, {}))).toBe("UNAUTHENTICATED");
    expect((await authFetch(t, "GET", "/convex/token", { cookie: tutor.cookie })).status).not.toBe(
      200,
    );

    // 11. The code they still hold can't make a new session ...
    const late = await verifyCode(t, TUTOR, code3);
    expect(late.status).toBe(403);
    expect(await errorCode(late)).toBe(ACCOUNT_INACTIVE);
    expect(late.headers.getSetCookie().some((c) => /session_token=[^;]/.test(c))).toBe(false);
    // ... and no new code is sent, with the same answer as for anyone.
    advance(MINUTE + 1000);
    const again = await requestCode(t, TUTOR);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ success: true });
    expect(await codesSentTo(t, TUTOR)).toHaveLength(3);

    // The admin is unaffected, and signs out: the session ends (AU-4).
    expect((await getSession(t, admin.cookie))?.user.email).toBe(ADMIN);
    const out = await authFetch(t, "POST", "/sign-out", { body: {}, cookie: admin.cookie });
    expect(out.status).toBe(200);
    expect(await getSession(t, admin.cookie)).toBeNull();
    expect(await admin.t.query(api.profiles.me, {})).toBeNull();

    // The story is in the audit log (AU-7).
    const actions = (await t.run((ctx) => ctx.db.query("auditLog").collect())).map((r) =>
      `${r.action} ${r.target ?? ""}`.trim(),
    );
    expect(actions).toEqual(
      expect.arrayContaining([
        `auth.signin ${ADMIN}`,
        `invite.created ${TUTOR}`,
        `invite.accepted ${TUTOR}`,
        `auth.otp_failed ${TUTOR}`,
        `auth.signin ${TUTOR}`,
        `tutor.removed ${TUTOR}`,
        `auth.signout ${ADMIN}`,
      ]),
    );
    const failures = (await t.run((ctx) => ctx.db.query("auditLog").collect()))
      .filter((r) => r.action === "auth.otp_failed")
      .map((r) => (r.meta as { reason?: string } | undefined)?.reason);
    expect(failures).toEqual(["INVALID_OTP", "INVALID_OTP", "OTP_EXPIRED", ACCOUNT_INACTIVE]);
  });
});
