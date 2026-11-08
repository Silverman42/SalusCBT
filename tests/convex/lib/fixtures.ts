/// <reference types="vite/client" />
import rateLimiterTest from "@convex-dev/rate-limiter/test";
import { convexTest } from "convex-test";
import type { Id } from "../../../convex/_generated/dataModel";
import schema from "../../../convex/schema";

const modules = import.meta.glob("../../../convex/**/*.ts");

export function setup() {
  const t = convexTest(schema, modules);
  rateLimiterTest.register(t, "rateLimiter");
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
