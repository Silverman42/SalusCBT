import { describe, expect, it } from "vitest";
import { newClassCode, normaliseClassCode } from "../../convex/lib/codes";
import {
  buildStartBody,
  classCodeFromQuery,
  classCodeMessage,
  classCodeState,
  hasErrors,
  isCompleteClassCode,
  lastMarkedAttempt,
  normaliseClassCodeInput,
  parseStartError,
  parseStartSuccess,
  resumableAttempt,
  retryAfterHeaderMs,
  retryAfterText,
  scoreBadgeText,
  startErrorMessage,
  validateStartForm,
  type AttemptSummaryLike,
} from "../../app/lib/start";

describe("normaliseClassCodeInput", () => {
  it("upper-cases and removes whitespace", () => {
    expect(normaliseClassCodeInput(" sec-4k7q ")).toBe("SEC-4K7Q");
    expect(normaliseClassCodeInput("SEC - 4K 7Q")).toBe("SEC-4K7Q");
  });
  it("adds the prefix or the dash when left out", () => {
    expect(normaliseClassCodeInput("4k7q")).toBe("SEC-4K7Q");
    expect(normaliseClassCodeInput("sec4k7q")).toBe("SEC-4K7Q");
  });
  it("leaves other input upper-cased", () => {
    expect(normaliseClassCodeInput("")).toBe("");
    expect(normaliseClassCodeInput(null)).toBe("");
    expect(normaliseClassCodeInput("sec-")).toBe("SEC-");
    expect(normaliseClassCodeInput("abc0")).toBe("ABC0"); // 0 isn't in the alphabet
    expect(normaliseClassCodeInput("hello world")).toBe("HELLOWORLD");
  });
  it("recognises complete codes only", () => {
    expect(isCompleteClassCode("SEC-4K7Q")).toBe(true);
    expect(isCompleteClassCode("SEC-4K7")).toBe(false);
    expect(isCompleteClassCode("SEC-4K7O")).toBe(false); // O is a look-alike
  });
  it("accepts every server-generated code and matches the server's normalisation", () => {
    for (let i = 0; i < 200; i++) {
      const code = newClassCode();
      expect(isCompleteClassCode(code)).toBe(true);
      expect(normaliseClassCodeInput(code.toLowerCase())).toBe(normaliseClassCode(code));
    }
  });
  it("reads ?class= from the route query", () => {
    expect(classCodeFromQuery("sec-zzzz")).toBe("SEC-ZZZZ");
    expect(classCodeFromQuery(["SEC-4K7Q", "x"])).toBe("SEC-4K7Q");
    expect(classCodeFromQuery(undefined)).toBe("");
    expect(classCodeFromQuery("x".repeat(100))).toHaveLength(32);
  });
});

describe("classCodeState", () => {
  it("covers each state", () => {
    expect(classCodeState("", undefined).kind).toBe("none");
    expect(classCodeState("SE", undefined).kind).toBe("incomplete");
    expect(classCodeState("SEC-4K", undefined).kind).toBe("incomplete");
    expect(classCodeState("SEC-4K7QX", undefined).kind).toBe("invalid");
    expect(classCodeState("HELLO", undefined).kind).toBe("invalid");
    expect(classCodeState("SEC-4K7Q", undefined).kind).toBe("checking");
    expect(classCodeState("SEC-4K7Q", "error").kind).toBe("error");
    expect(classCodeState("SEC-ZZZZ", null).kind).toBe("unknown");
    expect(classCodeState("SEC-4K7Q", { name: "Mon 6pm", open: false })).toEqual({
      kind: "closed",
      name: "Mon 6pm",
    });
    expect(classCodeState("SEC-4K7Q", { name: "Mon 6pm", open: true })).toEqual({
      kind: "found",
      name: "Mon 6pm",
    });
  });
  it("words the inline messages", () => {
    expect(classCodeMessage({ kind: "none" })).toBeNull();
    expect(classCodeMessage({ kind: "unknown" })?.text).toMatch(/Class not found/);
    expect(classCodeMessage({ kind: "closed", name: "A" })).toMatchObject({ tone: "bad" });
    expect(classCodeMessage({ kind: "closed", name: "A" })?.text).toMatch(/closed/);
    expect(classCodeMessage({ kind: "found", name: "A" })).toEqual({
      text: "Joining A",
      tone: "ok",
    });
  });
});

describe("validateStartForm", () => {
  const none = { kind: "none" } as const;
  it("needs nothing without a class", () => {
    expect(hasErrors(validateStartForm({ displayName: "", classCode: "", classState: none }))).toBe(
      false,
    );
  });
  it("requires a display name with a class (CL-4)", () => {
    const e = validateStartForm({
      displayName: "  ",
      classCode: "SEC-4K7Q",
      classState: { kind: "found", name: "A" },
    });
    expect(e.displayName).toMatch(/display name/);
    expect(e.classCode).toBeUndefined();
  });
  it("limits the display name to 40 characters", () => {
    expect(
      validateStartForm({ displayName: "x".repeat(41), classCode: "", classState: none })
        .displayName,
    ).toMatch(/40/);
    expect(
      validateStartForm({ displayName: "x".repeat(40), classCode: "", classState: none })
        .displayName,
    ).toBeUndefined();
  });
  it("blocks unknown, closed and incomplete codes", () => {
    for (const classState of [
      { kind: "unknown" },
      { kind: "closed", name: "A" },
      { kind: "incomplete" },
      { kind: "invalid" },
    ] as const) {
      expect(
        validateStartForm({ displayName: "Amara", classCode: "SEC-4K7Q", classState }).classCode,
      ).toBeTruthy();
    }
  });
  it("lets the server decide while checking or after a lookup failure", () => {
    for (const classState of [{ kind: "checking" }, { kind: "error" }] as const) {
      expect(
        hasErrors(validateStartForm({ displayName: "Amara", classCode: "SEC-4K7Q", classState })),
      ).toBe(false);
    }
  });
});

describe("start request and response", () => {
  const token = "a".repeat(43);
  it("leaves empty fields out of the body", () => {
    expect(buildStartBody({ anonToken: token, displayName: " ", classCode: "" })).toEqual({
      anonToken: token,
    });
    expect(
      buildStartBody({
        anonToken: token,
        displayName: " Amara ",
        classCode: "SEC-4K7Q",
        mode: "retake",
      }),
    ).toEqual({ anonToken: token, displayName: "Amara", classCode: "SEC-4K7Q", mode: "retake" });
  });
  it("parses the 200 body", () => {
    expect(parseStartSuccess({ attemptId: "abc", deadline: 2, serverNow: 1 })).toEqual({
      attemptId: "abc",
      deadline: 2,
      serverNow: 1,
    });
    expect(parseStartSuccess({ attemptId: "", deadline: 2, serverNow: 1 })).toBeNull();
    expect(parseStartSuccess("<html>")).toBeNull();
  });
  it("parses error bodies", () => {
    expect(parseStartError({ code: "RATE_LIMITED", retryAfter: 5000 })).toEqual({
      code: "RATE_LIMITED",
      retryAfterMs: 5000,
    });
    expect(parseStartError(undefined)).toEqual({ code: null, retryAfterMs: null });
  });
});

describe("retry-after", () => {
  it("reads the header in seconds", () => {
    expect(retryAfterHeaderMs("30")).toBe(30_000);
    expect(retryAfterHeaderMs("soon")).toBeNull();
    expect(retryAfterHeaderMs(null)).toBeNull();
  });
  it("words it", () => {
    expect(retryAfterText(null)).toBe("Try again shortly.");
    expect(retryAfterText(1000)).toBe("Try again in 1 second.");
    expect(retryAfterText(1500)).toBe("Try again in 2 seconds.");
    expect(retryAfterText(60_000)).toBe("Try again in 1 minute.");
    expect(retryAfterText(61_000)).toBe("Try again in 2 minutes.");
  });
});

describe("startErrorMessage", () => {
  it("puts class and name errors on their fields", () => {
    expect(startErrorMessage("CLASS_UNKNOWN").field).toBe("classCode");
    expect(startErrorMessage("CLASS_CLOSED").field).toBe("classCode");
    expect(startErrorMessage("VALIDATION_FAILED").field).toBe("displayName");
  });
  it("includes the wait for RATE_LIMITED", () => {
    const m = startErrorMessage("RATE_LIMITED", { retryAfterMs: 120_000 });
    expect(m.field).toBeNull();
    expect(m.message).toMatch(/Try again in 2 minutes\./);
  });
  it("has a message for every documented code and for failures", () => {
    for (const code of [
      "BAD_REQUEST",
      "BAD_TOKEN",
      "CROSS_ORIGIN",
      "NOT_FOUND",
      "PAYLOAD_TOO_LARGE",
      "UNSUPPORTED_MEDIA_TYPE",
      "SERVER_ERROR",
      null,
    ]) {
      expect(startErrorMessage(code).message.length).toBeGreaterThan(10);
    }
    expect(startErrorMessage(null, { network: true }).message).toMatch(/connection/);
    expect(startErrorMessage("SERVER_ERROR").message).toMatch(/couldn't start/);
  });
});

describe("attempt summaries", () => {
  const base = { mode: "standard", startedAt: 1, deadline: 100 } as const;
  const rows: AttemptSummaryLike[] = [
    { ...base, attemptId: "a", status: "in_progress", deadline: 50 },
    { ...base, attemptId: "b", status: "in_progress", deadline: 500 },
    { ...base, attemptId: "c", status: "submitted", scaled: 814, passed: true, submittedAt: 9 },
  ];
  it("finds a running attempt to resume", () => {
    expect(resumableAttempt(rows, 60)?.attemptId).toBe("b");
    expect(resumableAttempt(rows, 600)).toBeNull();
  });
  it("finds the last marked attempt and words the badge", () => {
    const last = lastMarkedAttempt(rows);
    expect(last?.attemptId).toBe("c");
    expect(scoreBadgeText(last!)).toBe("814 · Pass");
    expect(scoreBadgeText({ ...last!, scaled: 702, passed: false })).toBe("702 · Below 750");
  });
});
