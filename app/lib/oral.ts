/**
 * Pure helpers for `/oral` (PRD CL-10; LLD §5.1 `content.oralQuestions`):
 * stepping through the questions, keyboard shortcuts, version labels and
 * error wording.
 */
import { errorCodeOf } from "./attemptSync";

/** `index + delta`, kept inside `0 … total - 1` (0 when there are none). */
export function stepIndex(index: number, delta: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(total - 1, Math.max(0, index + delta));
}

export type OralKeyAction = "prev" | "next" | "toggle" | null;

/**
 * What a key press on the page does: ← / → move, "a" shows or hides the
 * model answer. Ignored while typing in a field, with a modifier held, or
 * on a control that uses the key itself (a select).
 */
export function oralKeyAction(e: {
  key: string;
  altKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  target?: EventTarget | null;
}): OralKeyAction {
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  const el = e.target as { tagName?: unknown; isContentEditable?: unknown } | null | undefined;
  const tag = typeof el?.tagName === "string" ? el.tagName.toUpperCase() : "";
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable === true)
    return null;
  if (e.key === "ArrowLeft") return "prev";
  if (e.key === "ArrowRight") return "next";
  if (e.key === "a" || e.key === "A") return "toggle";
  return null;
}

export interface OralVersionLike {
  versionNo: number;
  label: string;
  status: "draft" | "published" | "archived";
  isDefault: boolean;
}

/** "Default · v1 · Security+ SY0-701", "Custom · v2 · Week 3 (draft)". */
export function oralVersionLabel(v: OralVersionLike): string {
  const line = v.isDefault ? "Default" : "Custom";
  const status = v.status === "published" ? "" : ` (${v.status})`;
  return `${line} · v${v.versionNo} · ${v.label}${status}`;
}

/** A message for a failed `content.oralQuestions` call. */
export function oralErrorMessage(err: unknown): string {
  switch (errorCodeOf(err)) {
    case "NOT_FOUND":
      return "That exam version isn't available to you. Pick another version.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "Your session has ended. Sign in again to continue.";
  }
  return "Couldn't load the oral questions. Check your connection and try again.";
}
