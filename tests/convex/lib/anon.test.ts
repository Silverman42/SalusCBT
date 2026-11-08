import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { anonKeyOf, loadOwnAttempt } from "../../../convex/lib/anon";
import { seedVersion, setup } from "./fixtures";

const MINE = "M".repeat(43);
const THEIRS = "T".repeat(43);

describe("loadOwnAttempt", () => {
  it("returns the attempt for its own token and NOT_FOUND otherwise", async () => {
    const t = setup();
    const versionId = await seedVersion(t);
    const anonKey = await anonKeyOf(MINE);
    const attemptId = await t.run((ctx) =>
      ctx.db.insert("attempts", {
        anonKey,
        versionId,
        mode: "standard",
        status: "in_progress",
        startedAt: 0,
        deadline: 1,
        shuffleSeed: 7,
      }),
    );

    const own = await t.run((ctx) => loadOwnAttempt(ctx, attemptId, MINE));
    expect(own._id).toBe(attemptId);

    const wrong = await t.run((ctx) => loadOwnAttempt(ctx, attemptId, THEIRS)).catch((e) => e);
    expect(wrong).toBeInstanceOf(ConvexError);
    expect((wrong as ConvexError<string>).data).toBe("NOT_FOUND");

    await t.run((ctx) => ctx.db.delete(attemptId));
    const missing = await t.run((ctx) => loadOwnAttempt(ctx, attemptId, MINE)).catch((e) => e);
    expect((missing as ConvexError<string>).data).toBe("NOT_FOUND");
  });

  it("throws BAD_TOKEN for a malformed token before reading", async () => {
    const t = setup();
    const versionId = await seedVersion(t);
    const attemptId = await t.run((ctx) =>
      ctx.db.insert("attempts", {
        anonKey: "x",
        versionId,
        mode: "standard",
        status: "in_progress",
        startedAt: 0,
        deadline: 1,
        shuffleSeed: 7,
      }),
    );
    const err = await t.run((ctx) => loadOwnAttempt(ctx, attemptId, "short")).catch((e) => e);
    expect((err as ConvexError<string>).data).toBe("BAD_TOKEN");
  });
});
