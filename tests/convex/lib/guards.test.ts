import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { requireClassOwner, requireProfile } from "../../../convex/lib/guards";
import { seedProfile, seedVersion, setup } from "./fixtures";

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
    const as = t.withIdentity({ subject: "nobody" });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("FORBIDDEN");
  });

  it("returns an active tutor's profile", async () => {
    const t = setup();
    const id = await seedProfile(t, { authUserId: "tutor-1", role: "tutor" });
    const profile = await t
      .withIdentity({ subject: "tutor-1" })
      .run((ctx) => requireProfile(ctx, ["tutor"]));
    expect(profile._id).toBe(id);
  });

  it("throws FORBIDDEN for a removed tutor", async () => {
    const t = setup();
    await seedProfile(t, { authUserId: "tutor-2", role: "tutor", status: "removed" });
    const as = t.withIdentity({ subject: "tutor-2" });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["tutor"])))).toBe("FORBIDDEN");
  });

  it("throws FORBIDDEN when a tutor calls an admin function", async () => {
    const t = setup();
    await seedProfile(t, { authUserId: "tutor-3", role: "tutor" });
    const as = t.withIdentity({ subject: "tutor-3" });
    expect(await codeOf(as.run((ctx) => requireProfile(ctx, ["admin"])))).toBe("FORBIDDEN");
  });

  it("lets admin pass tutor checks", async () => {
    const t = setup();
    await seedProfile(t, { authUserId: "admin-1", role: "admin" });
    const profile = await t
      .withIdentity({ subject: "admin-1" })
      .run((ctx) => requireProfile(ctx, ["tutor"]));
    expect(profile.role).toBe("admin");
  });
});

describe("requireClassOwner", () => {
  it("returns the class to its owner and to admin, NOT_FOUND to other tutors", async () => {
    const t = setup();
    const ownerId = await seedProfile(t, { authUserId: "owner", role: "tutor" });
    await seedProfile(t, { authUserId: "other", role: "tutor" });
    await seedProfile(t, { authUserId: "admin", role: "admin" });
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

    const check = (subject: string) =>
      t.withIdentity({ subject }).run(async (ctx) => {
        const profile = await requireProfile(ctx, ["tutor"]);
        return await requireClassOwner(ctx, profile, classId);
      });

    expect((await check("owner"))._id).toBe(classId);
    expect((await check("admin"))._id).toBe(classId);
    expect(await codeOf(check("other"))).toBe("NOT_FOUND");
  });

  it("throws NOT_FOUND for a deleted class (same as not owned)", async () => {
    const t = setup();
    const ownerId = await seedProfile(t, { authUserId: "owner", role: "tutor" });
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
    const result = t.withIdentity({ subject: "owner" }).run(async (ctx) => {
      const profile = await requireProfile(ctx, ["tutor"]);
      return await requireClassOwner(ctx, profile, classId);
    });
    expect(await codeOf(result)).toBe("NOT_FOUND");
  });
});
