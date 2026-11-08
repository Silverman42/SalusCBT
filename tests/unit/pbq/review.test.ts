import { describe, expect, it } from "vitest";
import {
  BLANK,
  formatPartAnswer,
  formatRule,
  hasArtefactReview,
  markLabel,
  partMarks,
  ruleMarks,
  type PartMark,
} from "../../../app/lib/pbq/review";
import type { PbqPart } from "../../../shared/content";
import { earnedFor } from "../../fixtures/pbqAnswers";
import { PBQ_REVIEW_CASES, pbqReviewItem } from "../../fixtures/pbqReviewItems";

const markKind = (m: PartMark) => (m.ok === null ? "practice" : m.ok ? "correct" : "wrong");
const marksOf = (item: (typeof PBQ_REVIEW_CASES)[number]["item"]) =>
  item.payload.template === "firewall" ? ruleMarks(item) : [...partMarks(item).values()];

describe("formatPartAnswer (T-309)", () => {
  const pbq = (parts: Record<string, string | string[]>) => ({ kind: "pbq" as const, parts });

  it("shows text parts as entered, trimmed, and blanks as a dash", () => {
    const part: PbqPart = { id: "1a", prompt: "", kind: "ip", scored: true };
    expect(formatPartAnswer(part, pbq({ "1a": " 10.0.0.1 " }))).toBe("10.0.0.1");
    expect(formatPartAnswer(part, pbq({ "1a": "  " }))).toBe(BLANK);
    expect(formatPartAnswer(part, pbq({}))).toBe(BLANK);
    expect(formatPartAnswer(part, null)).toBe(BLANK);
    expect(formatPartAnswer(part, { kind: "mcq", optionIds: ["A"] })).toBe(BLANK);
  });

  it("labels the two sides of a port pair, keeping a blank side visible", () => {
    const part: PbqPart = { id: "B2a", prompt: "", kind: "portPair" };
    expect(formatPartAnswer(part, pbq({ B2a: ["110", "995"] }))).toBe("Cleartext 110 · Secure 995");
    expect(formatPartAnswer(part, pbq({ B2a: ["110", ""] }))).toBe("Cleartext 110 · Secure —");
    expect(formatPartAnswer(part, pbq({ B2a: ["", " "] }))).toBe(BLANK);
    // A single string (not the stored shape) still shows as the cleartext side.
    expect(formatPartAnswer(part, pbq({ B2a: "110" }))).toBe("Cleartext 110 · Secure —");
  });

  it("shows an MCQ part as its letter in paper order and its text", () => {
    const part: PbqPart = {
      id: "3c",
      prompt: "",
      kind: "mcq",
      options: [
        { id: "C", text: "Availability" },
        { id: "B", text: "Integrity" },
      ],
    };
    expect(formatPartAnswer(part, pbq({ "3c": "B" }))).toBe("B · Integrity");
    expect(formatPartAnswer(part, pbq({ "3c": "C" }))).toBe("A · Availability");
    expect(formatPartAnswer(part, pbq({ "3c": "Z" }))).toBe("Z");
  });

  it("shows a pick part as the chosen file", () => {
    const part: PbqPart = { id: "3a", prompt: "", kind: "pick", choices: ["a.exe", "b.deb"] };
    expect(formatPartAnswer(part, pbq({ "3a": "b.deb" }))).toBe("b.deb");
  });
});

describe("formatRule (T-309)", () => {
  it("shows port and action, with dashes for unset cells", () => {
    const fw = {
      kind: "firewall" as const,
      rules: [
        { port: "443", action: "ALLOW" },
        { port: "Any", action: "DENY" },
        { port: "22", action: null },
        { port: null, action: null },
      ],
    };
    expect(formatRule(fw, 0)).toBe("443 · Allow");
    expect(formatRule(fw, 1)).toBe("Any · Deny");
    expect(formatRule(fw, 2)).toBe("22 · —");
    expect(formatRule(fw, 3)).toBe(BLANK);
    expect(formatRule(fw, 9)).toBe(BLANK);
    expect(formatRule(null, 0)).toBe(BLANK);
  });
});

describe("markLabel (T-309)", () => {
  it("names each state", () => {
    const m = (ok: boolean | null, blank = false): PartMark => ({
      ok,
      yours: "",
      correct: "",
      blank,
    });
    expect(markLabel(m(true))).toBe("Correct");
    expect(markLabel(m(false))).toBe("Wrong");
    expect(markLabel(m(false, true))).toBe("Not answered");
    expect(markLabel(m(null))).toBe("Practice · not scored");
  });
});

describe("PBQ review marks with the seed and the server's marking (T-309)", () => {
  it("covers all ten seed PBQs, each with a review component", () => {
    expect(PBQ_REVIEW_CASES.map((c) => c.case.displayNumber)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
    ]);
    for (const { item } of PBQ_REVIEW_CASES) {
      expect(hasArtefactReview(item.payload.template)).toBe(true);
    }
    expect(hasArtefactReview("somethingNew")).toBe(false);
  });

  it.each(PBQ_REVIEW_CASES.map((c) => [c.case.displayNumber, c] as const))(
    "PBQ %s: one mark per part or rule, as marked at submit",
    (_, { case: c, item }) => {
      const marks = marksOf(item);
      expect(marks.map(markKind)).toEqual(c.marks);
      expect(item.earned).toBe(earnedFor(c));
      // The correct answer (or model answer) is shown for every part not marked correct.
      const shown = marks
        .filter((m) => m.ok !== true)
        .map((m) => m.correct)
        .join("\n");
      for (const text of c.shows) expect(shown).toContain(text);
      for (const m of marks) expect(m.correct).not.toBe(BLANK);
    },
  );

  it("shows the practice model answer for 1d and B1d, never a mark", () => {
    const m = partMarks(pbqReviewItem("1", null)).get("1d")!;
    expect(m).toMatchObject({ ok: null, yours: BLANK, blank: true });
    expect(m.correct).toMatch(/^grep 'Failed password' auth\.log/);
  });

  it("marks an unanswered PBQ wrong (not answered) in every scored part", () => {
    for (const n of ["2", "B2", "5"]) {
      const marks = marksOf(pbqReviewItem(n, null));
      expect(marks.every((m) => m.ok === false && m.blank)).toBe(true);
      expect(new Set(marks.map(markLabel))).toEqual(new Set(["Not answered"]));
    }
  });

  it("formats the key per kind: port pair, MCQ part and firewall rule", () => {
    const b2 = partMarks(pbqReviewItem("B2", null));
    expect(b2.get("B2a")!.correct).toBe("Cleartext 110 · Secure 995");
    expect(b2.get("B2c")!.correct).toBe("389");
    expect(partMarks(pbqReviewItem("B3", null)).get("B3c")!.correct).toBe("B · Integrity");
    expect(ruleMarks(pbqReviewItem("5", null)).map((m) => m.correct)).toEqual([
      "443 · Allow",
      "22 · Allow",
      "3306 · Allow",
      "Any · Deny",
    ]);
  });
});
