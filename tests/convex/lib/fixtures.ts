/// <reference types="vite/client" />
import betterAuthTest from "@convex-dev/better-auth/test";
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import { components } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.ts");

export function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t, "rateLimiter");
  betterAuthTest.register(t, "betterAuth");
  return t;
}

export type T = ReturnType<typeof setup>;

export async function seedProfile(
  t: T,
  p: { authUserId: string; role: "admin" | "tutor"; status?: "active" | "removed" },
): Promise<Id<"profiles">> {
  return await t.run((ctx) =>
    ctx.db.insert("profiles", {
      authUserId: p.authUserId,
      email: `${p.authUserId}@example.com`,
      role: p.role,
      status: p.status ?? "active",
      createdAt: 0,
    }),
  );
}

export async function seedVersion(t: T): Promise<Id<"examVersions">> {
  return await t.run(async (ctx) => {
    const examId = await ctx.db.insert("exams", {
      slug: "sy0-701",
      title: "Security+",
      timeLimitMin: 90,
      passScaled: 750,
      comfortScaled: 800,
      domainTarget: 0.81,
    });
    return await ctx.db.insert("examVersions", {
      examId,
      label: "Default",
      versionNo: 1,
      status: "published",
      totalPoints: 102,
      updatedAt: 0,
    });
  });
}

/**
 * A Better Auth user with a live session, written straight into the
 * component tables. Returns the ids the Convex JWT would carry (`sub` and
 * `sessionId`), as read by `authComponent.safeGetAuthUser`.
 */
export async function seedAuthSession(
  t: T,
  email: string,
  opts: { sessionExpiresAt?: number } = {},
): Promise<{ userId: string; sessionId: string }> {
  return await t.run(async (ctx) => {
    const now = Date.now();
    const user = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "user",
        data: { name: email, email, emailVerified: true, createdAt: now, updatedAt: now },
      },
    })) as { _id: string };
    const session = (await ctx.runMutation(components.betterAuth.adapter.create, {
      input: {
        model: "session",
        data: {
          userId: user._id,
          token: crypto.randomUUID(),
          expiresAt: opts.sessionExpiresAt ?? now + 7 * 24 * 60 * 60 * 1000,
          createdAt: now,
          updatedAt: now,
        },
      },
    })) as { _id: string };
    return { userId: user._id, sessionId: session._id };
  });
}

/**
 * A signed-in user with a profile: `as` runs code with their identity.
 * `label` names the email (`<label>@example.com`).
 */
export async function seedSignedIn(
  t: T,
  p: { label: string; role: "admin" | "tutor"; status?: "active" | "removed" },
) {
  const email = `${p.label}@example.com`;
  const { userId, sessionId } = await seedAuthSession(t, email);
  const profileId = await t.run((ctx) =>
    ctx.db.insert("profiles", {
      authUserId: userId,
      email,
      role: p.role,
      status: p.status ?? "active",
      createdAt: 0,
    }),
  );
  return { profileId, userId, sessionId, as: t.withIdentity({ subject: userId, sessionId }) };
}
