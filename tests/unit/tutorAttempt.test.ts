import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  ATTEMPT_LOAD_TEXT,
  attemptBackLink,
  attemptHeading,
  attemptLoadState,
  attemptMetaLine,
  attemptPageTitle,
  classPath,
  type AttemptHeaderLike,
} from "../../app/lib/tutorAttempt";

const NOW = Date.UTC(2026, 10, 8, 20, 0);

const view: AttemptHeaderLike & { classId: string } = {
  displayName: "Maya Chen",
  className: "Cyber Ops evening",
  classId: "k57abc",
  examTitle: "Security+ SY0-701",
  mode: "standard",
  submittedAt: NOW - 5 * 60 * 1000,
  submittedBy: "student",
};

describe("classPath / attemptBackLink", () => {
  it("links back to the attempt's class", () => {
    expect(classPath("k57abc")).toBe("/tutor/classes/k57abc");
    expect(attemptBackLink(view)).toEqual({
      to: "/tutor/classes/k57abc",
      label: "Cyber Ops evening",
    });
  });

  it("falls back to the class list before the data loads", () => {
    expect(attemptBackLink(null)).toEqual({ to: "/tutor", label: "All classes" });
    expect(attemptBackLink(undefined)).toEqual({ to: "/tutor", label: "All classes" });
  });

  it("labels a blank class name", () => {
    expect(attemptBackLink({ classId: "x", className: "  " }).label).toBe("Class");
  });
});

describe("attemptHeading / attemptPageTitle", () => {
  it("uses the student's display name", () => {
    expect(attemptHeading(view)).toBe("Maya Chen");
    expect(attemptHeading({ displayName: " " })).toBe("Unnamed student");
  });

  it("names the student and class in the tab title", () => {
    expect(attemptPageTitle(view)).toBe("Maya Chen · Cyber Ops evening");
    expect(attemptPageTitle(null)).toBe("Attempt review");
  });
});

describe("attemptMetaLine", () => {
  it("shows exam, mode and submitted time", () => {
    expect(attemptMetaLine(view, NOW, "UTC")).toBe(
      "Security+ SY0-701 · Standard · Submitted 5 min ago",
    );
  });

  it("notes a retake and a timer submit", () => {
    expect(
      attemptMetaLine({ ...view, mode: "retake", submittedBy: "timer", submittedAt: NOW }, NOW),
    ).toBe("Security+ SY0-701 · Retake (PBQ set B) · Submitted just now · time ran out");
  });

  it("dates older attempts", () => {
    const at = Date.UTC(2026, 10, 7, 19, 42);
    expect(attemptMetaLine({ ...view, submittedAt: at }, NOW, "UTC")).toContain("· 19:42");
  });
});

describe("attemptLoadState", () => {
  it("is loading until both queries answer, then ready", () => {
    expect(attemptLoadState([null, null], false)).toBe("loading");
    expect(attemptLoadState([null, undefined], true)).toBe("ready");
  });

  it("treats NOT_FOUND as not found (another tutor's, unfinished, classless)", () => {
    expect(attemptLoadState([new ConvexError({ code: "NOT_FOUND" }), null], false)).toBe(
      "not_found",
    );
    expect(attemptLoadState([null, new ConvexError("NOT_FOUND")], true)).toBe("not_found");
  });

  it("treats a malformed id in the URL as not found", () => {
    const err = new Error(
      "[CONVEX Q(classes:attemptResult)] ArgumentValidationError: Value does not match validator.",
    );
    expect(attemptLoadState([err, null], false)).toBe("not_found");
  });

  it("puts an ended session first", () => {
    expect(
      attemptLoadState(
        [new ConvexError({ code: "NOT_FOUND" }), new ConvexError({ code: "UNAUTHENTICATED" })],
        false,
      ),
    ).toBe("session");
    expect(attemptLoadState([new ConvexError({ code: "FORBIDDEN" })], false)).toBe("session");
  });

  it("reports other failures as an error", () => {
    expect(attemptLoadState([new Error("socket closed")], false)).toBe("error");
  });

  it("has wording for every failure state", () => {
    for (const s of ["not_found", "session", "error"] as const) {
      expect(ATTEMPT_LOAD_TEXT[s].title).not.toBe("");
      expect(ATTEMPT_LOAD_TEXT[s].body).not.toBe("");
    }
  });
});
