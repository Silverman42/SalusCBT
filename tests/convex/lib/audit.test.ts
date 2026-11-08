import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS, writeAudit } from "../../../convex/lib/audit";
import { seedProfile, setup } from "./fixtures";

describe("writeAudit", () => {
  it("lists exactly the LLD §12.2 events", () => {
    expect(AUDIT_ACTIONS).toHaveLength(15);
    expect(AUDIT_ACTIONS).toContain("attempt.deleted");
    expect(AUDIT_ACTIONS).toContain("exam.default_changed");
  });

  it("inserts a row with a timestamp and only the given fields", async () => {
    const t = setup();
    const actorId = await seedProfile(t, { authUserId: "admin", role: "admin" });
    const before = Date.now();
    const rows = await t.run(async (ctx) => {
      await writeAudit(ctx, {
        actorId,
        action: "attempt.deleted",
        target: "class:abc",
        meta: { count: 3 },
        ipHash: "h",
      });
      await writeAudit(ctx, { action: "auth.otp_failed" });
      return await ctx.db.query("auditLog").withIndex("by_at").take(10);
    });
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      actorId,
      action: "attempt.deleted",
      target: "class:abc",
      meta: { count: 3 },
      ipHash: "h",
    });
    expect(rows[0]!.at).toBeGreaterThanOrEqual(before);
    expect(Object.keys(rows[1]!).sort()).toEqual(["_creationTime", "_id", "action", "at"]);
  });
});
