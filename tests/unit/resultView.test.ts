import { describe, expect, it } from "vitest";
import {
  domainRows,
  filterReview,
  formatDate,
  formatDuration,
  isPublicId,
  partAnswerText,
  partRows,
  passPoints,
  questionLabel,
  reviewStatus,
  shareUrl,
  type ResultSummaryData,
  type ReviewEntry,
} from "../../app/lib/resultView";

const view = (over: Partial<ResultSummaryData["result"]> = {}): ResultSummaryData => ({
  mode: "standard",
  examTitle: "Security+",
  startedAt: 0,
  submittedAt: 0,
  submittedBy: "student",
  passScaled: 750,
  comfortScaled: 800,
  domainTarget: 0.81,
  result: {
    points: 91,
    totalPoints: 102,
    scaled: 814,
    passed: true,
    comfortable: true,
    domains: [
      { domain: "2.0", points: 20, max: 22 },
      { domain: "1.0", points: 11, max: 12 },
      { domain: "3.0", points: 14, max: 18 },
    ],
    flaggedCount: 4,
    timeUsedSec: 4900,
    ...over,
  },
});

type Pbq = Extract<ReviewEntry, { kind: "pbq" }>;

const pbqBase = {
  questionId: "q1" as Pbq["questionId"],
  kind: "pbq" as const,
  section: "pbqA" as const,
  displayNumber: "1",
  points: 2,
  stem: "S",
  domain: "4.0" as const,
  flagged: false,
  earned: 1,
  max: 2,
  explanation: "",
};

describe("resultView helpers (T-504)", () => {
  it("domainRows sorts by domain, rounds percent and marks weak domains", () => {
    expect(domainRows(view())).toEqual([
      {
        domain: "1.0",
        label: "1.0 General Security Concepts",
        points: 11,
        max: 12,
        pct: 92,
        low: false,
      },
      {
        domain: "2.0",
        label: "2.0 Threats, Vulnerabilities and Mitigations",
        points: 20,
        max: 22,
        pct: 91,
        low: false,
      },
      {
        domain: "3.0",
        label: "3.0 Security Architecture",
        points: 14,
        max: 18,
        pct: 78,
        low: true,
      },
    ]);
  });

  it("passPoints matches the conversion table: 83 of 102 reaches 750", () => {
    expect(passPoints(view())).toBe(83);
  });

  it("formats durations and dates", () => {
    expect(formatDuration(4900)).toBe("1:21:40");
    expect(formatDuration(59)).toBe("0:59");
    expect(formatDuration(-3)).toBe("0:00");
    expect(formatDate(Date.UTC(2026, 10, 7, 23, 30))).toBe("7 Nov 2026");
  });

  it("validates public ids and builds share URLs", () => {
    expect(isPublicId("A".repeat(22))).toBe(true);
    expect(isPublicId("abc_-".padEnd(22, "x"))).toBe(true);
    expect(isPublicId("bogus")).toBe(false);
    expect(isPublicId("A".repeat(23))).toBe(false);
    expect(isPublicId("A".repeat(21) + "/")).toBe(false);
    expect(isPublicId(undefined)).toBe(false);
    expect(shareUrl("https://salus.test/", "X".repeat(22))).toBe(
      `https://salus.test/r/${"X".repeat(22)}`,
    );
  });

  it("statuses, filters and labels", () => {
    expect(reviewStatus({ earned: 1, max: 1 })).toBe("correct");
    expect(reviewStatus({ earned: 1, max: 3 })).toBe("partial");
    expect(reviewStatus({ earned: 0, max: 1 })).toBe("wrong");
    const items = [
      { earned: 1, max: 1, flagged: false },
      { earned: 0, max: 1, flagged: true },
      { earned: 2, max: 3, flagged: false },
    ];
    expect(filterReview(items, "all")).toHaveLength(3);
    expect(filterReview(items, "wrong")).toEqual([items[1], items[2]]);
    expect(filterReview(items, "flagged")).toEqual([items[1]]);
    expect(questionLabel({ kind: "mcq", displayNumber: "26" })).toBe("Q26");
    expect(questionLabel({ kind: "pbq", displayNumber: "B3" })).toBe("PBQ B3");
  });

  it("partAnswerText joins multi-value parts and shows blanks as a dash", () => {
    const a = { kind: "pbq" as const, parts: { a: ["22", " "], b: "", c: "x" } };
    expect(partAnswerText(a, "a")).toBe("22");
    expect(partAnswerText(a, "b")).toBe("—");
    expect(partAnswerText(a, "c")).toBe("x");
    expect(partAnswerText(null, "c")).toBe("—");
  });

  it("partRows lines up partResults with scored parts and shows practice model answers", () => {
    const item: Pbq = {
      ...pbqBase,
      payload: {
        template: "sshLog",
        intro: "",
        log: "",
        parts: [
          { id: "1a", prompt: "IP?", kind: "ip", scored: true },
          { id: "1d", prompt: "Why?", kind: "text", scored: false },
          { id: "1b", prompt: "User?", kind: "text", scored: true },
        ],
      },
      yourAnswer: { kind: "pbq", parts: { "1a": "10.0.0.1", "1d": "because", "1b": "root" } },
      correctAnswer: { kind: "pbq", parts: { "1a": "10.0.0.2", "1b": "root" } },
      partResults: [false, true],
      practiceAnswer: { "1d": "Model" },
    };
    expect(partRows(item)).toEqual([
      { id: "1a", prompt: "IP?", yours: "10.0.0.1", correct: "10.0.0.2", ok: false },
      { id: "1d", prompt: "Why?", yours: "because", correct: "Model", ok: null },
      { id: "1b", prompt: "User?", yours: "root", correct: "root", ok: true },
    ]);
  });

  it("partRows shows option text for MCQ parts and one row per firewall rule", () => {
    const hash: Pbq = {
      ...pbqBase,
      payload: {
        template: "hashCheck",
        intro: "",
        vendorHashes: "",
        computed: "",
        parts: [
          { id: "3b", prompt: "Do?", kind: "mcq", options: [{ id: "A", text: "Delete it" }] },
        ],
      },
      yourAnswer: { kind: "pbq", parts: { "3b": "A" } },
      correctAnswer: { kind: "pbq", parts: { "3b": "A" } },
      partResults: [true],
    };
    expect(partRows(hash)[0]).toMatchObject({ yours: "Delete it", correct: "Delete it", ok: true });

    const fw: Pbq = {
      ...pbqBase,
      payload: {
        template: "firewall",
        intro: "",
        requirements: [],
        diagram: "",
        rules: [{ source: "Any", destination: "Web", protocol: "TCP" }],
        portChoices: [],
        actionChoices: ["ALLOW", "DENY"],
      },
      yourAnswer: { kind: "firewall", rules: [{ port: "443", action: null }] },
      correctAnswer: { kind: "firewall", rules: [{ port: "443", action: "ALLOW" }] },
      partResults: [false],
    };
    expect(partRows(fw)).toEqual([
      { id: "1", prompt: "Any → Web (TCP)", yours: "443 · —", correct: "443 · ALLOW", ok: false },
    ]);
  });
});
