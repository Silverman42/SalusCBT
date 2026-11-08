/**
 * Pure helpers for the student history page (T-217, PRD EX-19, EX-20, LLD §4):
 * row formatting, the "load more" pager over `review.myAttempts`, and the
 * import confirmation text. No Vue, no Convex client.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import { examPath, modeLabel, resultPath, reviewPath } from "./attemptPages";
import { formatDate } from "./resultView";

export type AttemptSummary = FunctionReturnType<typeof api.review.myAttempts>["page"][number];
type Page = Pick<
  FunctionReturnType<typeof api.review.myAttempts>,
  "page" | "isDone" | "continueCursor"
>;

/** Rows per `myAttempts` call (the server allows 1–100). */
export const HISTORY_PAGE_SIZE = 20;

/**
 * The SY0-701 pass line. `myAttempts` returns `passed` but not the exam's
 * threshold, so the "Below 750" badge (mockup screen 06) uses this.
 */
export const DEFAULT_PASS_SCALED = 750;

export type RowTone = "ok" | "bad" | "brand" | "muted";

export type HistoryRow = {
  attemptId: string;
  /** "7 Nov 2026 · Standard". */
  title: string;
  /** "814", or null while there is no score. */
  score: string | null;
  /** "91 / 102 points". */
  points: string | null;
  badge: { label: string; tone: RowTone };
  /** Links the row offers, in order. */
  links: { label: string; to: string; icon: string; primary?: boolean }[];
};

/** One history row. `now` decides whether an in-progress attempt can still be resumed. */
export function historyRow(a: AttemptSummary, now: number): HistoryRow {
  const id = a.attemptId as string;
  const title = `${formatDate(a.submittedAt ?? a.startedAt)} · ${modeLabel(a.mode)}`;
  if (a.status === "submitted" && a.scaled !== undefined) {
    return {
      attemptId: id,
      title,
      score: String(a.scaled),
      points:
        a.points !== undefined && a.totalPoints !== undefined
          ? `${a.points} / ${a.totalPoints} points`
          : null,
      badge: a.passed
        ? { label: "Pass", tone: "ok" }
        : { label: `Below ${DEFAULT_PASS_SCALED}`, tone: "bad" },
      links: [
        { label: "Result", to: resultPath(id), icon: "i-lucide-chart-column", primary: true },
        { label: "Review", to: reviewPath(id), icon: "i-lucide-book-open" },
      ],
    };
  }
  if (a.status === "in_progress" && a.deadline > now) {
    return {
      attemptId: id,
      title,
      score: null,
      points: null,
      badge: { label: "In progress", tone: "brand" },
      links: [{ label: "Resume", to: examPath(id), icon: "i-lucide-play", primary: true }],
    };
  }
  if (a.status === "in_progress") {
    // Past the deadline: the server's auto-submit is about to mark it.
    return {
      attemptId: id,
      title,
      score: null,
      points: null,
      badge: { label: "Time's up", tone: "muted" },
      links: [{ label: "Open", to: examPath(id), icon: "i-lucide-arrow-right" }],
    };
  }
  return {
    attemptId: id,
    title,
    score: null,
    points: null,
    badge: { label: "No result", tone: "muted" },
    links: [],
  };
}

export type Pager = {
  items: AttemptSummary[];
  /** Cursor for the next page; null before the first page. */
  cursor: string | null;
  isDone: boolean;
  loading: boolean;
  error: string | null;
};

export function emptyPager(): Pager {
  return { items: [], cursor: null, isDone: false, loading: false, error: null };
}

/** Append a page, skipping attempts already listed (a new attempt can shift the pages). */
export function appendPage(p: Pager, page: Page): Pager {
  const seen = new Set(p.items.map((i) => i.attemptId));
  return {
    items: [...p.items, ...page.page.filter((i) => !seen.has(i.attemptId))],
    cursor: page.continueCursor,
    isDone: page.isDone,
    loading: false,
    error: null,
  };
}

export const canLoadMore = (p: Pager) => !p.isDone && !p.loading && p.error === null;

/** Message for a failed `myAttempts` call, by error code. */
export function historyErrorMessage(code: string | null): string {
  switch (code) {
    case "BAD_TOKEN":
      return "This browser's anonymous ID isn't valid. Import your progress file to restore your history.";
    case "RATE_LIMITED":
      return "Too many requests. Wait a minute, then try again.";
    default:
      return "We couldn't load your history. Check your connection, then try again.";
  }
}

/** When the import file holds the ID this browser already uses. */
export const IMPORT_SAME_ID =
  "This file holds the anonymous ID this browser already uses, so there's nothing to import.";

/** Body of the "replace progress?" dialog for a valid import preview. */
export function importConfirmText(preview: { displayName?: string; exportedAt?: string }): string {
  const from: string[] = [];
  if (preview.displayName) from.push(`name "${preview.displayName}"`);
  const exported = preview.exportedAt ? Date.parse(preview.exportedAt) : NaN;
  if (!Number.isNaN(exported)) from.push(`exported ${formatDate(exported)}`);
  const source = from.length ? ` (${from.join(", ")})` : "";
  return (
    `This replaces the anonymous ID in this browser with the one in the file${source}. ` +
    "The history shown here now will be hidden: export it first if you want to keep it."
  );
}
