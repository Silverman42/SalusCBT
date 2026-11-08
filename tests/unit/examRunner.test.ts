import { describe, expect, it } from "vitest";
import type { ResponseMap } from "../../app/lib/attemptSync";
import {
  chooseLabel,
  formatClock,
  gridMove,
  mcqValue,
  navCellState,
  navLabel,
  nextLabel,
  optionIndexForKey,
  optionLetter,
  parseInline,
  pbqProgress,
  plainText,
  questionStatus,
  reviewItems,
  setFirewallCell,
  setPbqPart,
  summarise,
  toggleChoice,
  type RunnerQuestion,
} from "../../app/lib/examRunner";
import type { PbqPayload } from "../../shared/content";

const ssh: PbqPayload = {
  template: "sshLog",
  intro: "",
  log: "",
  parts: [
    { id: "1a", prompt: "IP", kind: "ip", scored: true },
    { id: "1b", prompt: "Account", kind: "text", scored: true },
    { id: "1d", prompt: "Command", kind: "text", scored: false },
  ],
};
const nmap: PbqPayload = {
  template: "nmap",
  intro: "",
  scan: "",
  parts: [{ id: "B2a", prompt: "Pair", kind: "portPair" }],
};
const firewall: PbqPayload = {
  template: "firewall",
  intro: "",
  requirements: [],
  diagram: "",
  rules: [
    { source: "Any", destination: "10.1.1.10", protocol: "TCP" },
    { source: "Any", destination: "Any", protocol: "TCP" },
  ],
  portChoices: ["Any", "443"],
  actionChoices: ["ALLOW", "DENY"],
};

const pbq = (id: string, n: string, payload: PbqPayload): RunnerQuestion => ({
  questionId: id,
  kind: "pbq",
  displayNumber: n,
  stem: `PBQ ${n}`,
  payload,
});
const mcq = (id: string, n: string, chooseCount = 1): RunnerQuestion => ({
  questionId: id,
  kind: "mcq",
  displayNumber: n,
  stem: `Which **one** is \`right\`? (${n})`,
  chooseCount,
});

const paper: RunnerQuestion[] = [
  pbq("p1", "B1", ssh),
  pbq("p2", "B2", firewall),
  mcq("m6", "6"),
  mcq("m7", "7", 2),
  mcq("m8", "8"),
];

const at = (value: ResponseMap[string]["value"], flagged = false) => ({
  value,
  flagged,
  updatedAt: 1,
});

describe("question state", () => {
  it("treats a blank value as unanswered", () => {
    expect(questionStatus(paper[2]!, at({ kind: "mcq", optionIds: [] }))).toEqual({
      answered: false,
      flagged: false,
      partial: false,
    });
    expect(questionStatus(paper[2]!, undefined).answered).toBe(false);
  });

  it("marks a PBQ with scored blanks left as partial (practice parts ignored)", () => {
    const some = at({ kind: "pbq", parts: { "1a": "1.2.3.4", "1d": "grep" } });
    expect(questionStatus(paper[0]!, some)).toMatchObject({ answered: true, partial: true });
    const all = at({ kind: "pbq", parts: { "1a": "1.2.3.4", "1b": "root" } });
    expect(questionStatus(paper[0]!, all)).toMatchObject({ answered: true, partial: false });
    expect(pbqProgress(ssh, all.value)).toEqual({ filled: 2, total: 2 });
  });

  it("counts portPair parts filled only when both ports are given", () => {
    expect(pbqProgress(nmap, { kind: "pbq", parts: { B2a: ["110", ""] } }).filled).toBe(0);
    expect(pbqProgress(nmap, { kind: "pbq", parts: { B2a: ["110", "995"] } }).filled).toBe(1);
  });

  it("counts firewall rules with both port and action", () => {
    const v = {
      kind: "firewall" as const,
      rules: [
        { port: "443", action: "ALLOW" },
        { port: "Any", action: null },
      ],
    };
    expect(pbqProgress(firewall, v)).toEqual({ filled: 1, total: 2 });
  });

  it("navigator cell: flagged wins over answered", () => {
    expect(navCellState({ answered: true, flagged: true, partial: false })).toBe("flagged");
    expect(navCellState({ answered: true, flagged: false, partial: false })).toBe("answered");
    expect(navCellState({ answered: false, flagged: false, partial: false })).toBe("unanswered");
  });

  it("labels PBQs P1–P5 and MCQs by number", () => {
    expect(paper.map((_, i) => navLabel(paper, i))).toEqual(["P1", "P2", "6", "7", "8"]);
  });
});

describe("summary and pre-submit review (EX-8, EX-12)", () => {
  const responses: ResponseMap = {
    p1: at({ kind: "pbq", parts: { "1a": "1.2.3.4" } }), // partial
    p2: at(undefined, true), // flagged, unanswered
    m6: at({ kind: "mcq", optionIds: ["A"] }, true), // flagged, answered
    m7: at({ kind: "mcq", optionIds: ["A", "C"] }),
    // m8 untouched
  };

  it("counts answered, flagged and unanswered", () => {
    expect(summarise(paper, responses)).toEqual({
      total: 5,
      answered: 3,
      flagged: 2,
      unanswered: 2,
    });
    expect(summarise(paper, {})).toEqual({ total: 5, answered: 0, flagged: 0, unanswered: 5 });
  });

  it("lists flagged, unanswered and partly answered questions in paper order", () => {
    expect(reviewItems(paper, responses)).toEqual([
      { index: 0, label: "P1", preview: "PBQ B1", state: "partial" },
      { index: 1, label: "P2", preview: "PBQ B2", state: "flaggedUnanswered" },
      { index: 2, label: "6", preview: "Which one is right? (6)", state: "flagged" },
      { index: 4, label: "8", preview: "Which one is right? (8)", state: "unanswered" },
    ]);
  });

  it("is empty when everything is answered and nothing flagged", () => {
    const done: ResponseMap = {
      p1: at({ kind: "pbq", parts: { "1a": "x", "1b": "y" } }),
      p2: at({
        kind: "firewall",
        rules: [
          { port: "443", action: "ALLOW" },
          { port: "Any", action: "DENY" },
        ],
      }),
      m6: at({ kind: "mcq", optionIds: ["A"] }),
      m7: at({ kind: "mcq", optionIds: ["A", "B"] }),
      m8: at({ kind: "mcq", optionIds: ["D"] }),
    };
    expect(reviewItems(paper, done)).toEqual([]);
  });
});

describe("choose-count enforcement (EX-9)", () => {
  it("single answer replaces the choice", () => {
    expect(toggleChoice([], "A", 1)).toEqual({ selected: ["A"], blocked: false });
    expect(toggleChoice(["A"], "B", 1)).toEqual({ selected: ["B"], blocked: false });
    expect(toggleChoice(["A"], "A", 1)).toEqual({ selected: ["A"], blocked: false });
  });

  it("Choose TWO toggles and refuses a third pick", () => {
    let s = toggleChoice([], "A", 2).selected;
    s = toggleChoice(s, "C", 2).selected;
    expect(s).toEqual(["A", "C"]);
    expect(toggleChoice(s, "D", 2)).toEqual({ selected: ["A", "C"], blocked: true });
    expect(toggleChoice(s, "A", 2)).toEqual({ selected: ["C"], blocked: false });
  });

  it("labels and values", () => {
    expect(chooseLabel(1)).toBeNull();
    expect(chooseLabel(2)).toBe("Choose TWO");
    expect(mcqValue([])).toBeNull();
    expect(mcqValue(["B"])).toEqual({ kind: "mcq", optionIds: ["B"] });
    expect([0, 1, 4].map(optionLetter)).toEqual(["A", "B", "E"]);
  });

  it("maps letter and number keys to options", () => {
    expect(optionIndexForKey("a", 4)).toBe(0);
    expect(optionIndexForKey("D", 4)).toBe(3);
    expect(optionIndexForKey("3", 4)).toBe(2);
    expect(optionIndexForKey("e", 4)).toBe(-1);
    expect(optionIndexForKey("0", 4)).toBe(-1);
    expect(optionIndexForKey("Enter", 4)).toBe(-1);
  });
});

describe("PBQ answer edits", () => {
  it("sets one part and clears to null when every part is blank", () => {
    const v = setPbqPart(undefined, "1a", "10.0.0.1");
    expect(v).toEqual({ kind: "pbq", parts: { "1a": "10.0.0.1" } });
    const w = setPbqPart(v!, "1b", "root");
    expect(w).toEqual({ kind: "pbq", parts: { "1a": "10.0.0.1", "1b": "root" } });
    expect(setPbqPart(setPbqPart(w!, "1a", "")!, "1b", "")).toBeNull();
  });

  it("sets firewall cells, padding rules to the payload length", () => {
    const v = setFirewallCell(undefined, 2, 1, "action", "DENY");
    expect(v).toEqual({
      kind: "firewall",
      rules: [
        { port: null, action: null },
        { port: null, action: "DENY" },
      ],
    });
    expect(setFirewallCell(v!, 2, 1, "action", "")).toBeNull();
  });
});

describe("navigation", () => {
  it("names the next step", () => {
    const five = [...paper.slice(0, 2), ...paper.slice(2)];
    expect(nextLabel(five, 0)).toBe("Next PBQ");
    expect(nextLabel(five, 1)).toBe("Start multiple choice");
    expect(nextLabel(five, 2)).toBe("Next");
    expect(nextLabel(five, 4)).toBe("Review & submit");
  });

  it("moves through the grid with arrow keys", () => {
    expect(gridMove(0, "ArrowLeft", 90, 10)).toBe(0);
    expect(gridMove(0, "ArrowRight", 90, 10)).toBe(1);
    expect(gridMove(5, "ArrowDown", 90, 10)).toBe(15);
    expect(gridMove(85, "ArrowDown", 90, 10)).toBe(85);
    expect(gridMove(15, "ArrowUp", 90, 10)).toBe(5);
    expect(gridMove(13, "Home", 90, 10)).toBe(10);
    expect(gridMove(83, "End", 90, 10)).toBe(89);
    expect(gridMove(13, "End", 90, 10, true)).toBe(89);
    expect(gridMove(13, "Home", 90, 10, true)).toBe(0);
    expect(gridMove(13, "Enter", 90, 10)).toBeNull();
  });

  it("formats the clock", () => {
    expect(formatClock(90 * 60_000)).toBe("90:00");
    expect(formatClock(500)).toBe("00:01");
    expect(formatClock(0)).toBe("00:00");
    expect(formatClock(-5)).toBe("00:00");
  });
});

describe("inline parser (SE-6)", () => {
  it("splits code and bold", () => {
    expect(parseInline("Fill in **Port** and `Action` now")).toEqual([
      { type: "text", value: "Fill in " },
      { type: "bold", value: "Port" },
      { type: "text", value: " and " },
      { type: "code", value: "Action" },
      { type: "text", value: " now" },
    ]);
  });

  it("leaves masked numbers, stray markers and markup alone", () => {
    expect(parseInline("shown as ************4417.")).toEqual([
      { type: "text", value: "shown as ************4417." },
    ]);
    expect(parseInline("a ` b ** c")).toEqual([{ type: "text", value: "a ` b ** c" }]);
    expect(parseInline("<b>x</b>")).toEqual([{ type: "text", value: "<b>x</b>" }]);
  });

  it("keeps asterisks inside code", () => {
    expect(parseInline("login `admin' OR 1=1 --` field")).toEqual([
      { type: "text", value: "login " },
      { type: "code", value: "admin' OR 1=1 --" },
      { type: "text", value: " field" },
    ]);
    expect(plainText("`**x**`")).toBe("**x**");
  });
});
