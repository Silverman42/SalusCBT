/**
 * T-405: invitations (LLD §9.3, §12.1–12.3, PRD AU-5, AU-7).
 *
 * Only `Date` is faked; raw tokens are read from the scheduled invitation
 * emails, the only place they exist.
 */
import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, components, internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { CLIENT_IP_HEADER } from "../../../convex/lib/clientIp";
import { sha256Hex } from "../../../convex/lib/codes";
import { errorCodeOf } from "../../../convex/lib/errors";
import { INVITATION_TTL_MS } from "../../../convex/invitations";
import { seedAuthSession, seedSignedIn, setup, type T } from "../lib/fixtures";

const SITE = "http://localhost:3000";
const SECRET = "test-better-auth-secret-0123456789abcdef";
const START = new Date("2026-11-08T10:00:00Z").getTime();
const DAY = 24 * 60 * 60 * 1000;

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(Error);
  return err;
}
async function codeOf(p: Promise<unknown>) {
  return errorCodeOf(await errorOf(p));
}
async function reasonOf(p: Promise<unknown>) {
  const err = await errorOf(p);
  return err instanceof ConvexError ? (err.data as { reason?: string }).reason : undefined;
}

type Mail = { to?: string; tag?: string; text?: string; subject?: string };

async function invitesSentTo(t: T, email: string): Promise<string[]> {
  const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
  return jobs
    .map((j) => j.args[0] as Mail)
    .filter((m) => m.tag === "invite" && m.to === email)
    .map((m) => new RegExp(`${SITE}/invite/([A-Za-z0-9_-]+)`).exec(m.text ?? "")![1]!);
}

async function latestToken(t: T, email: string): Promise<string> {
  const tokens = await invitesSentTo(t, email);
  return tokens[tokens.length - 1]!;
}

const invitations = (t: T) => t.run((ctx) => ctx.db.query("invitations").collect());
const auditActions = (t: T) =>
  t.run(async (ctx) => (await ctx.db.query("auditLog").collect()).map((r) => r.action));

/**
 * The signed-in admin, with a session that outlives the tests' clock jumps.
 * Seeded a minute before START: convex-test keeps commit times strictly
 * increasing, so a later mutation at START sees `Date.now() === START`.
 */
async function adminOf(t: T) {
  vi.setSystemTime(START - 60_000);
  const email = "admin@example.com";
  const { userId, sessionId } = await seedAuthSession(t, email, {
    sessionExpiresAt: START + 365 * DAY,
  });
  const profileId = await t.run((ctx) =>
    ctx.db.insert("profiles", {
      authUserId: userId,
      email,
      role: "admin",
      status: "active",
      createdAt: 0,
    }),
  );
  vi.setSystemTime(START);
  return { profileId, as: t.withIdentity({ subject: userId, sessionId }) };
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

describe("invitations.create", () => {
  it("is admin only", async () => {
    const t = setup();
    expect(await codeOf(t.mutation(api.invitations.create, { email: "a@example.com" }))).toBe(
      "UNAUTHENTICATED",
    );
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    expect(
      await codeOf(tutor.as.mutation(api.invitations.create, { email: "a@example.com" })),
    ).toBe("FORBIDDEN");
    const removed = await seedSignedIn(t, { label: "old", role: "admin", status: "removed" });
    expect(
      await codeOf(removed.as.mutation(api.invitations.create, { email: "a@example.com" })),
    ).toBe("FORBIDDEN");
    expect(await invitations(t)).toHaveLength(0);
  });

  it("stores only the token hash, emails the link once, expires in 7 days and audits", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId, expiresAt } = await admin.as.mutation(api.invitations.create, {
      email: "  New.Tutor@Example.COM ",
    });
    expect(expiresAt).toBe(START + INVITATION_TTL_MS);
    expect(INVITATION_TTL_MS).toBe(7 * DAY);

    const tokens = await invitesSentTo(t, "new.tutor@example.com");
    expect(tokens).toHaveLength(1);
    const token = tokens[0]!;
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 random bytes

    const [inv] = await invitations(t);
    expect(inv).toMatchObject({
      _id: invitationId,
      email: "new.tutor@example.com",
      status: "pending",
      invitedBy: admin.profileId,
      tokenHash: await sha256Hex(token),
      expiresAt,
    });
    // The raw token is nowhere in the database except the outgoing email job.
    const stored = await t.run(async (ctx) =>
      JSON.stringify([
        await ctx.db.query("invitations").collect(),
        await ctx.db.query("auditLog").collect(),
      ]),
    );
    expect(stored).not.toContain(token);
    expect(await auditActions(t)).toEqual(["invite.created"]);
  });

  it("validates the email and refuses one with an active profile", async () => {
    const t = setup();
    const admin = await adminOf(t);
    for (const email of ["", "nobody", "a@b", "a b@example.com", `${"x".repeat(250)}@ex.com`]) {
      expect(await reasonOf(admin.as.mutation(api.invitations.create, { email }))).toBe(
        "INVALID_EMAIL",
      );
    }
    await seedSignedIn(t, { label: "tutor", role: "tutor" });
    const err = await errorOf(
      admin.as.mutation(api.invitations.create, { email: "Tutor@example.com" }),
    );
    expect(errorCodeOf(err)).toBe("VALIDATION_FAILED");
    expect((err as ConvexError<{ reason: string }>).data.reason).toBe("ALREADY_ACTIVE");
    expect(await invitations(t)).toHaveLength(0);
  });

  it("cancels earlier pending invitations for the same email", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const first = await admin.as.mutation(api.invitations.create, { email: "t@example.com" });
    const oldToken = await latestToken(t, "t@example.com");
    const second = await admin.as.mutation(api.invitations.create, { email: "t@example.com" });

    const rows = await invitations(t);
    expect(rows.find((r) => r._id === first.invitationId)?.status).toBe("cancelled");
    expect(rows.find((r) => r._id === second.invitationId)?.status).toBe("pending");
    expect(await t.query(api.invitations.peek, { token: oldToken })).toEqual({
      email: null,
      valid: false,
    });
    expect(await auditActions(t)).toEqual(["invite.created", "invite.cancelled", "invite.created"]);
  });

  it("allows 50 invitations (and resends) per admin per day", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId } = await admin.as.mutation(api.invitations.create, {
      email: "t0@example.com",
    });
    for (let i = 1; i < 49; i++) {
      await admin.as.mutation(api.invitations.create, { email: `t${i}@example.com` });
    }
    await admin.as.mutation(api.invitations.resend, { invitationId });
    expect(
      await codeOf(admin.as.mutation(api.invitations.create, { email: "extra@example.com" })),
    ).toBe("RATE_LIMITED");
    expect(await codeOf(admin.as.mutation(api.invitations.resend, { invitationId }))).toBe(
      "RATE_LIMITED",
    );
    vi.setSystemTime(START + DAY);
    await admin.as.mutation(api.invitations.create, { email: "extra@example.com" });
  });
});

describe("invitations.list", () => {
  it("lists newest first without tokens, for the admin only", async () => {
    const t = setup();
    const admin = await adminOf(t);
    await admin.as.mutation(api.invitations.create, { email: "a@example.com" });
    vi.setSystemTime(START + 1000);
    await admin.as.mutation(api.invitations.create, { email: "b@example.com" });

    const rows = await admin.as.query(api.invitations.list, {});
    expect(rows.map((r) => r.email)).toEqual(["b@example.com", "a@example.com"]);
    expect(rows[0]).toEqual({
      invitationId: expect.any(String),
      email: "b@example.com",
      status: "pending",
      createdAt: START + 1000,
      expiresAt: START + 1000 + INVITATION_TTL_MS,
      acceptedAt: null,
    });
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    expect(await codeOf(tutor.as.query(api.invitations.list, {}))).toBe("FORBIDDEN");
  });
});

describe("peek and accept", () => {
  it("peek shows the email for a working link only", async () => {
    const t = setup();
    const admin = await adminOf(t);
    await admin.as.mutation(api.invitations.create, { email: "t@example.com" });
    const token = await latestToken(t, "t@example.com");
    expect(await t.query(api.invitations.peek, { token })).toEqual({
      email: "t@example.com",
      valid: true,
    });
    for (const bad of ["", "short", token.slice(0, -1) + (token.endsWith("A") ? "B" : "A")]) {
      expect(await t.query(api.invitations.peek, { token: bad })).toEqual({
        email: null,
        valid: false,
      });
    }
  });

  it("creates the auth user and an active tutor profile, works once, then the tutor signs in", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId } = await admin.as.mutation(api.invitations.create, {
      email: "t@example.com",
    });
    const token = await latestToken(t, "t@example.com");

    vi.setSystemTime(START + DAY);
    expect(await t.action(api.invitations.accept, { token })).toEqual({ email: "t@example.com" });

    const profile = await t.run((ctx) =>
      ctx.db
        .query("profiles")
        .withIndex("by_email", (q) => q.eq("email", "t@example.com"))
        .unique(),
    );
    expect(profile).toMatchObject({ role: "tutor", status: "active", createdAt: START + DAY });
    const user = (await t.run((ctx) =>
      ctx.runQuery(components.betterAuth.adapter.findOne, {
        model: "user",
        where: [{ field: "email", value: "t@example.com" }],
      }),
    )) as { _id: string; emailVerified: boolean } | null;
    expect(user?._id).toBe(profile!.authUserId);
    expect(user?.emailVerified).toBe(true);

    const [inv] = (await invitations(t)).filter((r) => r._id === invitationId);
    expect(inv).toMatchObject({ status: "accepted", acceptedAt: START + DAY });
    const audit = await t.run((ctx) => ctx.db.query("auditLog").collect());
    expect(audit.at(-1)).toMatchObject({
      action: "invite.accepted",
      actorId: profile!._id,
      target: "t@example.com",
    });

    // Single use: the same answer as an unknown link.
    expect(await codeOf(t.action(api.invitations.accept, { token }))).toBe("NOT_FOUND");
    expect(await t.query(api.invitations.peek, { token })).toEqual({ email: null, valid: false });
    expect(await t.run((ctx) => ctx.db.query("profiles").collect())).toHaveLength(2);

    // The new tutor can now sign in by code.
    const post = (path: string, body: unknown) =>
      t.fetch(`/api/auth${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          origin: SITE,
          [CLIENT_IP_HEADER]: "1.2.3.4",
        },
        body: JSON.stringify(body),
      });
    await post("/email-otp/send-verification-otp", { email: "t@example.com", type: "sign-in" });
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    const otpMail = jobs.map((j) => j.args[0] as Mail).find((m) => m.tag === "otp");
    const otp = /code is: (\d+)/.exec(otpMail?.text ?? "")![1]!;
    expect((await post("/sign-in/email-otp", { email: "t@example.com", otp })).status).toBe(200);
  });

  it("refuses unknown, malformed and expired links with the same error", async () => {
    const t = setup();
    const admin = await adminOf(t);
    await admin.as.mutation(api.invitations.create, { email: "t@example.com" });
    const token = await latestToken(t, "t@example.com");

    expect(await codeOf(t.action(api.invitations.accept, { token: "nope" }))).toBe("NOT_FOUND");
    expect(await codeOf(t.action(api.invitations.accept, { token: "A".repeat(43) }))).toBe(
      "NOT_FOUND",
    );

    vi.setSystemTime(START + INVITATION_TTL_MS); // exactly 7 days: expired
    expect(await codeOf(t.action(api.invitations.accept, { token }))).toBe("NOT_FOUND");
    expect(await t.run((ctx) => ctx.db.query("profiles").collect())).toHaveLength(1);
  });

  it("still works just before 7 days", async () => {
    const t = setup();
    const admin = await adminOf(t);
    await admin.as.mutation(api.invitations.create, { email: "t@example.com" });
    const token = await latestToken(t, "t@example.com");
    vi.setSystemTime(START + INVITATION_TTL_MS - 1);
    expect(await t.action(api.invitations.accept, { token })).toEqual({ email: "t@example.com" });
  });

  it("reactivates a removed tutor's own profile instead of duplicating it", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const old = await seedSignedIn(t, { label: "back", role: "tutor", status: "removed" });
    await admin.as.mutation(api.invitations.create, { email: "back@example.com" });
    await t.action(api.invitations.accept, { token: await latestToken(t, "back@example.com") });

    const rows = await t.run((ctx) =>
      ctx.db
        .query("profiles")
        .withIndex("by_email", (q) => q.eq("email", "back@example.com"))
        .collect(),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ _id: old.profileId, status: "active", role: "tutor" });
  });
});

describe("resend and cancel", () => {
  it("resend issues a new token, invalidates the old one and renews the 7 days", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId } = await admin.as.mutation(api.invitations.create, {
      email: "t@example.com",
    });
    const oldToken = await latestToken(t, "t@example.com");

    vi.setSystemTime(START + 6 * DAY);
    const { expiresAt } = await admin.as.mutation(api.invitations.resend, { invitationId });
    expect(expiresAt).toBe(START + 6 * DAY + INVITATION_TTL_MS);
    const newToken = await latestToken(t, "t@example.com");
    expect(newToken).not.toBe(oldToken);

    expect(await codeOf(t.action(api.invitations.accept, { token: oldToken }))).toBe("NOT_FOUND");
    vi.setSystemTime(START + 10 * DAY); // past the first window, inside the new one
    expect(await t.action(api.invitations.accept, { token: newToken })).toEqual({
      email: "t@example.com",
    });
    expect(await auditActions(t)).toEqual(["invite.created", "invite.resent", "invite.accepted"]);
    expect(await codeOf(admin.as.mutation(api.invitations.resend, { invitationId }))).toBe(
      "VALIDATION_FAILED",
    );
  });

  it("cancel stops the link; only the admin can cancel", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId } = await admin.as.mutation(api.invitations.create, {
      email: "t@example.com",
    });
    const token = await latestToken(t, "t@example.com");
    const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
    expect(await codeOf(tutor.as.mutation(api.invitations.cancel, { invitationId }))).toBe(
      "FORBIDDEN",
    );

    await admin.as.mutation(api.invitations.cancel, { invitationId });
    await admin.as.mutation(api.invitations.cancel, { invitationId }); // no-op
    expect(await codeOf(t.action(api.invitations.accept, { token }))).toBe("NOT_FOUND");
    expect(await t.query(api.invitations.peek, { token })).toEqual({ email: null, valid: false });
    expect(await reasonOf(admin.as.mutation(api.invitations.resend, { invitationId }))).toBe(
      "NOT_PENDING",
    );
    expect(await auditActions(t)).toEqual(["invite.created", "invite.cancelled"]);
  });

  it("NOT_FOUND for a missing invitation", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId } = await admin.as.mutation(api.invitations.create, {
      email: "t@example.com",
    });
    await t.run((ctx) => ctx.db.delete("invitations", invitationId));
    expect(await codeOf(admin.as.mutation(api.invitations.cancel, { invitationId }))).toBe(
      "NOT_FOUND",
    );
  });
});

describe("expiry jobs", () => {
  it("expireOne flips a pending invitation at expiresAt, ignoring a resent token", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const { invitationId } = await admin.as.mutation(api.invitations.create, {
      email: "t@example.com",
    });
    const oldHash = (await invitations(t))[0]!.tokenHash;
    const jobs = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(
      jobs.some((j) => j.name.includes("expireOne") && j.scheduledTime === START + 7 * DAY),
    ).toBe(true);

    vi.setSystemTime(START + DAY);
    await admin.as.mutation(api.invitations.resend, { invitationId });
    vi.setSystemTime(START + INVITATION_TTL_MS);
    await t.mutation(internal.invitations.expireOne, { tokenHash: oldHash });
    expect((await invitations(t))[0]!.status).toBe("pending");

    vi.setSystemTime(START + DAY + INVITATION_TTL_MS);
    const newHash = (await invitations(t))[0]!.tokenHash;
    await t.mutation(internal.invitations.expireOne, { tokenHash: newHash });
    expect((await invitations(t))[0]!.status).toBe("expired");
  });

  it("the daily cron expires only pending invitations past expiresAt; resend revives one", async () => {
    const t = setup();
    const admin = await adminOf(t);
    const a = await admin.as.mutation(api.invitations.create, { email: "a@example.com" });
    vi.setSystemTime(START + 3 * DAY);
    await admin.as.mutation(api.invitations.create, { email: "b@example.com" });
    const c = await admin.as.mutation(api.invitations.create, { email: "c@example.com" });
    await admin.as.mutation(api.invitations.cancel, { invitationId: c.invitationId });

    vi.setSystemTime(START + 8 * DAY);
    expect(await t.mutation(internal.invitations.expireInvitations, {})).toEqual({ expired: 1 });
    const status = async (id: Id<"invitations">) =>
      (await invitations(t)).find((r) => r._id === id)?.status;
    expect(await status(a.invitationId)).toBe("expired");
    expect(await status(c.invitationId)).toBe("cancelled");
    expect((await invitations(t)).filter((r) => r.status === "pending")).toHaveLength(1);

    await admin.as.mutation(api.invitations.resend, { invitationId: a.invitationId });
    expect(await status(a.invitationId)).toBe("pending");
    await t.action(api.invitations.accept, { token: await latestToken(t, "a@example.com") });
    expect(await status(a.invitationId)).toBe("accepted");
  });
});
