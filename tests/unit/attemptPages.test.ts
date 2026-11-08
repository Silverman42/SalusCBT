import { describe, expect, it } from "vitest";
import {
  examPath,
  failureForStatus,
  failureOf,
  LOAD_FAILURES,
  loadErrorCode,
  modeLabel,
  RETAKE_START_PATH,
  resultPath,
  reviewPath,
} from "../../app/lib/attemptPages";

describe("attemptPages (T-215, T-216)", () => {
  it("reads ConvexError codes and maps validator errors to NOT_FOUND", () => {
    expect(loadErrorCode({ data: "NOT_FOUND" })).toBe("NOT_FOUND");
    expect(loadErrorCode({ data: { code: "BAD_TOKEN" } })).toBe("BAD_TOKEN");
    expect(
      loadErrorCode(
        new Error(
          "[CONVEX Q(review:getResult)] ArgumentValidationError: Value does not match validator.",
        ),
      ),
    ).toBe("NOT_FOUND");
    expect(loadErrorCode(new Error("Failed to fetch"))).toBe("NETWORK");
    expect(loadErrorCode(undefined)).toBe("NETWORK");
  });

  it("maps codes and statuses to page states", () => {
    expect(failureOf("NOT_FOUND")).toBe("not_found");
    expect(failureOf("BAD_TOKEN")).toBe("bad_token");
    expect(failureOf("NETWORK")).toBe("network");
    expect(failureForStatus("in_progress")).toBe("in_progress");
    expect(failureForStatus("expired")).toBe("expired");
    expect(failureForStatus("submitted")).toBe("not_found");
    expect(failureForStatus(null)).toBe("not_found");
    for (const f of Object.values(LOAD_FAILURES)) expect(f.title.length).toBeGreaterThan(0);
  });

  it("builds routes and mode labels", () => {
    expect(resultPath("abc")).toBe("/exam/abc/result");
    expect(reviewPath("abc")).toBe("/exam/abc/review");
    expect(examPath("a/b")).toBe("/exam/a%2Fb");
    expect(modeLabel("standard")).toBe("Standard");
    expect(modeLabel("retake")).toBe("Retake (PBQ set B)");
    expect(RETAKE_START_PATH).toBe("/start?mode=retake");
  });
});
