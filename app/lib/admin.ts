/**
 * Pure helpers for the admin area (LLD §14.1, §12.2; PRD AU-5, AU-7, PR-5):
 * status badges, invitation state, audit wording, dates and error messages.
 * Wording follows mockup screen 10 ("Admin").
 */
import { errorCodeOf } from "./attemptSync";

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** `admin.deleteAttempts` takes at most this many ids per call (MAX_DELETE_ATTEMPTS). */
export const MAX_DELETE_ATTEMPTS = 100;

// ---------------------------------------------------------------- badges

/** Soft badge colours, as the mockup's `{ bg, fg }` pairs. */
export type BadgeTone = "ok" | "brand" | "warn" | "bad" | "muted";

export interface Badge {
  label: string;
  tone: BadgeTone;
}

/** Tailwind classes for each tone (mockup tokens; they follow the theme). */
export const BADGE_CLASSES: Record<BadgeTone, string> = {
  ok: "bg-ok-soft text-ok",
  brand: "bg-brand-soft text-brand-ink",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
  muted: "bg-surface-2 text-muted-fg",
};

export type TutorStatus = "active" | "removed";

export function tutorStatusBadge(status: TutorStatus): Badge {
  return status === "active"
    ? { label: "Active", tone: "ok" }
    : { label: "Removed", tone: "muted" };
}

// ----------------------------------------------------------- invitations

export type InvitationStatus = "pending" | "accepted" | "cancelled" | "expired";

export interface InvitationLike {
  status: InvitationStatus;
  expiresAt: number;
}

/**
 * The status to show: a pending invitation past `expiresAt` is already
 * unusable, even before the daily `expireInvitations` cron marks it.
 */
export function effectiveInvitationStatus(inv: InvitationLike, now: number): InvitationStatus {
  return inv.status === "pending" && inv.expiresAt <= now ? "expired" : inv.status;
}

export function invitationStatusBadge(status: InvitationStatus): Badge {
  switch (status) {
    case "pending":
      return { label: "Pending", tone: "brand" };
    case "accepted":
      return { label: "Accepted", tone: "ok" };
    case "expired":
      return { label: "Expired", tone: "warn" };
    case "cancelled":
      return { label: "Cancelled", tone: "muted" };
  }
}

/** Resend and cancel work on pending and expired invitations (as the server allows). */
export function invitationActions(inv: InvitationLike): { resend: boolean; cancel: boolean } {
  const open = inv.status === "pending" || inv.status === "expired";
  return { resend: open, cancel: open };
}

/** Pending or expired, i.e. still waiting for the tutor (the "Pending invitations" card). */
export function isOpenInvitation(inv: InvitationLike): boolean {
  return inv.status === "pending" || inv.status === "expired";
}

/** "Expires in 6 days", "Expires in 5 hours", "Expires in under an hour", "Expired". */
export function expiryLabel(expiresAt: number, now: number): string {
  const left = expiresAt - now;
  if (left <= 0) return "Expired";
  if (left < HOUR_MS) return "Expires in under an hour";
  if (left < DAY_MS) {
    const hours = Math.floor(left / HOUR_MS);
    return `Expires in ${hours} ${hours === 1 ? "hour" : "hours"}`;
  }
  const days = Math.round(left / DAY_MS);
  return `Expires in ${days} ${days === 1 ? "day" : "days"}`;
}

// ----------------------------------------------------------------- dates

/** Calendar day number of `at` in `timeZone` (local time when omitted). */
function dayNumber(at: number, timeZone?: string): number {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(at);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return Date.UTC(get("year"), get("month") - 1, get("day")) / DAY_MS;
}

/** "7 Nov", or "7 Nov 2025" outside the current year. */
export function formatDate(at: number, now: number, timeZone?: string): string {
  const year = (t: number) =>
    new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric" }).format(t);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    day: "numeric",
    month: "short",
    ...(year(at) === year(now) ? {} : { year: "numeric" }),
  }).format(at);
}

/** Mockup audit times: "Today · 09:14", "Yesterday · 17:30", "4 Nov · 11:20". */
export function formatWhen(at: number, now: number, timeZone?: string): string {
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(at);
  const days = dayNumber(now, timeZone) - dayNumber(at, timeZone);
  const day = days === 0 ? "Today" : days === 1 ? "Yesterday" : formatDate(at, now, timeZone);
  return `${day} · ${time}`;
}

// ------------------------------------------------------------------ people

/** Two-letter avatar initials from a name, else from the email's local part. */
export function initials(name: string | null, email: string): string {
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0]![0]! + words[words.length - 1]![0]!).toUpperCase();
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  const local = email.split("@")[0] ?? "";
  const letters = local.replace(/[^a-z0-9]/gi, "");
  return (letters.slice(0, 2) || "?").toUpperCase();
}

/** The name to show for a person: their name, else their email. */
export function displayName(name: string | null, email: string): string {
  return name?.trim() || email;
}

/** "f***@kano-sec.ng", as the mockup shows emails in failed-code events. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@");
  if (at <= 0) return email;
  return `${email[0]}***${email.slice(at)}`;
}

// ------------------------------------------------------------------- audit

export type AuditTone = "brand" | "warn" | "bad";

/** Icon tile colours per tone (mockup `A(…, tone)`: p, w, b). */
export const AUDIT_TONE_CLASSES: Record<AuditTone, string> = {
  brand: "bg-brand-soft text-brand-ink",
  warn: "bg-warn-soft text-warn",
  bad: "bg-bad-soft text-bad",
};

export interface AuditRowLike {
  action: string;
  actorEmail: string | null;
  target: string | null;
  meta: unknown;
}

export interface AuditView {
  icon: string;
  tone: AuditTone;
  text: string;
}

function metaField(meta: unknown, key: string): unknown {
  return meta && typeof meta === "object" ? (meta as Record<string, unknown>)[key] : undefined;
}

/** Better Auth codes in `auth.otp_failed` meta → wording. */
const OTP_FAILURE_TEXT: Record<string, string> = {
  INVALID_OTP: "Wrong code",
  OTP_EXPIRED: "Expired code",
  TOO_MANY_ATTEMPTS: "Too many wrong codes",
  ACCOUNT_INACTIVE: "Sign-in refused (removed account)",
};

/** One audit row as an icon, tone and sentence (LLD §12.2 event names). */
export function describeAudit(row: AuditRowLike): AuditView {
  const actor = row.actorEmail ?? "System";
  const target = row.target ?? "unknown";
  switch (row.action) {
    case "invite.created":
      return { icon: "i-lucide-send", tone: "brand", text: `Invitation sent to ${target}` };
    case "invite.resent":
      return { icon: "i-lucide-send", tone: "brand", text: `Invitation resent to ${target}` };
    case "invite.cancelled":
      return {
        icon: "i-lucide-mail-x",
        tone: "warn",
        text:
          metaField(row.meta, "reason") === "superseded"
            ? `Invitation to ${target} replaced by a new one`
            : `Invitation to ${target} cancelled`,
      };
    case "invite.accepted":
      return { icon: "i-lucide-user-check", tone: "brand", text: `${target} accepted invitation` };
    case "auth.otp_requested":
      return { icon: "i-lucide-mail", tone: "brand", text: `Sign-in code sent to ${target}` };
    case "auth.otp_failed": {
      const reason = metaField(row.meta, "reason");
      const what = (typeof reason === "string" && OTP_FAILURE_TEXT[reason]) || "Failed code";
      const who = row.target ? maskEmail(row.target) : "unknown email";
      return { icon: "i-lucide-triangle-alert", tone: "warn", text: `${what} for ${who}` };
    }
    case "auth.signin":
      return { icon: "i-lucide-log-in", tone: "brand", text: `${actor} signed in` };
    case "auth.signout":
      return { icon: "i-lucide-log-out", tone: "brand", text: `${actor} signed out` };
    case "tutor.removed":
      return { icon: "i-lucide-user-x", tone: "bad", text: `${target} removed · sessions ended` };
    case "tutor.restored":
      return { icon: "i-lucide-user-check", tone: "brand", text: `${target} restored` };
    case "class.created": {
      const code = metaField(row.meta, "code");
      const which = typeof code === "string" ? `class ${code}` : "a class";
      return { icon: "i-lucide-users", tone: "brand", text: `${actor} created ${which}` };
    }
    case "class.closed":
      return { icon: "i-lucide-lock", tone: "warn", text: `${actor} closed a class` };
    case "attempt.deleted": {
      const count = metaField(row.meta, "count");
      const n = typeof count === "number" ? count : 0;
      const what = n === 1 ? "1 attempt" : n > 0 ? `${n} attempts` : "attempts";
      return { icon: "i-lucide-trash-2", tone: "bad", text: `${actor} deleted ${what}` };
    }
    case "version.published": {
      const no = metaField(row.meta, "versionNo");
      const which = typeof no === "number" ? `Exam version ${no}` : "An exam version";
      const by = metaField(row.meta, "source") === "seed" ? "by the seed import" : `by ${actor}`;
      return { icon: "i-lucide-layers", tone: "brand", text: `${which} published ${by}` };
    }
    case "exam.default_changed":
      return { icon: "i-lucide-layers", tone: "brand", text: "Default exam version changed" };
    default:
      return { icon: "i-lucide-activity", tone: "brand", text: row.action };
  }
}

// ---------------------------------------------------------------- attempts

/** Convex document ids: lower-case base32, about 32 characters. */
const ATTEMPT_ID = /^[0-9a-z]{25,40}$/;

export interface ParsedAttemptIds {
  ids: string[];
  invalid: string[];
}

/**
 * Attempt ids from pasted text: ids or links such as `…/exam/<id>/result`,
 * separated by spaces, commas or new lines. Duplicates are dropped.
 */
export function parseAttemptIds(text: string): ParsedAttemptIds {
  const ids: string[] = [];
  const invalid: string[] = [];
  for (const token of text.split(/[\s,;]+/).filter(Boolean)) {
    const fromLink = /\/exam\/([^/?#]+)/.exec(token)?.[1];
    const id = fromLink ?? token;
    if (ATTEMPT_ID.test(id)) {
      if (!ids.includes(id)) ids.push(id);
    } else if (!invalid.includes(token)) {
      invalid.push(token);
    }
  }
  return { ids, invalid };
}

/** "Deleted 2 attempts." plus how many were already gone. */
export function deletedMessage(requested: number, deleted: number): string {
  const what = deleted === 1 ? "1 attempt" : `${deleted} attempts`;
  const gone = requested - deleted;
  if (gone <= 0) return `Deleted ${what}.`;
  return `Deleted ${what}. ${gone === 1 ? "1 was" : `${gone} were`} already gone or not found.`;
}

// ------------------------------------------------------------------ errors

/** Which admin call failed, for wording a `VALIDATION_FAILED`. */
export type AdminAction =
  "invite" | "resend" | "cancel" | "remove" | "restore" | "deleteAttempts" | "load";

function errorData(err: unknown): Record<string, unknown> {
  if (!err || typeof err !== "object" || !("data" in err)) return {};
  const data: unknown = (err as { data: unknown }).data;
  return data && typeof data === "object" ? (data as Record<string, unknown>) : {};
}

/** "3 minutes", "2 hours" from a retry delay in milliseconds. */
export function retryWording(ms: number): string {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  if (minutes < 60) return minutes === 1 ? "1 minute" : `${minutes} minutes`;
  const hours = Math.ceil(minutes / 60);
  return hours === 1 ? "1 hour" : `${hours} hours`;
}

/** True when the error means the admin's session has ended or lost its role. */
export function isSessionError(err: unknown): boolean {
  const code = errorCodeOf(err);
  return code === "UNAUTHENTICATED" || code === "FORBIDDEN";
}

/** A message for a failed admin call (LLD §16 codes; invitation reasons). */
export function adminErrorMessage(err: unknown, action: AdminAction): string {
  const code = errorCodeOf(err);
  const data = errorData(err);
  switch (code) {
    case "RATE_LIMITED": {
      const after = typeof data.retryAfter === "number" ? data.retryAfter : null;
      return after !== null
        ? `You've sent the most invitations allowed for today. Try again in ${retryWording(after)}.`
        : "You've sent the most invitations allowed for today. Try again later.";
    }
    case "VALIDATION_FAILED":
      switch (data.reason) {
        case "INVALID_EMAIL":
          return "Enter a valid email address, like name@school.org.";
        case "ALREADY_ACTIVE":
          return "This email already belongs to an active account.";
        case "NOT_PENDING":
          return "This invitation was already accepted or cancelled.";
      }
      if (action === "restore") {
        return "Another active account already uses this email, so this tutor can't be restored.";
      }
      if (action === "deleteAttempts") {
        return `Delete at most ${MAX_DELETE_ATTEMPTS} attempts at a time.`;
      }
      return "That request wasn't accepted. Check the details and try again.";
    case "NOT_FOUND":
      return "That item no longer exists. The list shows the latest state.";
    case "UNAUTHENTICATED":
    case "FORBIDDEN":
      return "Your session has ended. Sign in again to continue.";
  }
  if (action === "deleteAttempts" && err instanceof Error && /validator/i.test(err.message)) {
    return "Some of those IDs aren't attempt IDs. Check them and try again.";
  }
  return "Something went wrong. Check your connection and try again.";
}
