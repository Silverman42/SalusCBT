/**
 * T-309: answers for all ten seed PBQs (set A in a standard sitting, set B in
 * the retake), some parts right and some wrong or blank on purpose, with the
 * mark each part (or firewall rule) should get in review. Shared by the
 * review unit test (tests/unit/pbq/review.test.ts) and the live sitting
 * (tests/e2e/exam.spec.ts). Pure data: no Playwright, no Vue.
 *
 * Marks are in payload order, practice parts included ("practice").
 */
import type { AnswerValue } from "../../shared/content";

export type ExpectedMark = "correct" | "wrong" | "practice";

export interface PbqAnswerCase {
  displayNumber: string;
  answer: AnswerValue;
  marks: ExpectedMark[];
  /** Text the review must show for wrong parts: the correct answer as displayed. */
  shows: string[];
}

export const PBQ_ANSWERS: PbqAnswerCase[] = [
  {
    displayNumber: "1",
    answer: {
      kind: "pbq",
      parts: { "1a": "193.32.162.71", "1b": "root", "1c": "54", "1d": "grep Failed auth.log" },
    },
    marks: ["correct", "wrong", "correct", "practice"],
    shows: ["backup", "grep 'Failed password' auth.log"],
  },
  {
    displayNumber: "2",
    answer: { kind: "pbq", parts: { "2a": "23", "2b": "22", "2c": "3306" } },
    marks: ["correct", "correct", "wrong"],
    shows: ["21"],
  },
  {
    displayNumber: "3",
    answer: { kind: "pbq", parts: { "3a": "vpn-client-3.1.msi", "3b": "B", "3c": "D" } },
    marks: ["wrong", "correct", "wrong"],
    shows: ["backup-tool-1.8.deb", "Integrity"],
  },
  {
    displayNumber: "4",
    // 4b as `0640`: marking normalises octal modes; 4d left blank.
    answer: { kind: "pbq", parts: { "4a": "/etc/shadow", "4b": "0640", "4c": "644" } },
    marks: ["correct", "correct", "wrong", "wrong"],
    shows: ["600", "PermitRootLogin"],
  },
  {
    displayNumber: "5",
    answer: {
      kind: "firewall",
      rules: [
        { port: "443", action: "ALLOW" },
        { port: "22", action: "ALLOW" },
        { port: "3306", action: "DENY" },
        { port: "Any", action: "DENY" },
      ],
    },
    marks: ["correct", "correct", "wrong", "correct"],
    shows: ["3306 · Allow"],
  },
  {
    displayNumber: "B1",
    answer: {
      kind: "pbq",
      parts: { B1a: "91.240.118.29", B1b: "svc_web", B1c: "56" },
    },
    marks: ["correct", "correct", "correct", "practice"],
    shows: ["grep 'Failed password' auth.log"],
  },
  {
    displayNumber: "B2",
    answer: { kind: "pbq", parts: { B2a: ["110", "995"], B2b: ["143", "995"], B2c: "389" } },
    marks: ["correct", "wrong", "correct"],
    shows: ["Cleartext 143 · Secure 993"],
  },
  {
    displayNumber: "B3",
    answer: { kind: "pbq", parts: { B3a: "agent-installer-v4.2.exe", B3b: "A", B3c: "B" } },
    marks: ["correct", "wrong", "correct"],
    shows: ["Quarantine it"],
  },
  {
    displayNumber: "B4",
    answer: {
      kind: "pbq",
      parts: { B4a: "/etc/shadow", B4b: "640", B4c: "600", B4d: "PermitRootLogin" },
    },
    marks: ["correct", "correct", "correct", "correct"],
    shows: [],
  },
  {
    displayNumber: "B5",
    // The last rule left unset.
    answer: {
      kind: "firewall",
      rules: [
        { port: "25", action: "ALLOW" },
        { port: "143", action: "ALLOW" },
        { port: "22", action: "ALLOW" },
        { port: null, action: null },
      ],
    },
    marks: ["correct", "wrong", "correct", "wrong"],
    shows: ["993 · Allow", "Any · Deny"],
  },
];

/** Points a case earns: its correct marks. */
export const earnedFor = (c: PbqAnswerCase) => c.marks.filter((m) => m === "correct").length;
