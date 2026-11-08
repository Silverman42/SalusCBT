import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { generateToken } from "../../../app/lib/anonIdentity";
import { anonKeyOf } from "../../../convex/lib/anon";
import { sha256Hex } from "../../../convex/lib/codes";

describe("anonKeyOf", () => {
  it("hashes a valid token to 64-char lower-case hex sha256", async () => {
    const token = generateToken();
    const key = await anonKeyOf(token);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    expect(key).toBe(await sha256Hex(token));
    expect(key).not.toContain(token);
    expect(await anonKeyOf(token)).toBe(key);
  });

  it("gives different keys for different tokens", async () => {
    expect(await anonKeyOf("A".repeat(43))).not.toBe(await anonKeyOf("B".repeat(43)));
  });

  it.each([
    ["empty", ""],
    ["too short", "A".repeat(42)],
    ["too long", "A".repeat(44)],
    ["padding", "A".repeat(42) + "="],
    ["standard base64 chars", "A".repeat(42) + "+"],
    ["whitespace", " " + "A".repeat(42)],
  ])("rejects a malformed token (%s) with BAD_TOKEN", async (_label, token) => {
    const err = await anonKeyOf(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ConvexError);
    expect((err as ConvexError<string>).data).toBe("BAD_TOKEN");
  });

  it("rejects a non-string at runtime", async () => {
    await expect(anonKeyOf(123 as unknown as string)).rejects.toThrow(ConvexError);
  });
});
