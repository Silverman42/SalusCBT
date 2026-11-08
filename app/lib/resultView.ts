/**
 * Pure helpers for showing a result and its review (EX-14–EX-18, CL-9).
 * Shared by the share page (`/r/[publicId]`, T-504) and the student result
 * and review pages (T-215, T-216). No Vue, no Convex client.
 */
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import type { AnswerValue, PbqPart } from "../../shared/content";
import { partMarks, ruleMarks } from "./pbq/review";

/** What `shareLinks.view` returns for a live link. */
export type SharedView = NonNullable<FunctionReturnType<typeof api.shareLinks.view>>;
/** A result as the summary card shows it (`review.getResult` also fits: it adds `attemptId`). */
export type ResultSummaryData = SharedView["result"];
export type ReviewEntry = SharedView["review"][number];
export type Domain = ResultSummaryData["result"]["domains"][number]["domain"];

/** SY0-701 domain names (content/seed `domains`). */
export const DOMAIN_NAMES: Record<Domain, string> = {
  "1.0": "General Security Concepts",
  "2.0": "Threats, Vulnerabilities and Mitigations",
  "3.0": "Security Architecture",
  "4.0": "Security Operations",
  "5.0": "Security Program Management and Oversight",
};

export function domainLabel(domain: Domain): string {
  return `${domain} ${DOMAIN_NAMES[domain]}`;
}

/** `newPublicId()` in convex/lib/codes.ts: 22 base64url characters. */
export const PUBLIC_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

export function isPublicId(value: unknown): value is string {
  return typeof value === "string" && PUBLIC_ID_PATTERN.test(value);
}

/** The share page URL for a link, e.g. `https://salus.example/r/AbC…`. */
export function shareUrl(origin: string, publicId: string): string {
  return `${origin.replace(/\/+$/, "")}/r/${publicId}`;
}

export type DomainRow = {
  domain: Domain;
  label: string;
  points: number;
  max: number;
  /** Whole percent, 0–100. */
  pct: number;
  /** Under the exam's domain target (81 %): highlighted as a weak domain (EX-15). */
  low: boolean;
};

/** One row per domain, in domain order. */
export function domainRows(view: ResultSummaryData): DomainRow[] {
  return [...view.result.domains]
    .sort((a, b) => a.domain.localeCompare(b.domain))
    .map((d) => {
      const ratio = d.max > 0 ? d.points / d.max : 0;
      return {
        domain: d.domain,
        label: domainLabel(d.domain),
        points: d.points,
        max: d.max,
        pct: Math.round(ratio * 100),
        low: ratio < view.domainTarget,
      };
    });
}

/**
 * The fewest points that reach the pass line, from the scaled formula
 * `round(100 + 800 · points / total)` (LLD §8.2). 750 of 102 → 83.
 */
export function passPoints(view: ResultSummaryData): number {
  const total = view.result.totalPoints;
  for (let p = 0; p <= total; p++) {
    if (Math.round(100 + (800 * p) / total) >= view.passScaled) return p;
  }
  return total;
}

/** `h:mm:ss` (or `m:ss` under an hour). */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

/** "7 Nov 2026", in UTC so the server render and the browser agree. */
export function formatDate(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(ms));
}

export type ReviewStatus = "correct" | "partial" | "wrong";

export function reviewStatus(item: Pick<ReviewEntry, "earned" | "max">): ReviewStatus {
  if (item.max > 0 && item.earned >= item.max) return "correct";
  return item.earned > 0 ? "partial" : "wrong";
}

export type ReviewFilter = "all" | "wrong" | "flagged";

/** EX-18 filters: "Wrong" is anything short of full marks. */
export function filterReview<T extends Pick<ReviewEntry, "earned" | "max" | "flagged">>(
  items: readonly T[],
  filter: ReviewFilter,
): T[] {
  if (filter === "wrong") return items.filter((i) => reviewStatus(i) !== "correct");
  if (filter === "flagged") return items.filter((i) => i.flagged);
  return [...items];
}

/** Domain filter value: one domain, or every domain. */
export type DomainFilter = Domain | "all";

/** EX-18: the status filter and the domain filter combine (both must match). */
export function queryReview<T extends Pick<ReviewEntry, "earned" | "max" | "flagged" | "domain">>(
  items: readonly T[],
  filter: ReviewFilter,
  domain: DomainFilter,
): T[] {
  const inDomain = domain === "all" ? items : items.filter((i) => i.domain === domain);
  return filterReview(inDomain, filter);
}

/** `?filter=` from the review page URL; anything unknown is "all". */
export function parseReviewFilter(value: unknown): ReviewFilter {
  return value === "wrong" || value === "flagged" ? value : "all";
}

/** `?domain=` from the review page URL; anything unknown is "all". */
export function parseDomainFilter(value: unknown): DomainFilter {
  return typeof value === "string" && Object.hasOwn(DOMAIN_NAMES, value)
    ? (value as Domain)
    : "all";
}

/** The domains present in a review, in domain order, with how many questions each has. */
export function reviewDomains(
  items: readonly Pick<ReviewEntry, "domain">[],
): { domain: Domain; label: string; count: number }[] {
  const counts = new Map<Domain, number>();
  for (const i of items) counts.set(i.domain, (counts.get(i.domain) ?? 0) + 1);
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, count]) => ({ domain, label: domainLabel(domain), count }));
}

/** "Q26" for MCQs, "PBQ 3" / "PBQ B3" for PBQs. */
export function questionLabel(item: Pick<ReviewEntry, "kind" | "displayNumber">): string {
  return item.kind === "mcq" ? `Q${item.displayNumber}` : `PBQ ${item.displayNumber}`;
}

/** Option ids picked in an MCQ answer (empty when unanswered or another shape). */
export function pickedOptionIds(answer: AnswerValue | null): string[] {
  return answer?.kind === "mcq" ? answer.optionIds : [];
}

/** An answer's value for one PBQ part, as text ("—" when blank). */
export function partAnswerText(answer: AnswerValue | null, partId: string): string {
  if (answer?.kind !== "pbq") return "—";
  const v = answer.parts[partId];
  const text = Array.isArray(v) ? v.filter((x) => x.trim() !== "").join(", ") : (v ?? "");
  return text.trim() === "" ? "—" : text;
}

export type PartRow = {
  id: string;
  prompt: string;
  yours: string;
  /** The key (or, for a practice part, the model answer). */
  correct: string;
  /** `null` for practice parts. */
  ok: boolean | null;
};

type PbqEntry = Extract<ReviewEntry, { kind: "pbq" }>;

/**
 * One row per PBQ part (or firewall rule), with "yours", "correct" and the
 * mark: the stacked-card fallback when a template has no review component.
 */
export function partRows(item: PbqEntry): PartRow[] {
  const payload = item.payload;
  if (payload.template === "firewall") {
    const marks = ruleMarks(item);
    return payload.rules.map((r, i) => ({
      id: String(i + 1),
      prompt: `${r.source} → ${r.destination} (${r.protocol})`,
      yours: marks[i]!.yours,
      correct: marks[i]!.correct,
      ok: marks[i]!.ok,
    }));
  }
  const marks = partMarks(item);
  const parts: PbqPart[] = payload.parts;
  return parts.map((part) => {
    const m = marks.get(part.id)!;
    return { id: part.id, prompt: part.prompt, yours: m.yours, correct: m.correct, ok: m.ok };
  });
}
