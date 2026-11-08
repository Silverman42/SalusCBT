/**
 * Pure helpers for the tutor attempt review page (T-506, LLD §14.1
 * `/tutor/attempts/[id]`, PRD CL-7): the header wording, the link back to the
 * class and the load / not-found states of `classes.attemptResult` and
 * `classes.attemptReview`.
 */
import { isSessionError } from "./admin";
import { modeLabel } from "./attemptPages";
import { errorCodeOf } from "./attemptSync";
import { attemptName, relativeTime } from "./tutor";

/** The fields of a `classes.attemptResult` view these helpers read. */
export interface AttemptHeaderLike {
  displayName: string;
  className: string;
  examTitle: string;
  mode: "standard" | "retake";
  submittedAt: number;
  submittedBy: "student" | "timer";
}

/** The class dashboard an attempt belongs to (T-505). */
export function classPath(classId: string): string {
  return `/tutor/classes/${encodeURIComponent(classId)}`;
}

/** The back link: to the class when it is known, else the class list. */
export function attemptBackLink(view: { classId: string; className: string } | null | undefined): {
  to: string;
  label: string;
} {
  if (!view) return { to: "/tutor", label: "All classes" };
  return { to: classPath(view.classId), label: view.className.trim() || "Class" };
}

/** The page heading: the student's name ("Unnamed student" for old attempts). */
export function attemptHeading(view: Pick<AttemptHeaderLike, "displayName">): string {
  return attemptName(view);
}

/**
 * The line under the heading: "Security+ SY0-701 · Standard · Submitted 5 min
 * ago", ending "· time ran out" when the timer submitted it.
 */
export function attemptMetaLine(view: AttemptHeaderLike, now: number, timeZone?: string): string {
  const at = relativeTime(view.submittedAt, now, timeZone);
  const when = `Submitted ${at === "Just now" ? "just now" : at}`;
  const parts = [view.examTitle, modeLabel(view.mode), when];
  if (view.submittedBy === "timer") parts.push("time ran out");
  return parts.join(" · ");
}

/** Browser tab title: "Maya Chen · Cyber Ops evening" (the layout adds "· Tutor · Salus"). */
export function attemptPageTitle(view: AttemptHeaderLike | null | undefined): string {
  if (!view) return "Attempt review";
  return `${attemptHeading(view)} · ${view.className.trim() || "Class"}`;
}

export type AttemptLoadState = "loading" | "ready" | "not_found" | "session" | "error";

/**
 * What the page shows. `NOT_FOUND` (another tutor's class, an unfinished or
 * classless attempt, a deleted one) and a malformed id in the URL (Convex's
 * argument validator rejects it) both read as "not found".
 */
export function attemptLoadState(
  errors: readonly (Error | null | undefined)[],
  ready: boolean,
): AttemptLoadState {
  const errs = errors.filter((e): e is Error => !!e);
  if (errs.some(isSessionError)) return "session";
  if (errs.some(isNotFound)) return "not_found";
  if (errs.length > 0) return "error";
  return ready ? "ready" : "loading";
}

function isNotFound(err: Error): boolean {
  if (errorCodeOf(err) === "NOT_FOUND") return true;
  const message = typeof err.message === "string" ? err.message : "";
  return /ArgumentValidationError|does not match validator/i.test(message);
}

export const ATTEMPT_LOAD_TEXT: Record<
  Exclude<AttemptLoadState, "loading" | "ready">,
  { title: string; body: string }
> = {
  not_found: {
    title: "Attempt not found",
    body: "This attempt doesn't exist, was deleted, isn't finished yet, or isn't in one of your classes.",
  },
  session: {
    title: "Session ended",
    body: "Your session has ended. Sign in again to continue.",
  },
  error: {
    title: "Couldn't load this attempt",
    body: "Something went wrong. Check your connection and try again.",
  },
};
