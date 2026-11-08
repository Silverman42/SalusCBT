// Pure helpers for the landing and start screens (T-211, T-508; LLD §7.1,
// §14.1; PRD EX-1, EX-2, CL-4, PR-1). No Vue or Nuxt imports, so they are
// unit-tested directly.

/** Same limit as the start route and `attempts.start` (CL-4). */
export const START_DISPLAY_NAME_MAX = 40;
/** The start route refuses longer codes as `CLASS_UNKNOWN`; `lookupCode` returns null. */
export const CLASS_CODE_INPUT_MAX = 32;
/** Debounce for the live class lookup while the student types. */
export const CLASS_LOOKUP_DEBOUNCE_MS = 300;

/** Mirrors convex/lib/codes.ts (`CLASS_CODE_ALPHABET`, `CLASS_CODE_PREFIX`). */
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const CODE_PREFIX = "SEC-";
const CODE_LENGTH = 4;
const CODE_BODY = new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
const CODE_FULL = new RegExp(`^${CODE_PREFIX}[${CODE_ALPHABET}]{${CODE_LENGTH}}$`);
export const CLASS_CODE_EXAMPLE = "SEC-4K7Q";

/** The exam as the landing chips and instructions describe it (content file header). */
export const EXAM_FACTS = {
  minutes: 90,
  questions: 90,
  pbqs: 5,
  mcqs: 85,
  points: 102,
  passScaled: 750,
  passPoints: 83,
} as const;

/**
 * Normalise what the student typed into a stored class code: upper-case, no
 * whitespace, and the `SEC-` prefix added when they typed only the four
 * characters or left out the dash. Returns `""` for empty input. Anything
 * else is returned upper-cased so the server can still answer for it.
 */
export function normaliseClassCodeInput(input: string | null | undefined): string {
  const raw = (input ?? "").toUpperCase().replace(/\s+/g, "");
  if (!raw) return "";
  if (CODE_BODY.test(raw)) return CODE_PREFIX + raw;
  const noDash = /^SEC([^-].*)$/.exec(raw);
  if (noDash && CODE_BODY.test(noDash[1] as string)) return CODE_PREFIX + noDash[1];
  return raw;
}

/** `true` if the normalised code has the `SEC-XXXX` shape, so it is worth looking up. */
export function isCompleteClassCode(code: string): boolean {
  return CODE_FULL.test(code);
}

export type ClassLookupResult = { name: string; open: boolean } | null;

export type ClassCodeState =
  | { kind: "none" }
  | { kind: "incomplete" }
  | { kind: "invalid" }
  | { kind: "checking" }
  | { kind: "error" }
  | { kind: "unknown" }
  | { kind: "closed"; name: string }
  | { kind: "found"; name: string };

/**
 * What the class-code field should show. `lookup` is `undefined` while a
 * lookup for `code` hasn't answered, `"error"` if it failed.
 */
export function classCodeState(
  code: string,
  lookup: ClassLookupResult | "error" | undefined,
): ClassCodeState {
  if (!code) return { kind: "none" };
  if (!isCompleteClassCode(code)) {
    const couldGrow = code.length < CODE_PREFIX.length + CODE_LENGTH && isCodePrefix(code);
    return couldGrow ? { kind: "incomplete" } : { kind: "invalid" };
  }
  if (lookup === undefined) return { kind: "checking" };
  if (lookup === "error") return { kind: "error" };
  if (lookup === null) return { kind: "unknown" };
  return lookup.open ? { kind: "found", name: lookup.name } : { kind: "closed", name: lookup.name };
}

/** `true` if `code` could still become a full `SEC-XXXX` code by typing more. */
function isCodePrefix(code: string): boolean {
  const head = code.slice(0, CODE_PREFIX.length);
  if (!CODE_PREFIX.startsWith(head)) return false;
  const body = code.slice(CODE_PREFIX.length);
  return [...body].every((c) => CODE_ALPHABET.includes(c));
}

/** Inline message for the class-code field, `null` when there is nothing to say. */
export function classCodeMessage(state: ClassCodeState): {
  text: string;
  tone: "ok" | "bad" | "muted";
} | null {
  switch (state.kind) {
    case "none":
    case "incomplete":
      return null;
    case "checking":
      return { text: "Checking the code…", tone: "muted" };
    case "invalid":
      return {
        text: `That doesn't look like a class code. Codes look like ${CLASS_CODE_EXAMPLE}.`,
        tone: "bad",
      };
    case "error":
      return { text: "We couldn't check the code just now. You can still start.", tone: "muted" };
    case "unknown":
      return { text: "Class not found. Check the code with your tutor.", tone: "bad" };
    case "closed":
      return {
        text: `${state.name} is closed and isn't accepting new attempts. Ask your tutor.`,
        tone: "bad",
      };
    case "found":
      return { text: `Joining ${state.name}`, tone: "ok" };
  }
}

export interface StartFormInput {
  displayName: string;
  classCode: string;
  classState: ClassCodeState;
}

export interface StartFormErrors {
  displayName?: string;
  classCode?: string;
}

/**
 * Client-side checks before posting (the server checks again). With a class
 * code the display name is required (CL-4); it is always at most 40
 * characters. Codes the lookup already rejected block the start.
 */
export function validateStartForm(input: StartFormInput): StartFormErrors {
  const errors: StartFormErrors = {};
  const name = input.displayName.trim();
  const code = input.classCode;
  if (name.length > START_DISPLAY_NAME_MAX) {
    errors.displayName = `Keep your display name to ${START_DISPLAY_NAME_MAX} characters or fewer.`;
  } else if (code && !name) {
    errors.displayName = "Enter a display name so your tutor can see your result.";
  }
  if (code.length > CLASS_CODE_INPUT_MAX) {
    errors.classCode = `That doesn't look like a class code. Codes look like ${CLASS_CODE_EXAMPLE}.`;
  } else {
    switch (input.classState.kind) {
      case "incomplete":
      case "invalid":
        errors.classCode = `Enter the full class code, like ${CLASS_CODE_EXAMPLE}, or leave it empty.`;
        break;
      case "unknown":
      case "closed": {
        const msg = classCodeMessage(input.classState);
        if (msg) errors.classCode = msg.text;
        break;
      }
      default:
        break;
    }
  }
  return errors;
}

export function hasErrors(errors: StartFormErrors): boolean {
  return errors.displayName !== undefined || errors.classCode !== undefined;
}

export type StartMode = "standard" | "retake";

/** `?mode=` from the route query: `"retake"` (PB-4) or the standard sitting. */
export function startModeFromQuery(value: unknown): StartMode {
  const v = Array.isArray(value) ? value[0] : value;
  return v === "retake" ? "retake" : "standard";
}

/** `/start` with the mode and class code as query parameters (the shareable form). */
export function startLocation(mode: StartMode, classCode: string) {
  const query: Record<string, string> = {};
  if (classCode) query.class = classCode;
  if (mode === "retake") query.mode = "retake";
  return { path: "/start", query };
}

/** `attempts.startInfo`: the time limit with the class multiplier, and whether a retake can start. */
export type StartInfo = { minutes: number; timeMultiplier: number; retake: boolean };

/**
 * Which `attempts.startInfo` call describes the form, or `null` when none can
 * (a code that is incomplete, unknown, closed or still being checked): no code
 * means the default exam; a found class means that class.
 */
export function startInfoArgs(code: string, state: ClassCodeState): { classCode?: string } | null {
  if (state.kind === "none" || !code) return {};
  if (state.kind === "found") return { classCode: code };
  return null;
}

/** "135" or "112.5" (a 1.25× class on a 90-minute exam). */
export function formatMinutes(minutes: number): string {
  return Number.isInteger(minutes) ? String(minutes) : String(Math.round(minutes * 10) / 10);
}

export interface StartBody {
  anonToken: string;
  displayName?: string;
  classCode?: string;
  mode?: StartMode;
}

/** JSON body for `POST /api/attempts/start`; empty fields are left out. */
export function buildStartBody(input: {
  anonToken: string;
  displayName: string;
  classCode: string;
  mode?: StartMode;
}): StartBody {
  const body: StartBody = { anonToken: input.anonToken };
  const name = input.displayName.trim();
  if (name) body.displayName = name;
  if (input.classCode) body.classCode = input.classCode;
  if (input.mode && input.mode !== "standard") body.mode = input.mode;
  return body;
}

export interface StartSuccess {
  attemptId: string;
  deadline: number;
  serverNow: number;
}

/** The 200 body, or `null` if it isn't the documented shape. */
export function parseStartSuccess(data: unknown): StartSuccess | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (typeof d.attemptId !== "string" || d.attemptId.length === 0) return null;
  if (typeof d.deadline !== "number" || !Number.isFinite(d.deadline)) return null;
  if (typeof d.serverNow !== "number" || !Number.isFinite(d.serverNow)) return null;
  return { attemptId: d.attemptId, deadline: d.deadline, serverNow: d.serverNow };
}

/** `{ code, retryAfter }` from an error body; `code` is `null` if missing. */
export function parseStartError(data: unknown): {
  code: string | null;
  retryAfterMs: number | null;
} {
  if (!data || typeof data !== "object") return { code: null, retryAfterMs: null };
  const d = data as Record<string, unknown>;
  const code = typeof d.code === "string" ? d.code : null;
  const retry = typeof d.retryAfter === "number" && d.retryAfter >= 0 ? d.retryAfter : null;
  return { code, retryAfterMs: retry };
}

/** Milliseconds from a `Retry-After` header (seconds), `null` if absent or bad. */
export function retryAfterHeaderMs(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n * 1000 : null;
}

/** "Try again in 3 minutes." from milliseconds (rounded up). */
export function retryAfterText(ms: number | null): string {
  if (ms == null || ms <= 0) return "Try again shortly.";
  const seconds = Math.ceil(ms / 1000);
  if (seconds < 60) return `Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
  const minutes = Math.ceil(seconds / 60);
  return `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

export type StartErrorField = "displayName" | "classCode" | null;

/** `attempts.start` refuses a retake while the version's PBQ set B is incomplete (PB-4). */
export const RETAKE_UNAVAILABLE =
  "The PBQ retake isn't available for this exam yet. You can sit the standard exam instead.";

/**
 * Friendly message for a start-route error code. `field` says which input
 * the message belongs to (`null`: show it above the Start button). `code` is
 * `null` for a network failure or an unreadable response.
 */
export function startErrorMessage(
  code: string | null,
  opts: { retryAfterMs?: number | null; network?: boolean; mode?: StartMode } = {},
): { field: StartErrorField; message: string } {
  if (opts.network) {
    return {
      field: null,
      message: "We couldn't reach Salus. Check your connection and try again.",
    };
  }
  switch (code) {
    case "RATE_LIMITED":
      return {
        field: null,
        message: `Too many exams have been started from this network. ${retryAfterText(opts.retryAfterMs ?? null)}`,
      };
    case "CLASS_UNKNOWN":
      return { field: "classCode", message: "Class not found. Check the code with your tutor." };
    case "CLASS_CLOSED":
      return {
        field: "classCode",
        message: "This class is closed and isn't accepting new attempts. Ask your tutor.",
      };
    case "VALIDATION_FAILED":
      return {
        field: "displayName",
        message: `Enter a display name of 1 to ${START_DISPLAY_NAME_MAX} characters to join a class.`,
      };
    case "BAD_TOKEN":
      return {
        field: null,
        message: "This browser's anonymous ID isn't valid. Reload the page and try again.",
      };
    case "NOT_FOUND":
      if (opts.mode === "retake") return { field: null, message: RETAKE_UNAVAILABLE };
      return {
        field: null,
        message: "There's no exam to sit yet. Try again later, or ask your tutor.",
      };
    case "BAD_REQUEST":
    case "CROSS_ORIGIN":
    case "PAYLOAD_TOO_LARGE":
    case "UNSUPPORTED_MEDIA_TYPE":
      return {
        field: null,
        message: "Something went wrong sending the request. Reload the page and try again.",
      };
    default:
      return {
        field: null,
        message: "We couldn't start the exam just now. Try again in a moment.",
      };
  }
}

/** Minimal shape of a `review.myAttempts` row used here. */
export interface AttemptSummaryLike {
  attemptId: string;
  mode: StartMode;
  status: "in_progress" | "submitted" | "expired";
  startedAt: number;
  deadline: number;
  submittedAt?: number;
  scaled?: number;
  passed?: boolean;
}

/** The newest attempt that is still running (deadline not passed), if any. */
export function resumableAttempt<T extends AttemptSummaryLike>(
  attempts: readonly T[],
  now: number,
): T | null {
  return attempts.find((a) => a.status === "in_progress" && a.deadline > now) ?? null;
}

/** The newest submitted attempt with a score, if any. */
export function lastMarkedAttempt<T extends AttemptSummaryLike>(attempts: readonly T[]): T | null {
  return attempts.find((a) => a.status === "submitted" && a.scaled !== undefined) ?? null;
}

/** "814 · Pass" / "702 · Below 750" for the landing badge. */
export function scoreBadgeText(a: AttemptSummaryLike, passScaled: number = EXAM_FACTS.passScaled) {
  if (a.scaled === undefined) return "";
  return `${a.scaled} · ${a.passed ? "Pass" : `Below ${passScaled}`}`;
}

/** "7 Nov" (same year) or "7 Nov 2025". */
export function shortDate(ms: number, now: number = Date.now()): string {
  const d = new Date(ms);
  const sameYear = d.getFullYear() === new Date(now).getFullYear();
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** `?class=` from the route query (first value, normalised), or `""`. */
export function classCodeFromQuery(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  if (typeof v !== "string") return "";
  return normaliseClassCodeInput(v.slice(0, CLASS_CODE_INPUT_MAX));
}
