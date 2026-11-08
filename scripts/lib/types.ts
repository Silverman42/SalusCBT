// Output shape of the exam parser (`scripts/parse-exam.ts`), consumed by
// `seed.importExam` (LLD §6.3). Field names follow the Convex tables in LLD
// §3.1 so seeding is a straight copy.
//
// SE-1: `answerKeys` and `labAnswers` are proctor/server-only. Everything a
// student may see lives in `questions`, `lab` and `exam`; nothing under app/
// may import this file, the parser or the seed JSON.

import type { PbqKey, PbqPayload, PbqTemplate } from "../../shared/content";

export type Domain = "1.0" | "2.0" | "3.0" | "4.0" | "5.0";
export type Section = "pbqA" | "pbqB" | "mcq";

export type SeedMcq = {
  order: number; // 1-based within the section
  section: "mcq";
  displayNumber: string; // "6".."90"
  kind: "mcq";
  domain: Domain;
  points: 1;
  stem: string;
  options: { id: string; text: string }[]; // ids "A".."F"
  chooseCount: number; // 1, or 2 for "(Choose TWO)"
};

export type SeedPbq = {
  order: number;
  section: "pbqA" | "pbqB";
  displayNumber: string; // "1".."5", "B1".."B5"
  kind: "pbq";
  domain: Domain;
  points: number; // scored parts (firewall: rules)
  stem: string; // the PBQ title
  template: PbqTemplate;
  payload: PbqPayload;
};

export type SeedQuestion = SeedMcq | SeedPbq;

/** SERVER-ONLY (SE-1). Matched to its question by `displayNumber`. */
export type SeedAnswerKey = {
  displayNumber: string;
  correct?: string[]; // mcq option ids, e.g. ["A", "B"]
  parts?: PbqKey; // pbq
  explanation: string;
};

export type SeedExam = {
  /** Fields of the `exams` table. */
  exam: {
    slug: string;
    title: string;
    timeLimitMin: number;
    passScaled: number;
    comfortScaled: number;
    domainTarget: number; // 0.81
  };
  scoring: {
    scaleMin: number; // 100
    scaleMax: number; // 900
    totalPoints: number; // 102 (set A PBQs + MCQs)
    passPoints: number; // 83
    /** Part 6 "Score conversion" rows; fixture for the marking tests (T-202). */
    conversion: { points: number; scaled: number; passed: boolean }[];
  };
  domains: { domain: Domain; name: string; weight: number; points: number }[];
  questions: SeedQuestion[];
  /** SERVER-ONLY (SE-1). */
  answerKeys: SeedAnswerKey[];
  oralQuestions: { order: number; question: string; modelAnswer: string }[];
  /** Part 5, stored for the terminal lab (Stage 7). Markdown bodies, unrendered. */
  lab: {
    intro: string;
    steps: { title: string; body: string }[];
    cheatSheet: { command: string; description: string }[];
  };
  /** Part 6 "Part 5 hands-on lab answers" bullets. Proctor-only. */
  labAnswers: string[];
};

/** A parse or validation problem. `line` is 1-based in the source file. */
export type ParseIssue = { line: number | null; message: string };

export type ParseResult = { ok: true; exam: SeedExam } | { ok: false; errors: ParseIssue[] };
