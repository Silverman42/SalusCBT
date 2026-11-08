import { describe, expect, it } from "vitest";
import {
  codeResentText,
  DEAD_INVITE_TEXT,
  formatCountdown,
  isCompleteCode,
  looksLikeEmail,
  needsNewCode,
  normalizeEmail,
  parseRetryAfter,
  postSignInPath,
  retryAfterText,
  sanitizeCode,
  sendCodeErrorMessage,
  verifyErrorMessage,
} from "../../app/lib/signIn";

describe("sanitizeCode", () => {
  it("keeps digits only, at most six", () => {
    expect(sanitizeCode("481029")).toBe("481029");
    expect(sanitizeCode("481 029")).toBe("481029");
    expect(sanitizeCode("481-029")).toBe("481029");
    expect(sanitizeCode(" 4a8b1c ")).toBe("481");
    expect(sanitizeCode("4810291234")).toBe("481029");
    expect(sanitizeCode("")).toBe("");
  });

  it("accepts full-width digits from some keyboards", () => {
    expect(sanitizeCode("４８１０２９")).toBe("481029");
  });

  it("isCompleteCode needs exactly six digits", () => {
    expect(isCompleteCode("481029")).toBe(true);
    expect(isCompleteCode("48102")).toBe(false);
    expect(isCompleteCode("48102a")).toBe(false);
    expect(isCompleteCode("4810290")).toBe(false);
  });
});

describe("emails", () => {
  it("normalises like the server", () => {
    expect(normalizeEmail("  Ngozi@Hizo.Africa ")).toBe("ngozi@hizo.africa");
  });

  it("catches obvious typos", () => {
    expect(looksLikeEmail("ngozi@hizo.africa")).toBe(true);
    expect(looksLikeEmail(" Ngozi@Hizo.Africa ")).toBe(true);
    expect(looksLikeEmail("ngozi")).toBe(false);
    expect(looksLikeEmail("ngozi@hizo")).toBe(false);
    expect(looksLikeEmail("a b@c.de")).toBe(false);
    expect(looksLikeEmail(`${"a".repeat(250)}@c.de`)).toBe(false);
  });
});

describe("retry after", () => {
  it("parses X-Retry-After seconds", () => {
    expect(parseRetryAfter("42")).toBe(42);
    expect(parseRetryAfter("1.2")).toBe(2);
    expect(parseRetryAfter(null)).toBeNull();
    expect(parseRetryAfter("")).toBeNull();
    expect(parseRetryAfter("soon")).toBeNull();
    expect(parseRetryAfter("-1")).toBeNull();
  });

  it("says when to try again", () => {
    expect(retryAfterText(1)).toBe("Try again in 1 second.");
    expect(retryAfterText(45)).toBe("Try again in 45 seconds.");
    expect(retryAfterText(60)).toBe("Try again in 1 minute.");
    expect(retryAfterText(150)).toBe("Try again in 3 minutes.");
    expect(retryAfterText(null)).toBe("Try again shortly.");
  });

  it("formats the resend countdown like the mockup", () => {
    expect(formatCountdown(42)).toBe("0:42");
    expect(formatCountdown(60)).toBe("1:00");
    expect(formatCountdown(75)).toBe("1:15");
    expect(formatCountdown(0)).toBe("0:00");
    expect(formatCountdown(-3)).toBe("0:00");
  });
});

/** Words that would tell someone whether an email has an account. */
const ENUMERATION =
  /no (such )?account|not (registered|found)|unknown (email|user)|doesn't exist|isn't registered/i;

describe("code request messages (no enumeration)", () => {
  it("rate limit shows the wait", () => {
    expect(sendCodeErrorMessage({ status: 429 }, 42)).toBe(
      "Too many code requests. Try again in 42 seconds.",
    );
  });

  it("never mentions whether the account exists", () => {
    for (const status of [400, 403, 404, 429, 500, undefined]) {
      expect(sendCodeErrorMessage({ status }, null)).not.toMatch(ENUMERATION);
    }
    expect(codeResentText("a@b.co")).toMatch(/^If a@b\.co belongs to an active account/);
  });
});

describe("verifyErrorMessage", () => {
  it("has a message for each Better Auth code", () => {
    expect(verifyErrorMessage({ code: "INVALID_OTP", status: 400 }, null)).toMatch(/isn't right/);
    expect(verifyErrorMessage({ code: "OTP_EXPIRED", status: 400 }, null)).toMatch(/expired/);
    expect(verifyErrorMessage({ code: "TOO_MANY_ATTEMPTS", status: 403 }, null)).toMatch(
      /Too many wrong codes/,
    );
    expect(verifyErrorMessage({ code: "ACCOUNT_INACTIVE", status: 403 }, null)).toMatch(
      /can't sign in/,
    );
    expect(verifyErrorMessage({ status: 429 }, 30)).toBe(
      "Too many tries. Try again in 30 seconds.",
    );
    expect(verifyErrorMessage({}, null)).toMatch(/connection/);
  });

  it("asks for a new code only when the old one is dead", () => {
    expect(needsNewCode({ code: "OTP_EXPIRED" })).toBe(true);
    expect(needsNewCode({ code: "TOO_MANY_ATTEMPTS" })).toBe(true);
    expect(needsNewCode({ code: "INVALID_OTP" })).toBe(false);
    expect(needsNewCode({ status: 429 })).toBe(false);
  });

  it("an unknown email's wrong code reads like any wrong code", () => {
    // disableSignUp: Better Auth answers INVALID_OTP for an unknown email too.
    expect(verifyErrorMessage({ code: "INVALID_OTP" }, null)).not.toMatch(ENUMERATION);
  });
});

describe("postSignInPath", () => {
  it("sends each role home without a redirect", () => {
    expect(postSignInPath("tutor", undefined)).toBe("/tutor");
    expect(postSignInPath("admin", undefined)).toBe("/admin/tutors");
    expect(postSignInPath(null, undefined)).toBe("/tutor");
  });

  it("honours a safe redirect", () => {
    expect(postSignInPath("tutor", "/tutor/classes/abc?tab=live")).toBe(
      "/tutor/classes/abc?tab=live",
    );
    expect(postSignInPath("admin", "/admin/audit")).toBe("/admin/audit");
  });

  it("blocks open redirects", () => {
    for (const bad of [
      "https://evil.example",
      "//evil.example",
      "/\\evil.example",
      "/\t/evil.example",
      "javascript:alert(1)",
      ["/tutor"],
      42,
    ]) {
      expect(postSignInPath("tutor", bad)).toBe("/tutor");
      expect(postSignInPath("admin", bad)).toBe("/admin/tutors");
    }
  });

  it("doesn't loop back to the auth pages", () => {
    expect(postSignInPath("tutor", "/sign-in")).toBe("/tutor");
    expect(postSignInPath("tutor", "/sign-in?redirect=%2Fadmin")).toBe("/tutor");
    expect(postSignInPath("admin", "/invite/abc")).toBe("/admin/tutors");
    expect(postSignInPath("tutor", "/sign-insights")).toBe("/sign-insights");
  });
});

describe("dead invitation text", () => {
  it("is one message for every reason", () => {
    expect(DEAD_INVITE_TEXT).toMatch(/expired, been used already or been replaced/);
  });
});
