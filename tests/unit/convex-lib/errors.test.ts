import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { ERROR_CODES, errorCodeOf, fail, rateLimited } from "../../../convex/lib/errors";

describe("error codes (LLD §16)", () => {
  it("lists exactly the §16 codes", () => {
    expect([...ERROR_CODES].sort()).toEqual(
      [
        "ATTEMPT_CLOSED",
        "BAD_TOKEN",
        "CLASS_CLOSED",
        "CLASS_UNKNOWN",
        "FORBIDDEN",
        "NOT_FOUND",
        "RATE_LIMITED",
        "UNAUTHENTICATED",
        "VALIDATION_FAILED",
      ].sort(),
    );
  });

  it("fail throws a ConvexError carrying the code string", () => {
    try {
      fail("NOT_FOUND");
    } catch (e) {
      expect(e).toBeInstanceOf(ConvexError);
      expect((e as ConvexError<string>).data).toBe("NOT_FOUND");
      expect(errorCodeOf(e)).toBe("NOT_FOUND");
      return;
    }
    throw new Error("did not throw");
  });

  it("rateLimited carries code and a whole-millisecond retryAfter", () => {
    try {
      rateLimited(1234.2);
    } catch (e) {
      expect((e as ConvexError<{ code: string; retryAfter: number }>).data).toEqual({
        code: "RATE_LIMITED",
        retryAfter: 1235,
      });
      expect(errorCodeOf(e)).toBe("RATE_LIMITED");
      return;
    }
    throw new Error("did not throw");
  });

  it("errorCodeOf ignores foreign errors", () => {
    expect(errorCodeOf(new Error("NOT_FOUND"))).toBeNull();
    expect(errorCodeOf(new ConvexError("Unauthenticated"))).toBeNull();
    expect(errorCodeOf(new ConvexError({ code: "NOPE" }))).toBeNull();
    expect(errorCodeOf("NOT_FOUND")).toBeNull();
  });
});
