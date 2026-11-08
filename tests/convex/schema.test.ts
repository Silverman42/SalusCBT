/// <reference types="vite/client" />
import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "../../convex/schema";

const modules = import.meta.glob("../../convex/**/*.ts");

describe("convex schema (T-104)", () => {
  it("loads and accepts rows across related tables", async () => {
    const t = convexTest(schema, modules);
    const now = Date.now();

    const { classId, keyCount } = await t.run(async (ctx) => {
      const tutorId = await ctx.db.insert("profiles", {
        authUserId: "auth-user-1",
        email: "tutor@example.com",
        role: "tutor",
        status: "active",
        createdAt: now,
      });
      const examId = await ctx.db.insert("exams", {
        slug: "sy0-701",
        title: "Security+ SY0-701",
        timeLimitMin: 90,
        passScaled: 750,
        comfortScaled: 800,
        domainTarget: 0.81,
      });
      const versionId = await ctx.db.insert("examVersions", {
        examId,
        label: "Default",
        versionNo: 1,
        status: "published",
        totalPoints: 1,
        publishedAt: now,
        updatedAt: now,
      });
      const questionId = await ctx.db.insert("questions", {
        versionId,
        order: 1,
        section: "mcq",
        displayNumber: "1",
        kind: "mcq",
        domain: "1.0",
        points: 1,
        stem: "Which is a preventive control?",
        options: [
          { id: "A", text: "Firewall" },
          { id: "B", text: "Audit log" },
        ],
        chooseCount: 1,
      });
      await ctx.db.insert("answerKeys", {
        questionId,
        versionId,
        correct: ["A"],
        explanation: "A firewall blocks traffic before harm occurs.",
      });
      const classId = await ctx.db.insert("classes", {
        tutorId,
        name: "Evening cohort",
        code: "SEC-4K7Q",
        versionId,
        timeMultiplier: 1,
        status: "open",
        createdAt: now,
      });
      const keys = await ctx.db
        .query("answerKeys")
        .withIndex("by_version", (q) => q.eq("versionId", versionId))
        .take(10);
      return { classId, keyCount: keys.length };
    });

    expect(keyCount).toBe(1);
    const cls = await t.run((ctx) => ctx.db.get(classId));
    expect(cls?.timeMultiplier).toBe(1);
  });

  it("rejects a class without timeMultiplier", async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.run(async (ctx) => {
        const tutorId = await ctx.db.insert("profiles", {
          authUserId: "auth-user-2",
          email: "t2@example.com",
          role: "tutor",
          status: "active",
          createdAt: 0,
        });
        const examId = await ctx.db.insert("exams", {
          slug: "x",
          title: "x",
          timeLimitMin: 90,
          passScaled: 750,
          comfortScaled: 800,
          domainTarget: 0.81,
        });
        const versionId = await ctx.db.insert("examVersions", {
          examId,
          label: "v",
          versionNo: 1,
          status: "draft",
          totalPoints: 0,
          updatedAt: 0,
        });
        // @ts-expect-error timeMultiplier is required (EX-21)
        await ctx.db.insert("classes", {
          tutorId,
          name: "c",
          code: "SEC-AAAA",
          versionId,
          status: "open",
          createdAt: 0,
        });
      }),
    ).rejects.toThrow();
  });
});
