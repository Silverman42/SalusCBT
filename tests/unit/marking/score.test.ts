import { describe, expect, it } from "vitest";
import type { AnswerValue, PbqPayload } from "../../../shared/content";
import {
  byDomain,
  isBelowTarget,
  scaledScore,
  scorePaper,
  scoreQuestion,
  summarise,
  type Domain,
  type MarkKey,
  type MarkQuestion,
  type QuestionScore,
} from "../../../convex/marking/score";

// Fixtures follow Part 1 / Part 6 of content/source/secplus-701-mock-exam.md.
const exam = { passScaled: 750, comfortScaled: 800 };

const sshLog: PbqPayload = {
  template: "sshLog",
  intro: "",
  log: "",
  parts: [
    { id: "1a", prompt: "Source IP", kind: "ip", scored: true },
    { id: "1b", prompt: "Account", kind: "text", scored: true },
    { id: "1c", prompt: "Failures", kind: "integer", scored: true },
    { id: "1d", prompt: "Practice", kind: "text", scored: false },
  ],
};
const sshKey: MarkKey = {
  parts: {
    parts: { "1a": "193.32.162.71", "1b": "backup", "1c": "54" },
    practice: { "1d": "grep" },
  },
};

const nmap: PbqPayload = {
  template: "nmap",
  intro: "",
  scan: "",
  parts: [
    { id: "2a", prompt: "", kind: "port" },
    { id: "2b", prompt: "", kind: "port" },
    { id: "2c", prompt: "", kind: "port" },
  ],
};
const nmapKey: MarkKey = { parts: { parts: { "2a": "23", "2b": "22", "2c": "21" } } };

const nmapB: PbqPayload = {
  template: "nmap",
  intro: "",
  scan: "",
  parts: [
    { id: "B2a", prompt: "", kind: "portPair" },
    { id: "B2b", prompt: "", kind: "portPair" },
    { id: "B2c", prompt: "", kind: "port" },
  ],
};
const nmapBKey: MarkKey = {
  parts: { parts: { B2a: ["110", "995"], B2b: ["143", "993"], B2c: "389" } },
};

const opts = ["A", "B", "C", "D"].map((id) => ({ id, text: id }));
const hashCheck: PbqPayload = {
  template: "hashCheck",
  intro: "",
  vendorHashes: "",
  computed: "",
  parts: [
    { id: "3a", prompt: "", kind: "pick", choices: ["a.deb", "backup-tool-1.8.deb"] },
    { id: "3b", prompt: "", kind: "mcq", options: opts },
    { id: "3c", prompt: "", kind: "mcq", options: opts },
  ],
};
const hashKey: MarkKey = {
  parts: { parts: { "3a": "backup-tool-1.8.deb", "3b": "B", "3c": "B" } },
};

const permissions: PbqPayload = {
  template: "permissions",
  intro: "",
  listings: "",
  sshdConfig: "",
  parts: [
    { id: "4a", prompt: "", kind: "path", scored: true },
    { id: "4b", prompt: "", kind: "octal", scored: true },
    { id: "4c", prompt: "", kind: "octal", scored: true },
    { id: "4d", prompt: "", kind: "directive", scored: true },
  ],
};
const permKey: MarkKey = {
  parts: { parts: { "4a": "/etc/shadow", "4b": "640", "4c": "600", "4d": "PermitRootLogin" } },
};

const firewall: PbqPayload = {
  template: "firewall",
  intro: "",
  requirements: [],
  diagram: "",
  rules: [
    { source: "Any", destination: "10.1.1.10", protocol: "TCP" },
    { source: "192.168.10.0/24", destination: "10.1.1.10", protocol: "TCP" },
    { source: "10.1.1.10", destination: "10.1.2.20", protocol: "TCP" },
    { source: "Any", destination: "Any", protocol: "TCP" },
  ],
  portChoices: ["Any", "22", "80", "443", "3306"],
  actionChoices: ["ALLOW", "DENY"],
};
const fwKey: MarkKey = {
  parts: {
    rules: [
      { port: "443", action: "ALLOW" },
      { port: "22", action: "ALLOW" },
      { port: "3306", action: "ALLOW" },
      { port: "Any", action: "DENY" },
    ],
  },
};

const pbq = (payload: PbqPayload, domain: Domain, points: number): MarkQuestion => ({
  kind: "pbq",
  domain,
  points,
  template: payload.template,
  payload,
});
const mcq = (domain: Domain): MarkQuestion => ({ kind: "mcq", domain, points: 1 });
const mcqAnswer = (...optionIds: string[]): AnswerValue => ({ kind: "mcq", optionIds });
const pbqAnswer = (parts: Record<string, string | string[]>): AnswerValue => ({
  kind: "pbq",
  parts,
});
const fwAnswer = (...rules: [string | null, string | null][]): AnswerValue => ({
  kind: "firewall",
  rules: rules.map(([port, action]) => ({ port, action })),
});

describe("scoreQuestion · MCQ", () => {
  const q = mcq("1.0");
  it("scores a single-answer MCQ", () => {
    expect(scoreQuestion(q, { correct: ["C"] }, mcqAnswer("C"))).toEqual({ earned: 1, max: 1 });
    expect(scoreQuestion(q, { correct: ["C"] }, mcqAnswer("A"))).toEqual({ earned: 0, max: 1 });
  });

  it("Choose TWO is both-or-nothing (EX-9)", () => {
    const key = { correct: ["A", "B"] };
    expect(scoreQuestion(q, key, mcqAnswer("A", "B")).earned).toBe(1);
    expect(scoreQuestion(q, key, mcqAnswer("B", "A")).earned).toBe(1);
    expect(scoreQuestion(q, key, mcqAnswer("A")).earned).toBe(0);
    expect(scoreQuestion(q, key, mcqAnswer("B")).earned).toBe(0);
    expect(scoreQuestion(q, key, mcqAnswer("A", "C")).earned).toBe(0);
    expect(scoreQuestion(q, key, mcqAnswer("A", "B", "C")).earned).toBe(0);
  });

  it("an extra choice on a single-answer MCQ scores 0", () => {
    expect(scoreQuestion(q, { correct: ["C"] }, mcqAnswer("C", "D")).earned).toBe(0);
  });

  it("unanswered, empty or wrong-shaped answers score 0", () => {
    const key = { correct: ["C"] };
    expect(scoreQuestion(q, key, undefined).earned).toBe(0);
    expect(scoreQuestion(q, key, null).earned).toBe(0);
    expect(scoreQuestion(q, key, mcqAnswer()).earned).toBe(0);
    expect(scoreQuestion(q, key, pbqAnswer({ C: "C" })).earned).toBe(0);
  });

  it("a missing or empty key never matches, even an empty answer", () => {
    expect(scoreQuestion(q, undefined, mcqAnswer()).earned).toBe(0);
    expect(scoreQuestion(q, {}, mcqAnswer()).earned).toBe(0);
    expect(scoreQuestion(q, { correct: [] }, mcqAnswer()).earned).toBe(0);
  });
});

describe("scoreQuestion · text / port / pick parts", () => {
  it("scores each scored part and ignores practice parts (PB-2)", () => {
    const q = pbq(sshLog, "4.0", 3);
    const all = pbqAnswer({ "1a": "193.32.162.71", "1b": "Backup", "1c": "54", "1d": "grep" });
    expect(scoreQuestion(q, sshKey, all)).toEqual({ earned: 3, max: 3, parts: [true, true, true] });

    const partial = pbqAnswer({ "1a": "193.32.162.71", "1c": "55" });
    expect(scoreQuestion(q, sshKey, partial)).toEqual({
      earned: 1,
      max: 3,
      parts: [true, false, false],
    });
  });

  it("a correct practice part alone scores 0", () => {
    const q = pbq(sshLog, "4.0", 3);
    expect(scoreQuestion(q, sshKey, pbqAnswer({ "1d": "grep" })).earned).toBe(0);
  });

  it("scores nmap port parts, including port pairs in order", () => {
    expect(
      scoreQuestion(
        pbq(nmap, "2.0", 3),
        nmapKey,
        pbqAnswer({ "2a": "23", "2b": " 22 ", "2c": "20" }),
      ),
    ).toEqual({ earned: 2, max: 3, parts: [true, true, false] });

    const q = pbq(nmapB, "2.0", 3);
    const ans = pbqAnswer({ B2a: ["110", "995"], B2b: ["993", "143"], B2c: "389" });
    expect(scoreQuestion(q, nmapBKey, ans)).toEqual({
      earned: 2,
      max: 3,
      parts: [true, false, true],
    });
  });

  it("scores pick and mcq parts in hashCheck", () => {
    const q = pbq(hashCheck, "1.0", 3);
    const ans = pbqAnswer({ "3a": "backup-tool-1.8.deb", "3b": "B", "3c": "A" });
    expect(scoreQuestion(q, hashKey, ans)).toEqual({
      earned: 2,
      max: 3,
      parts: [true, true, false],
    });
  });

  it("applies the normalisers (path, octal, directive)", () => {
    const q = pbq(permissions, "4.0", 4);
    const ans = pbqAnswer({ "4a": "shadow", "4b": "0640", "4c": "600", "4d": "permitrootlogin" });
    expect(scoreQuestion(q, permKey, ans).earned).toBe(4);
  });

  it("unanswered scores 0 with every part false", () => {
    const q = pbq(permissions, "4.0", 4);
    expect(scoreQuestion(q, permKey, undefined)).toEqual({
      earned: 0,
      max: 4,
      parts: [false, false, false, false],
    });
    expect(scoreQuestion(q, permKey, mcqAnswer("A")).earned).toBe(0);
  });

  it("a part missing from the key never matches", () => {
    const q = pbq(nmap, "2.0", 3);
    const key: MarkKey = { parts: { parts: { "2a": "23" } } };
    expect(scoreQuestion(q, key, pbqAnswer({ "2a": "23", "2b": "22" })).parts).toEqual([
      true,
      false,
      false,
    ]);
    expect(scoreQuestion(q, undefined, pbqAnswer({ "2a": "23" })).earned).toBe(0);
  });
});

describe("scoreQuestion · firewall (PB-3)", () => {
  const q = pbq(firewall, "3.0", 4);

  it("full marks when every port and action matches", () => {
    const ans = fwAnswer(["443", "ALLOW"], ["22", "ALLOW"], ["3306", "ALLOW"], ["any", "DENY"]);
    expect(scoreQuestion(q, fwKey, ans)).toEqual({
      earned: 4,
      max: 4,
      parts: [true, true, true, true],
    });
  });

  it("partial credit per rule; a rule needs both port and action", () => {
    const ans = fwAnswer(["443", "ALLOW"], ["22", "DENY"], ["80", "ALLOW"], ["Any", "DENY"]);
    expect(scoreQuestion(q, fwKey, ans)).toEqual({
      earned: 2,
      max: 4,
      parts: [true, false, false, true],
    });
  });

  it("blank rules and missing rows score 0", () => {
    expect(scoreQuestion(q, fwKey, fwAnswer(["443", "ALLOW"])).parts).toEqual([
      true,
      false,
      false,
      false,
    ]);
    expect(scoreQuestion(q, fwKey, fwAnswer([null, null], [null, "ALLOW"])).earned).toBe(0);
    expect(scoreQuestion(q, fwKey, undefined).earned).toBe(0);
  });

  it("a null port never matches a null key port", () => {
    const badKey = {
      parts: { rules: [{ port: null as unknown as string, action: "DENY" as const }] },
    };
    expect(scoreQuestion(q, badKey, fwAnswer([null, "DENY"])).earned).toBe(0);
  });
});

// The real paper: 5 PBQs (3+3+3+4+4 = 17 points) + MCQs 6–90 (85 points) = 102.
const mcqDomains: Record<Domain, number[]> = {
  "1.0": [6, 39, 41, 44, 46, 55, 71, 77, 80, 81],
  "2.0": [9, 11, 13, 21, 27, 31, 36, 37, 48, 51, 63, 64, 70, 75, 78, 82, 85, 86, 89],
  "3.0": [12, 15, 18, 23, 28, 30, 38, 42, 45, 49, 50, 52, 60, 72, 90],
  "4.0": [
    7, 20, 22, 25, 29, 32, 34, 35, 40, 47, 53, 54, 57, 58, 59, 61, 66, 67, 68, 79, 83, 84, 87, 88,
  ],
  "5.0": [8, 10, 14, 16, 17, 19, 24, 26, 33, 43, 56, 62, 65, 69, 73, 74, 76],
};
const chooseTwo = new Set([20, 26, 50, 78]);

type PaperItem = { id: string; q: MarkQuestion; key: MarkKey; right: AnswerValue };
const paper: PaperItem[] = [
  {
    id: "1",
    q: pbq(sshLog, "4.0", 3),
    key: sshKey,
    right: pbqAnswer({ "1a": "193.32.162.71", "1b": "backup", "1c": "54" }),
  },
  {
    id: "2",
    q: pbq(nmap, "2.0", 3),
    key: nmapKey,
    right: pbqAnswer({ "2a": "23", "2b": "22", "2c": "21" }),
  },
  {
    id: "3",
    q: pbq(hashCheck, "1.0", 3),
    key: hashKey,
    right: pbqAnswer({ "3a": "backup-tool-1.8.deb", "3b": "B", "3c": "B" }),
  },
  {
    id: "4",
    q: pbq(permissions, "4.0", 4),
    key: permKey,
    right: pbqAnswer({ "4a": "/etc/shadow", "4b": "640", "4c": "600", "4d": "PermitRootLogin" }),
  },
  {
    id: "5",
    q: pbq(firewall, "3.0", 4),
    key: fwKey,
    right: fwAnswer(["443", "ALLOW"], ["22", "ALLOW"], ["3306", "ALLOW"], ["Any", "DENY"]),
  },
  ...Object.entries(mcqDomains)
    .flatMap(([d, nums]) => nums.map((n) => ({ n, d: d as Domain })))
    .sort((a, b) => a.n - b.n)
    .map(({ n, d }) => {
      const correct = chooseTwo.has(n) ? ["A", "B"] : ["C"];
      return { id: String(n), q: mcq(d), key: { correct }, right: mcqAnswer(...correct) };
    }),
];

const questions = paper.map((p) => ({ ...p.q, _id: p.id }));
const keys = new Map(paper.map((p) => [p.id, p.key]));
const allRight = () => new Map<string, AnswerValue | undefined>(paper.map((p) => [p.id, p.right]));

describe("summarise · the 102-point paper", () => {
  it("the fixture matches Part 6: 90 questions, 102 points, domains 13/22/19/31/17", () => {
    expect(questions).toHaveLength(90);
    const { summary } = scorePaper(questions, keys, allRight(), exam);
    expect(summary.totalPoints).toBe(102);
    expect(summary.domains.map((d) => d.max)).toEqual([13, 22, 19, 31, 17]);
    expect(summary).toMatchObject({ points: 102, scaled: 900, passed: true, comfortable: true });
  });

  // Stage 2 gate (LLD §8.2, Part 6 score conversion table).
  it.each([
    [102, 900, true],
    [95, 845, true],
    [90, 806, true],
    [87, 782, true],
    [83, 751, true],
    [82, 743, false],
    [78, 712, false],
    [70, 649, false],
    [60, 571, false],
  ])("%i points → %i (passed: %s)", (points, scaled, passed) => {
    // Drop MCQs (unanswered) from the end until `points` remain.
    const values = allRight();
    const mcqIds = paper.filter((p) => p.q.kind === "mcq").map((p) => p.id);
    for (const id of mcqIds.slice(mcqIds.length - (102 - points))) values.delete(id);
    const { summary } = scorePaper(questions, keys, values, exam);
    expect(summary).toMatchObject({ points, totalPoints: 102, scaled, passed });
    expect(summary.comfortable).toBe(scaled >= 800);
    expect(scaledScore(points, 102)).toBe(scaled);
  });

  it("comfortable starts at 89 points (800)", () => {
    expect(scaledScore(89, 102)).toBe(798);
    expect(scaledScore(90, 102)).toBe(806);
  });

  it("an empty paper scores 100 and fails", () => {
    const { summary } = scorePaper(questions, keys, new Map(), exam);
    expect(summary).toMatchObject({ points: 0, scaled: 100, passed: false, comfortable: false });
    expect(summary.domains.every((d) => d.points === 0)).toBe(true);
  });

  it("domain points sum to the total and follow partial PBQ credit", () => {
    const values = allRight();
    values.set("5", fwAnswer(["443", "ALLOW"], ["22", "DENY"])); // 1 / 4, domain 3.0
    values.set("20", mcqAnswer("A")); // Choose TWO, one right → 0, domain 4.0
    values.set("6", mcqAnswer("A")); // wrong, domain 1.0
    values.delete("8"); // unanswered, domain 5.0
    const { summary, perQuestion } = scorePaper(questions, keys, values, exam);
    expect(summary.domains).toEqual([
      { domain: "1.0", points: 12, max: 13 },
      { domain: "2.0", points: 22, max: 22 },
      { domain: "3.0", points: 16, max: 19 },
      { domain: "4.0", points: 30, max: 31 },
      { domain: "5.0", points: 16, max: 17 },
    ]);
    expect(summary.points).toBe(96);
    expect(summary.domains.reduce((s, d) => s + d.points, 0)).toBe(summary.points);
    expect(summary.domains.reduce((s, d) => s + d.max, 0)).toBe(summary.totalPoints);
    expect(perQuestion.find((r) => r.questionId === "5")).toMatchObject({
      earned: 1,
      max: 4,
      parts: [true, false, false, false],
    });
  });

  it("isBelowTarget flags domains under 81%", () => {
    const target = 0.81;
    expect(isBelowTarget({ domain: "1.0", points: 11, max: 13 }, target)).toBe(false); // 84.6%
    expect(isBelowTarget({ domain: "1.0", points: 10, max: 13 }, target)).toBe(true); // 76.9%
    expect(isBelowTarget({ domain: "5.0", points: 0, max: 0 }, target)).toBe(false);
  });
});

describe("summarise · total follows the questions (ED-10)", () => {
  const qs: MarkQuestion[] = [mcq("1.0"), mcq("2.0"), pbq(firewall, "3.0", 4)];
  const scores: QuestionScore[] = [
    { earned: 1, max: 1 },
    { earned: 0, max: 1 },
    { earned: 3, max: 4, parts: [true, true, true, false] },
  ];

  it("totals the points of the questions given", () => {
    const s = summarise(qs, scores, exam);
    expect(s).toMatchObject({ points: 4, totalPoints: 6, scaled: Math.round(100 + (800 * 4) / 6) });
  });

  it("adding or removing a question changes the total", () => {
    expect(
      summarise([...qs, mcq("5.0")], [...scores, { earned: 1, max: 1 }], exam).totalPoints,
    ).toBe(7);
    expect(summarise(qs.slice(0, 2), scores.slice(0, 2), exam)).toMatchObject({
      points: 1,
      totalPoints: 2,
      scaled: 500,
    });
  });

  it("all five domains are always reported, empty ones with max 0", () => {
    expect(byDomain(qs, scores)).toEqual([
      { domain: "1.0", points: 1, max: 1 },
      { domain: "2.0", points: 0, max: 1 },
      { domain: "3.0", points: 3, max: 4 },
      { domain: "4.0", points: 0, max: 0 },
      { domain: "5.0", points: 0, max: 0 },
    ]);
  });

  it("earned is clamped to the question's points", () => {
    const s = summarise([mcq("1.0")], [{ earned: 5, max: 5 }], exam);
    expect(s).toMatchObject({ points: 1, totalPoints: 1, scaled: 900 });
  });

  it("a paper worth nothing scores 100", () => {
    expect(summarise([], [], exam)).toMatchObject({ points: 0, totalPoints: 0, scaled: 100 });
  });

  it("rejects misaligned perQuestion", () => {
    expect(() => summarise(qs, scores.slice(1), exam)).toThrow();
  });
});
