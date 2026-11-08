/**
 * Time calls, pacing alerts and the 0:00 state machine for the exam runner
 * (T-214, LLD §14.2–14.3, PRD EX-3, EX-4, EX-5, EX-21). No Vue, Nuxt or DOM:
 * unit-tested in node.
 *
 * Pacing checkpoints are defined for a 90-minute exam and scaled by the
 * attempt's real duration (`deadline − startedAt`), which already includes
 * the class `timeMultiplier` (EX-21). Time calls are minutes *remaining*, so
 * they are not scaled.
 *
 * Each alert fires at most once per attempt: the ids already handled are
 * kept in `sessionStorage` (see `parsePacingState`), so a refresh doesn't
 * repeat them. If several checkpoints of one group are due at once (the
 * page was closed for a while), only the latest is evaluated; the others
 * are marked done without showing.
 */
import { isAnswered } from "./examRunner";
import type { AttemptStatus, ResponseMap } from "./attemptSync";

const MIN = 60_000;

/** The proctor guide's timings are for this duration (LLD §14.3). */
export const BASE_DURATION_MS = 90 * MIN;

/** Minutes remaining at which a time call shows (EX-4). */
export const TIME_CALL_MINUTES = [45, 15, 5] as const;

export type AlertGroup = "call" | "pacing";
export type AlertTone = "info" | "warn";

export type AlertId =
  "pace-pbq" | "pace-q35" | "pace-q60" | "pace-flagged" | "call-45" | "call-15" | "call-5";

export type Checkpoint = {
  id: AlertId;
  group: AlertGroup;
  /** Elapsed time at which it is due. */
  atMs: number;
};

/** A banner, fixed when it fires (its text doesn't change on refresh). */
export type PacingAlert = {
  id: AlertId;
  group: AlertGroup;
  tone: AlertTone;
  title: string;
  detail?: string;
};

/** The fields of a paper question the pacing logic needs. */
export type PacingQuestion = {
  questionId: string;
  kind: "mcq" | "pbq";
  displayNumber: string;
};

export type PacingInput = {
  /** `deadline − startedAt`. */
  durationMs: number;
  /** Server-clock time since `startedAt`. */
  elapsedMs: number;
  questions: readonly PacingQuestion[];
  responses: ResponseMap;
  /** Where the student is now, e.g. "Q42" or "PBQ 2" (for the time call detail). */
  currentLabel?: string;
};

/** Persisted per attempt. `done`: ids handled (shown or skipped). `active`: banners not dismissed. */
export type PacingState = { done: AlertId[]; active: PacingAlert[] };

export const EMPTY_PACING_STATE: PacingState = { done: [], active: [] };

// ---------------------------------------------------------------------------
// Checkpoints
// ---------------------------------------------------------------------------

/** Duration as a multiple of 90 minutes (1.5 for a 135-minute attempt). */
export function scaleOf(durationMs: number): number {
  return durationMs > 0 ? durationMs / BASE_DURATION_MS : 1;
}

const PACING_BASE: { id: AlertId; atMin: number }[] = [
  { id: "pace-pbq", atMin: 25 },
  { id: "pace-q35", atMin: 45 },
  { id: "pace-q60", atMin: 65 },
  { id: "pace-flagged", atMin: 80 },
];

/** Every checkpoint for an attempt of this duration, by elapsed time. */
export function checkpoints(durationMs: number): Checkpoint[] {
  const scale = scaleOf(durationMs);
  const out: Checkpoint[] = PACING_BASE.map((p) => ({
    id: p.id,
    group: "pacing",
    atMs: Math.round(p.atMin * MIN * scale),
  }));
  for (const m of TIME_CALL_MINUTES) {
    // A call longer than the whole exam would fire at the start: leave it out.
    if (m * MIN < durationMs) {
      out.push({ id: `call-${m}` as AlertId, group: "call", atMs: durationMs - m * MIN });
    }
  }
  return out.sort((a, b) => a.atMs - b.atMs);
}

/** "1:05" for 65 minutes (elapsed time, as the proctor guide writes it). */
export function formatElapsed(ms: number): string {
  const total = Math.round(ms / MIN);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// Conditions (LLD §14.3)
// ---------------------------------------------------------------------------

function mcqNumber(q: PacingQuestion): number | null {
  if (q.kind !== "mcq") return null;
  const n = Number(q.displayNumber);
  return Number.isFinite(n) ? n : null;
}

/** Highest MCQ number with an answer; 0 if none. */
export function highestAnsweredMcq(
  questions: readonly PacingQuestion[],
  responses: ResponseMap,
): number {
  let max = 0;
  for (const q of questions) {
    const n = mcqNumber(q);
    if (n !== null && n > max && isAnswered(responses[q.questionId]?.value)) max = n;
  }
  return max;
}

/** True if any PBQ is neither answered nor flagged. */
export function hasUntouchedPbq(
  questions: readonly PacingQuestion[],
  responses: ResponseMap,
): boolean {
  return questions.some((q) => {
    if (q.kind !== "pbq") return false;
    const s = responses[q.questionId];
    return !isAnswered(s?.value) && !s?.flagged;
  });
}

/**
 * "Behind Qn" target, capped at the paper's last MCQ number so a short
 * custom paper can still meet it. Null if the paper has no MCQs (PBQ retake).
 */
export function mcqTarget(questions: readonly PacingQuestion[], target: number): number | null {
  let last: number | null = null;
  for (const q of questions) {
    const n = mcqNumber(q);
    if (n !== null && (last === null || n > last)) last = n;
  }
  return last === null ? null : Math.min(target, last);
}

function behind(input: PacingInput, target: number): boolean {
  const t = mcqTarget(input.questions, target);
  return t !== null && highestAnsweredMcq(input.questions, input.responses) < t;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * The banner for a checkpoint, or null if its condition is false now.
 * Text scales with the duration ("about 90 seconds per question" at 1.5×).
 */
export function evaluate(id: AlertId, input: PacingInput): PacingAlert | null {
  const scale = scaleOf(input.durationMs);
  switch (id) {
    case "pace-pbq":
      if (!hasUntouchedPbq(input.questions, input.responses)) return null;
      return {
        id,
        group: "pacing",
        tone: "warn",
        title: "Flag the PBQs and move to the multiple-choice questions.",
        detail: "Come back to them once the multiple-choice questions are done.",
      };
    case "pace-q35":
      if (!behind(input, 35)) return null;
      return {
        id,
        group: "pacing",
        tone: "warn",
        title: `You're behind: about ${Math.round(60 * scale)} seconds per question.`,
        detail: "Flag the slow ones and keep moving: you can come back to them.",
      };
    case "pace-q60":
      if (!behind(input, 60)) return null;
      return {
        id,
        group: "pacing",
        tone: "warn",
        title: "Guess, flag and move on.",
        detail: "Unanswered questions score zero, so give every question an answer.",
      };
    case "pace-flagged": {
      const left = Math.round((BASE_DURATION_MS - 80 * MIN) * scale);
      return {
        id,
        group: "pacing",
        tone: "info",
        title: `Use the last ${plural(Math.round(left / MIN), "minute")} on flagged questions.`,
      };
    }
    default:
      return timeCall(id, input);
  }
}

function timeCall(id: AlertId, input: PacingInput): PacingAlert {
  const minutes = Number(id.slice("call-".length));
  const where = input.currentLabel ? `You're on ${input.currentLabel}. ` : "";
  const next = nextPacingHint(input);
  return {
    id,
    group: "call",
    tone: "info",
    title: `Time call — ${plural(minutes, "minute")} remaining.`,
    detail: (where + (next ?? "")).trim() || undefined,
  };
}

/** What the next pacing checkpoint asks for, if one is still ahead. */
function nextPacingHint(input: PacingInput): string | null {
  const ahead = checkpoints(input.durationMs).find(
    (c) => c.group === "pacing" && c.atMs > input.elapsedMs,
  );
  if (!ahead) return "Make sure every question has an answer.";
  const at = formatElapsed(ahead.atMs);
  switch (ahead.id) {
    case "pace-q35":
    case "pace-q60": {
      const t = mcqTarget(input.questions, ahead.id === "pace-q35" ? 35 : 60);
      return t === null ? null : `Aim to reach Q${t} by ${at} elapsed.`;
    }
    case "pace-flagged":
      return `At ${at} elapsed, go back to your flagged questions.`;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Firing
// ---------------------------------------------------------------------------

/**
 * Advance the pacing state to `input.elapsedMs`. Returns the new state and
 * the alerts that fired now (to announce). A new alert replaces the active
 * one of its group. Returns the same `state` object if nothing changed.
 */
export function stepPacing(
  state: PacingState,
  input: PacingInput,
): { state: PacingState; fired: PacingAlert[] } {
  const done = new Set(state.done);
  const due = checkpoints(input.durationMs).filter(
    (c) => c.atMs <= input.elapsedMs && !done.has(c.id),
  );
  if (due.length === 0) return { state, fired: [] };

  const fired: PacingAlert[] = [];
  let active = state.active;
  for (const group of ["pacing", "call"] as const) {
    const inGroup = due.filter((c) => c.group === group);
    const latest = inGroup.at(-1);
    if (!latest) continue;
    const alert = evaluate(latest.id, input);
    if (alert) {
      active = [...active.filter((a) => a.group !== group), alert];
      fired.push(alert);
    }
  }
  for (const c of due) done.add(c.id);
  return { state: { done: [...done], active }, fired };
}

export function dismissAlert(state: PacingState, id: AlertId): PacingState {
  return { ...state, active: state.active.filter((a) => a.id !== id) };
}

/** Screen-reader text for alerts that fired together. */
export function announcement(alerts: readonly PacingAlert[]): string {
  return alerts.map((a) => (a.detail ? `${a.title} ${a.detail}` : a.title)).join(" ");
}

const ALERT_IDS = new Set<string>([
  ...PACING_BASE.map((p) => p.id),
  ...TIME_CALL_MINUTES.map((m) => `call-${m}`),
]);

/** Read a stored state; anything malformed counts as empty. */
export function parsePacingState(raw: string | null | undefined): PacingState {
  if (!raw) return EMPTY_PACING_STATE;
  try {
    const v = JSON.parse(raw) as Partial<PacingState>;
    const done = Array.isArray(v.done)
      ? v.done.filter((id): id is AlertId => typeof id === "string" && ALERT_IDS.has(id))
      : [];
    const active = Array.isArray(v.active)
      ? v.active.filter(
          (a): a is PacingAlert =>
            !!a &&
            typeof a === "object" &&
            ALERT_IDS.has(a.id) &&
            (a.group === "call" || a.group === "pacing") &&
            (a.tone === "info" || a.tone === "warn") &&
            typeof a.title === "string" &&
            (a.detail === undefined || typeof a.detail === "string"),
        )
      : [];
    return { done, active };
  } catch {
    return EMPTY_PACING_STATE;
  }
}

export function pacingStorageKey(attemptId: string): string {
  return `salus.pacing.${attemptId}`;
}

// ---------------------------------------------------------------------------
// 0:00 (EX-3, LLD §14.2)
// ---------------------------------------------------------------------------

/**
 * - `running`: time left, or the attempt isn't loaded yet.
 * - `submitting`: 0:00 reached, `submit({ force: true })` in flight.
 * - `waiting`: that submit failed or is taking too long (offline); the
 *   server's `autoSubmit` (deadline + 30 s, or the sweep) will close the
 *   attempt. The page is read-only and retries now and then.
 * - `closed`: the attempt is submitted or expired; go to the result.
 */
export type TimeUpPhase = "running" | "submitting" | "waiting" | "closed";

export type TimeUpEvent =
  | { type: "tick"; remainingMs: number | null; status: AttemptStatus | null }
  | { type: "submitted" }
  | { type: "failed"; code: string | null }
  | { type: "timeout" }
  | { type: "retry" };

export type TimeUpEffect = "submit" | "redirect" | null;

/** How long a 0:00 submit may take before the page says the server will do it. */
export const TIME_UP_SUBMIT_TIMEOUT_MS = 8_000;
/** Retry interval while waiting (harmless: `ATTEMPT_CLOSED` once the server closed it). */
export const TIME_UP_RETRY_MS = 15_000;

export function timeUpStep(
  phase: TimeUpPhase,
  event: TimeUpEvent,
): { phase: TimeUpPhase; effect: TimeUpEffect } {
  if (phase === "closed") return { phase, effect: null };
  switch (event.type) {
    case "tick":
      if (event.status === "submitted" || event.status === "expired") {
        return { phase: "closed", effect: "redirect" };
      }
      if (
        phase === "running" &&
        event.status === "in_progress" &&
        event.remainingMs !== null &&
        event.remainingMs <= 0
      ) {
        return { phase: "submitting", effect: "submit" };
      }
      return { phase, effect: null };
    case "submitted":
      return { phase: "closed", effect: "redirect" };
    case "failed":
      // Already closed by the server (or another tab): the result is ready.
      if (event.code === "ATTEMPT_CLOSED") return { phase: "closed", effect: "redirect" };
      return { phase: phase === "running" ? phase : "waiting", effect: null };
    case "timeout":
      return { phase: phase === "submitting" ? "waiting" : phase, effect: null };
    case "retry":
      return phase === "waiting"
        ? { phase: "submitting", effect: "submit" }
        : { phase, effect: null };
  }
}
