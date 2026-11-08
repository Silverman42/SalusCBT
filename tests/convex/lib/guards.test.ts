import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { requireClassOwner, requireProfile } from "../../../convex/lib/guards";
import { components } from "../../../convex/_generated/api";
import { seedAuthSession, seedSignedIn, seedVersion, setup } from "./fixtures";

async function codeOf(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).toBeInstanceOf(ConvexError);
  return (err as ConvexError<string>).data;
}

describe("requireProfile", () => {
  it("throws UNAUTHENTICATED without an identity", async () => {
    const t = setup();
    expect(await codeOf(t.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("UNAUTHENTICATED");
  });

  it("throws FORBIDDEN for a signed-in user with no profile", async () => {
    const t = setup();
    const { userId, sessionId } = await seedAuthSession(t, "nobody@example.com");
    const as = t.withIdentity({ subject: userId, sessionId });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("FORBIDDEN");
  });

  it("returns an active tutor's profile", async () => {
    const t = setup();
    const { profileId, as } = await seedSignedIn(t, { label: "tutor-1", role: "tutor" });
    const profile = await as.run((ctx) => requireProfile(ctx, ["tutor"]));
    expect(profile._id).toBe(profileId);
  });

  it("throws FORBIDDEN for a removed tutor", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "tutor-2", role: "tutor", status: "removed" });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("FORBIDDEN");
  });

  it("throws UNAUTHENTICATED once the session is deleted, even with a valid token (AU-4)", async () => {
    const t = setup();
    const { sessionId, as } = await seedSignedIn(t, { label: "tutor-4", role: "tutor" });
    await t.run((ctx) =>
      ctx.runMutation(components.betterAuth.adapter.deleteOne, {
        input: { model: "session", where: [{ field: "_id", value: sessionId }] },
      }),
    );
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("UNAUTHENTICATED");
  });

  it("throws UNAUTHENTICATED for an expired session", async () => {
    const t = setup();
    const { userId, sessionId } = await seedAuthSession(t, "late@example.com", {
      sessionExpiresAt: Date.now() - 1,
    });
    const as = t.withIdentity({ subject: userId, sessionId });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("UNAUTHENTICATED");
  });

  it("throws UNAUTHENTICATED for a token without a Better Auth session id", async () => {
    const t = setup();
    const as = t.withIdentity({ subject: "made-up-user" });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("UNAUTHENTICATED");
  });

  it("throws FORBIDDEN when a tutor calls an admin function", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "tutor-3", role: "tutor" });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["admin"])))).toBe("FORBIDDEN");
  });

  it("lets admin pass tutor checks", async () => {
    const t = setup();
    const { as } = await seedSignedIn(t, { label: "admin-1", role: "admin" });
    const profile = await as.run((ctx) => requireProfile(ctx, ["tutor"]));
    expect(profile.role).toBe("admin");
  });
});

describe("requireClassOwner", () => {
  it("returns the class to its owner and to admin, NOT_FOUND to other tutors", async () => {
    const t = setup();
    const owner = await seedSignedIn(t, { label: "owner", role: "tutor" });
    const other = await seedSignedIn(t, { label: "other", role: "tutor" });
    const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
    const ownerId = owner.profileId;
    const versionId = await seedVersion(t);
    const classId = await t.run((ctx) =>
      ctx.db.insert("classes", {
        tutorId: ownerId,
        name: "Evening",
        code: "SEC-4K7Q",
        versionId,
        timeMultiplier: 1,
        status: "open",
        createdAt: 0,
      }),
    );

    const check = (who: typeof owner) =>
      who.as.run(async (ctx) => {
        const profile = await requireProfile(ctx, ["tutor"]);
        return await requireClassOwner(ctx, profile, classId);
      });

    expect((await check(owner))._id).toBe(classId);
    expect((await check(admin))._id).toBe(classId);
    expect(await codeOf(check(other))).toBe("NOT_FOUND");
  });

  it("throws NOT_FOUND for a deleted class (same as not owned)", async () => {
    const t = setup();
    const owner = await seedSignedIn(t, { label: "owner", role: "tutor" });
    const ownerId = owner.profileId;
    const versionId = await seedVersion(t);
    const classId = await t.run(async (ctx) => {
      const id = await ctx.db.insert("classes", {
        tutorId: ownerId,
        name: "Gone",
        code: "SEC-AAAA",
        versionId,
        timeMultiplier: 1,
        status: "open",
        createdAt: 0,
      });
      await ctx.db.delete(id);
      return id;
    });
    const result = owner.as.run(async (ctx) => {
      const profile = await requireProfile(ctx, ["tutor"]);
      return await requireClassOwner(ctx, profile, classId);
    });
    expect(await codeOf(result)).toBe("NOT_FOUND");
  });
});
