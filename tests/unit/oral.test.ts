import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import { oralErrorMessage, oralKeyAction, oralVersionLabel, stepIndex } from "../../app/lib/oral";

describe("stepIndex", () => {
  it("moves within bounds and stops at both ends", () => {
    expect(stepIndex(0, 1, 10)).toBe(1);
    expect(stepIndex(9, 1, 10)).toBe(9);
    expect(stepIndex(0, -1, 10)).toBe(0);
    expect(stepIndex(5, -1, 10)).toBe(4);
    expect(stepIndex(3, 0, 0)).toBe(0);
  });
});

describe("oralKeyAction", () => {
  const on = (tagName: string) => ({ tagName }) as unknown as EventTarget;
  it("maps arrows and 'a'", () => {
    expect(oralKeyAction({ key: "ArrowLeft" })).toBe("prev");
    expect(oralKeyAction({ key: "ArrowRight", target: on("BUTTON") })).toBe("next");
    expect(oralKeyAction({ key: "a" })).toBe("toggle");
    expect(oralKeyAction({ key: "A" })).toBe("toggle");
    expect(oralKeyAction({ key: "Enter" })).toBeNull();
  });
  it("ignores keys while typing, in a select, or with a modifier", () => {
    expect(oralKeyAction({ key: "ArrowLeft", target: on("INPUT") })).toBeNull();
    expect(oralKeyAction({ key: "a", target: on("textarea") })).toBeNull();
    expect(oralKeyAction({ key: "ArrowRight", target: on("SELECT") })).toBeNull();
    expect(
      oralKeyAction({ key: "a", target: { tagName: "DIV", isContentEditable: true } as never }),
    ).toBeNull();
    expect(oralKeyAction({ key: "ArrowRight", metaKey: true })).toBeNull();
    expect(oralKeyAction({ key: "a", ctrlKey: true })).toBeNull();
  });
});

describe("oralVersionLabel", () => {
  it("names the line, number, label and a non-published status", () => {
    expect(
      oralVersionLabel({ versionNo: 1, label: "SY0-701", status: "published", isDefault: true }),
    ).toBe("Default · v1 · SY0-701");
    expect(
      oralVersionLabel({ versionNo: 2, label: "Week 3", status: "draft", isDefault: false }),
    ).toBe("Custom · v2 · Week 3 (draft)");
  });
});

describe("oralErrorMessage", () => {
  it("words each error code", () => {
    expect(oralErrorMessage(new ConvexError({ code: "NOT_FOUND" }))).toMatch(/isn't available/);
    expect(oralErrorMessage(new ConvexError({ code: "FORBIDDEN" }))).toMatch(/Sign in again/);
    expect(oralErrorMessage(new Error("offline"))).toMatch(/connection/);
  });
});
