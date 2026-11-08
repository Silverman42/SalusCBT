import { describe, expect, it } from "vitest";
import type { ResponseMap } from "../../app/lib/attemptSync";
import type { AnswerValue } from "../../shared/content";
import {
  announcement,
  checkpoints,
  dismissAlert,
  EMPTY_PACING_STATE,
  evaluate,
  formatElapsed,
  hasUntouchedPbq,
  highestAnsweredMcq,
  mcqTarget,
  parsePacingState,
  scaleOf,
  stepPacing,
  timeUpStep,
  type PacingInput,
  type PacingQuestion,
  type PacingState,
  type TimeUpPhase,
} from "../../app/lib/pacing";

const MIN = 60_000;

// Paper like the seed: PBQs 1–5, MCQs 6–90.
const QUESTIONS: PacingQuestion[] = [
  ...Array.from({ length: 5 }, (_, i) => ({
    questionId: `p${i + 1}`,
    kind: "pbq" as const,
    displayNumber: String(i + 1),
  })),
  ...Array.from({ length: 85 }, (_, i) => ({
    questionId: `m${i + 6}`,
    kind: "mcq" as const,
    displayNumber: String(i + 6),
  })),
];

const mcqAnswer: AnswerValue = { kind: "mcq", optionIds: ["a"] };

/** Answer MCQs up to `upTo` and touch every PBQ (answered or flagged) if `pbqsDone`. */
function responses(upTo: number, pbqsDone = true): ResponseMap {
  const out: ResponseMap = {};
  for (let n = 6; n <= upTo; n++) out[`m${n}`] = { value: mcqAnswer, flagged: false, updatedAt: 1 };
  if (pbqsDone) {
    for (let i = 1; i <= 5; i++) {
      out[`p${i}`] =
        i % 2
          ? { flagged: true, updatedAt: 1 }
          : { value: { kind: "pbq", parts: { a: "x" } }, flagged: false, updatedAt: 1 };
    }
  }
  return out;
}

function input(over: Partial<PacingInput> & { elapsedMs: number }): PacingInput {
  return {
    durationMs: 90 * MIN,
    questions: QUESTIONS,
    responses: responses(90),
    ...over,
  };
}

/** Run the pacing state minute by minute up to `toMin`; returns ids fired in order. */
function run(
  durationMs: number,
  toMin: number,
  resp: (elapsedMin: number) => ResponseMap,
  start: PacingState = EMPTY_PACING_STATE,
) {
  let state = start;
  const fired: { id: string; at: number }[] = [];
  for (let t = 0; t <= toMin * 4; t++) {
    const elapsedMs = (t / 4) * MIN;
    const r = stepPacing(state, {
      durationMs,
      elapsedMs,
      questions: QUESTIONS,
      responses: resp(t / 4),
    });
    state = r.state;
    for (const a of r.fired) fired.push({ id: a.id, at: t / 4 });
  }
  return { state, fired };
}

describe("checkpoints", () => {
  it("uses the LLD times for a 90-minute attempt", () => {
    const c = checkpoints(90 * MIN).map((x) => [x.id, x.atMs / MIN]);
    expect(c).toEqual([
      ["pace-pbq", 25],
      ["pace-q35", 45],
      ["call-45", 45],
      ["pace-q60", 65],
      ["call-15", 75],
      ["pace-flagged", 80],
      ["call-5", 85],
    ]);
  });

  it("scales pacing (not time calls) with a 1.5× attempt (135 min, EX-21)", () => {
    expect(scaleOf(135 * MIN)).toBe(1.5);
    const c = Object.fromEntries(checkpoints(135 * MIN).map((x) => [x.id, x.atMs / MIN]));
    expect(c).toEqual({
      "pace-pbq": 37.5,
      "pace-q35": 67.5,
      "pace-q60": 97.5,
      "pace-flagged": 120,
      "call-45": 90,
      "call-15": 120,
      "call-5": 130,
    });
  });

  it("leaves out time calls longer than the attempt", () => {
    const ids = checkpoints(30 * MIN).map((x) => x.id);
    expect(ids).toContain("call-15");
    expect(ids).not.toContain("call-45");
  });

  it("formats elapsed time as h:mm", () => {
    expect(formatElapsed(65 * MIN)).toBe("1:05");
    expect(formatElapsed(97.5 * MIN)).toBe("1:38");
    expect(formatElapsed(25 * MIN)).toBe("0:25");
  });
});

describe("conditions", () => {
  it("highest answered MCQ ignores PBQs and blanks", () => {
    const r = responses(20);
    r.m40 = { value: { kind: "mcq", optionIds: [] }, flagged: true, updatedAt: 1 };
    expect(highestAnsweredMcq(QUESTIONS, r)).toBe(20);
    expect(highestAnsweredMcq(QUESTIONS, {})).toBe(0);
  });

  it("untouched PBQ: neither answered nor flagged", () => {
    expect(hasUntouchedPbq(QUESTIONS, responses(0, true))).toBe(false);
    expect(hasUntouchedPbq(QUESTIONS, responses(0, false))).toBe(true);
    const r = responses(0, true);
    delete r.p3;
    expect(hasUntouchedPbq(QUESTIONS, r)).toBe(true);
  });

  it("MCQ target is capped by the paper and null without MCQs", () => {
    expect(mcqTarget(QUESTIONS, 35)).toBe(35);
    expect(mcqTarget(QUESTIONS.slice(0, 20), 35)).toBe(20);
    expect(mcqTarget(QUESTIONS.slice(0, 5), 35)).toBeNull();
  });

  for (const m of [1, 1.5]) {
    const durationMs = 90 * MIN * m;
    describe(`multiplier ${m}`, () => {
      it("25 min: shows only if a PBQ is untouched", () => {
        const at = 25 * MIN * m;
        expect(
          evaluate(
            "pace-pbq",
            input({ durationMs, elapsedMs: at, responses: responses(10, false) }),
          ),
        ).not.toBeNull();
        expect(
          evaluate(
            "pace-pbq",
            input({ durationMs, elapsedMs: at, responses: responses(10, true) }),
          ),
        ).toBeNull();
      });

      it("45 min: shows only if behind Q35", () => {
        const at = 45 * MIN * m;
        const a = evaluate(
          "pace-q35",
          input({ durationMs, elapsedMs: at, responses: responses(34) }),
        );
        expect(a?.title).toBe(`You're behind: about ${60 * m} seconds per question.`);
        expect(
          evaluate("pace-q35", input({ durationMs, elapsedMs: at, responses: responses(35) })),
        ).toBeNull();
      });

      it("65 min: shows only if behind Q60", () => {
        const at = 65 * MIN * m;
        expect(
          evaluate("pace-q60", input({ durationMs, elapsedMs: at, responses: responses(59) }))
            ?.title,
        ).toBe("Guess, flag and move on.");
        expect(
          evaluate("pace-q60", input({ durationMs, elapsedMs: at, responses: responses(60) })),
        ).toBeNull();
      });

      it("80 min: always, with the scaled minutes left", () => {
        const a = evaluate("pace-flagged", input({ durationMs, elapsedMs: 80 * MIN * m }));
        expect(a?.title).toBe(`Use the last ${10 * m} minutes on flagged questions.`);
      });

      it("fires each checkpoint at its scaled time when its condition holds", () => {
        // Always behind and PBQs untouched: everything fires.
        const { fired } = run(durationMs, 90 * m, () => responses(10, false));
        expect(fired).toEqual([
          { id: "pace-pbq", at: 25 * m },
          ...(m === 1
            ? [
                { id: "pace-q35", at: 45 },
                { id: "call-45", at: 45 },
              ]
            : [
                { id: "pace-q35", at: 67.5 },
                { id: "call-45", at: 90 },
              ]),
          { id: "pace-q60", at: 65 * m },
          ...(m === 1
            ? [
                { id: "call-15", at: 75 },
                { id: "pace-flagged", at: 80 },
              ]
            : [
                { id: "pace-flagged", at: 120 },
                { id: "call-15", at: 120 },
              ]),
          { id: "call-5", at: 90 * m - 5 },
        ]);
      });

      it("on pace: only the 80-minute alert and the time calls", () => {
        const { fired } = run(durationMs, 90 * m, () => responses(90, true));
        expect(fired.map((f) => f.id).sort()).toEqual(
          ["call-15", "call-45", "call-5", "pace-flagged"].sort(),
        );
      });
    });
  }

  it("evaluates the condition when the checkpoint is reached, not later", () => {
    // Behind at 45 min, caught up by 46: the alert has already fired once.
    const { fired } = run(90 * MIN, 50, (t) => (t < 46 ? responses(20) : responses(40)));
    expect(fired.filter((f) => f.id === "pace-q35")).toHaveLength(1);
  });
});

describe("stepPacing", () => {
  it("fires each alert once", () => {
    const { fired } = run(90 * MIN, 90, () => responses(10, false));
    const ids = fired.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("doesn't repeat calls after a refresh (state restored from storage)", () => {
    const first = run(90 * MIN, 50, () => responses(10, false));
    const restored = parsePacingState(JSON.stringify(first.state));
    expect(restored).toEqual(first.state);
    const r = stepPacing(restored, input({ elapsedMs: 50 * MIN, responses: responses(10, false) }));
    expect(r.fired).toEqual([]);
    expect(r.state).toBe(restored);
    // Active banners survive the refresh until dismissed.
    expect(restored.active.map((a) => a.id).sort()).toEqual(["call-45", "pace-q35"]);
  });

  it("after a long gap shows only the latest due alert per group", () => {
    const r = stepPacing(
      EMPTY_PACING_STATE,
      input({ elapsedMs: 77 * MIN, responses: responses(10, false) }),
    );
    expect(r.fired.map((a) => a.id)).toEqual(["pace-q60", "call-15"]);
    expect(r.state.done.sort()).toEqual(
      ["call-15", "call-45", "pace-pbq", "pace-q35", "pace-q60"].sort(),
    );
  });

  it("a new alert replaces the active one of its group; dismiss removes it", () => {
    let s = stepPacing(
      EMPTY_PACING_STATE,
      input({ elapsedMs: 45 * MIN, responses: responses(10) }),
    ).state;
    expect(s.active.map((a) => a.id)).toEqual(["pace-q35", "call-45"]);
    s = stepPacing(s, input({ elapsedMs: 75 * MIN, responses: responses(10) })).state;
    expect(s.active.map((a) => a.id)).toEqual(["pace-q60", "call-15"]);
    s = dismissAlert(s, "call-15");
    expect(s.active.map((a) => a.id)).toEqual(["pace-q60"]);
    // Dismissed alerts stay done.
    expect(stepPacing(s, input({ elapsedMs: 76 * MIN })).fired).toEqual([]);
  });

  it("a skipped condition (false) still counts as done", () => {
    const s = stepPacing(
      EMPTY_PACING_STATE,
      input({ elapsedMs: 25 * MIN, responses: responses(10, true) }),
    );
    expect(s.fired).toEqual([]);
    expect(s.state.done).toEqual(["pace-pbq"]);
  });

  it("time call text matches the mockup, with the next pacing target", () => {
    const r = stepPacing(
      EMPTY_PACING_STATE,
      input({ elapsedMs: 45 * MIN, currentLabel: "Q42", responses: responses(41) }),
    );
    const call = r.fired.find((a) => a.id === "call-45");
    expect(call?.title).toBe("Time call — 45 minutes remaining.");
    expect(call?.detail).toBe("You're on Q42. Aim to reach Q60 by 1:05 elapsed.");
    expect(announcement(r.fired)).toContain("Time call — 45 minutes remaining.");
  });

  it("PBQ-only paper: no MCQ pacing alerts", () => {
    const pbqs = QUESTIONS.slice(0, 5);
    let state = EMPTY_PACING_STATE;
    const ids: string[] = [];
    for (let t = 0; t <= 90; t++) {
      const r = stepPacing(state, {
        durationMs: 90 * MIN,
        elapsedMs: t * MIN,
        questions: pbqs,
        responses: {},
      });
      state = r.state;
      ids.push(...r.fired.map((a) => a.id));
    }
    expect(ids).not.toContain("pace-q35");
    expect(ids).not.toContain("pace-q60");
    expect(ids).toContain("pace-pbq");
  });
});

describe("parsePacingState", () => {
  it("treats malformed storage as empty and drops unknown ids", () => {
    expect(parsePacingState(null)).toEqual(EMPTY_PACING_STATE);
    expect(parsePacingState("{not json")).toEqual(EMPTY_PACING_STATE);
    expect(
      parsePacingState(
        JSON.stringify({
          done: ["call-45", "nope", 3],
          active: [{ id: "x" }, { id: "call-45", group: "call", tone: "info", title: "t" }],
        }),
      ),
    ).toEqual({
      done: ["call-45"],
      active: [{ id: "call-45", group: "call", tone: "info", title: "t" }],
    });
  });
});

describe("timeUpStep (0:00)", () => {
  const tick = (
    remainingMs: number | null,
    status: "in_progress" | "submitted" | "expired" | null,
  ) => ({ type: "tick", remainingMs, status }) as const;

  it("waits while time is left or the state isn't loaded", () => {
    expect(timeUpStep("running", tick(1000, "in_progress"))).toEqual({
      phase: "running",
      effect: null,
    });
    expect(timeUpStep("running", tick(null, null))).toEqual({ phase: "running", effect: null });
    expect(timeUpStep("running", tick(0, null))).toEqual({ phase: "running", effect: null });
  });

  it("submits once at 0:00", () => {
    const a = timeUpStep("running", tick(0, "in_progress"));
    expect(a).toEqual({ phase: "submitting", effect: "submit" });
    expect(timeUpStep(a.phase, tick(0, "in_progress"))).toEqual({
      phase: "submitting",
      effect: null,
    });
  });

  it("success, or ATTEMPT_CLOSED, goes to the result", () => {
    expect(timeUpStep("submitting", { type: "submitted" })).toEqual({
      phase: "closed",
      effect: "redirect",
    });
    expect(timeUpStep("submitting", { type: "failed", code: "ATTEMPT_CLOSED" })).toEqual({
      phase: "closed",
      effect: "redirect",
    });
  });

  it("offline: waits for the server, retries, and redirects once it closes the attempt", () => {
    let p: TimeUpPhase = timeUpStep("running", tick(0, "in_progress")).phase;
    p = timeUpStep(p, { type: "timeout" }).phase;
    expect(p).toBe("waiting");
    expect(timeUpStep(p, { type: "retry" })).toEqual({ phase: "submitting", effect: "submit" });
    p = timeUpStep("submitting", { type: "failed", code: null }).phase;
    expect(p).toBe("waiting");
    // The server's autoSubmit closes it; getState reports "submitted".
    expect(timeUpStep(p, tick(0, "submitted"))).toEqual({ phase: "closed", effect: "redirect" });
  });

  it("a late success after the timeout still redirects", () => {
    expect(timeUpStep("waiting", { type: "submitted" })).toEqual({
      phase: "closed",
      effect: "redirect",
    });
  });

  it("redirects when the server closes the attempt at any time, once", () => {
    expect(timeUpStep("running", tick(30 * MIN, "expired"))).toEqual({
      phase: "closed",
      effect: "redirect",
    });
    expect(timeUpStep("closed", tick(0, "submitted"))).toEqual({ phase: "closed", effect: null });
    expect(timeUpStep("closed", { type: "submitted" })).toEqual({ phase: "closed", effect: null });
  });

  it("ignores stray events while running", () => {
    expect(timeUpStep("running", { type: "timeout" }).phase).toBe("running");
    expect(timeUpStep("running", { type: "retry" }).phase).toBe("running");
  });
});
