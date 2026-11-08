/**
 * Load states shared by the student result and review pages (T-215, T-216;
 * LLD §14.1). Pure: no Vue, no Convex client.
 *
 * `review.getResult` / `getReview` answer `NOT_FOUND` for a missing, foreign,
 * in-progress or expired attempt alike (SE-3). The pages then ask
 * `attempts.getState` (which does answer for the owner's in-progress attempt)
 * so an unfinished exam can offer "Return to exam" instead of a dead end.
 */
import { errorCodeOf, type AttemptStatus } from "./attemptSync";

export type LoadFailure = "not_found" | "in_progress" | "expired" | "bad_token" | "network";

/**
 * The error code of a failed query. A malformed attempt id fails Convex's
 * argument validator (a plain error, no code): to the student that is the
 * same as a link that leads nowhere, so it maps to `NOT_FOUND`.
 */
export function loadErrorCode(err: unknown): string {
  const code = errorCodeOf(err);
  if (code) return code;
  const message = err instanceof Error ? err.message : typeof err === "string" ? err : "";
  if (/ArgumentValidationError|does not match validator|Invalid argument/i.test(message)) {
    return "NOT_FOUND";
  }
  return "NETWORK";
}

/** Failure for a `getResult` / `getReview` error code (before the status check). */
export function failureOf(code: string): LoadFailure {
  switch (code) {
    case "NOT_FOUND":
      return "not_found";
    case "BAD_TOKEN":
      return "bad_token";
    default:
      return "network";
  }
}

/** Refine `not_found` with the status `attempts.getState` reported (null if it failed too). */
export function failureForStatus(status: AttemptStatus | null): LoadFailure {
  if (status === "in_progress") return "in_progress";
  if (status === "expired") return "expired";
  return "not_found";
}

export const LOAD_FAILURES: Record<LoadFailure, { title: string; body: string; icon: string }> = {
  not_found: {
    title: "We couldn't find that result",
    body: "The link may be wrong, or the exam was taken in another browser. Import your progress file on the history page to see results from another device.",
    icon: "i-lucide-search-x",
  },
  in_progress: {
    title: "This exam isn't finished yet",
    body: "Your result appears here as soon as you submit, or when the time runs out.",
    icon: "i-lucide-hourglass",
  },
  expired: {
    title: "This exam ended without a result",
    body: "The attempt closed before it could be marked. Start a new mock exam from the home page.",
    icon: "i-lucide-clock-alert",
  },
  bad_token: {
    title: "This browser's anonymous ID isn't valid",
    body: "Import your progress file on the history page, or start a new exam from the home page.",
    icon: "i-lucide-key-round",
  },
  network: {
    title: "We couldn't load your result",
    body: "Check your connection, then try again.",
    icon: "i-lucide-cloud-off",
  },
};

export const resultPath = (attemptId: string) => `/exam/${encodeURIComponent(attemptId)}/result`;
export const reviewPath = (attemptId: string) => `/exam/${encodeURIComponent(attemptId)}/review`;
export const examPath = (attemptId: string) => `/exam/${encodeURIComponent(attemptId)}`;

/** "Standard" or "Retake (PBQ set B)". */
export function modeLabel(mode: "standard" | "retake"): string {
  return mode === "retake" ? "Retake (PBQ set B)" : "Standard";
}

/**
 * "Retake with PBQ set B" (PB-4, T-307): the start screen in retake mode. It
 * checks that the retake is available (`attempts.startInfo`) before the
 * student can start.
 */
export const RETAKE_START_PATH = "/start?mode=retake";
