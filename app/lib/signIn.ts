/**
 * Pure helpers for `/sign-in` and `/invite/[token]` (LLD §9, §14.1, PRD AU-1
 * to AU-3). Nothing here may say whether an email has an account: the code
 * request always answers the same way (no enumeration).
 */
import { HOME_BY_ROLE, safeRedirectPath, type StaffRole } from "./authGuard";

/** AU-1: codes are 6 digits. */
export const CODE_LENGTH = 6;

/** AU-3: a new code at most once every 60 seconds. */
export const RESEND_AFTER_S = 60;

/** AU-1: codes expire after 10 minutes. */
export const CODE_TTL_MIN = 10;

/** RFC 5321 path limit, as on the server. */
const EMAIL_MAX = 254;

/** Trimmed and lower-cased, as the server stores it. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** A loose shape check so obvious typos are caught before a request. */
export function looksLikeEmail(raw: string): boolean {
  const email = normalizeEmail(raw);
  return email.length <= EMAIL_MAX && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Keep only the digits of a typed or pasted code, at most `CODE_LENGTH`.
 * Handles pastes such as "481 029", "481-029" or full-width digits.
 */
export function sanitizeCode(raw: string): string {
  return raw.normalize("NFKC").replace(/\D/g, "").slice(0, CODE_LENGTH);
}

export function isCompleteCode(code: string): boolean {
  return new RegExp(`^\\d{${CODE_LENGTH}}$`).test(code);
}

/** Seconds from Better Auth's `X-Retry-After` header, `null` if absent or bad. */
export function parseRetryAfter(value: string | null | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.ceil(n);
}

/** `42` → "0:42", `75` → "1:15". */
export function formatCountdown(seconds: number): string {
  const s = Math.max(0, Math.ceil(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** "Try again in 45 seconds." / "Try again in 3 minutes." / "Try again shortly." */
export function retryAfterText(seconds: number | null): string {
  if (seconds == null || seconds <= 0) return "Try again shortly.";
  if (seconds < 60) return `Try again in ${seconds} ${seconds === 1 ? "second" : "seconds"}.`;
  const minutes = Math.ceil(seconds / 60);
  return `Try again in ${minutes} ${minutes === 1 ? "minute" : "minutes"}.`;
}

/** What a Better Auth client call reports on failure (`{ error }`). */
export interface AuthFailure {
  status?: number;
  code?: string;
  message?: string;
}

/** The neutral line after "Resend code". */
export function codeResentText(email: string): string {
  return `If ${email} belongs to an active account, we've sent a new code. Earlier codes no longer work.`;
}

/**
 * Message for a failed code request. Only rate limits and malformed requests
 * fail; neither depends on whether the email has an account.
 */
export function sendCodeErrorMessage(err: AuthFailure, retryAfterS: number | null): string {
  if (err.status === 429) return `Too many code requests. ${retryAfterText(retryAfterS)}`;
  if (err.status === 400) return "Enter a valid email address.";
  return "We couldn't send a code just now. Check your connection and try again.";
}

/**
 * Whether the error means the current code is dead and a new one is needed
 * (the UI then offers "Send a new code" straight away).
 */
export function needsNewCode(err: AuthFailure): boolean {
  return err.code === "OTP_EXPIRED" || err.code === "TOO_MANY_ATTEMPTS";
}

/** Message for a failed code check (`signIn.emailOtp`). */
export function verifyErrorMessage(err: AuthFailure, retryAfterS: number | null): string {
  switch (err.code) {
    case "INVALID_OTP":
      return "That code isn't right. Check the latest email and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Send a new code and use that one.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong codes, so that code no longer works. Send a new code.";
    case "ACCOUNT_INACTIVE":
      return "This account can't sign in. Contact the Salus admin if you think that's wrong.";
  }
  if (err.status === 429) return `Too many tries. ${retryAfterText(retryAfterS)}`;
  return "We couldn't check that code just now. Check your connection and try again.";
}

/** One message for every invitation link that doesn't work (LLD §9.3). */
export const DEAD_INVITE_TEXT =
  "It may have expired, been used already or been replaced by a newer one. Ask the Salus admin to send a new invitation.";

/**
 * Where to go after sign-in: a safe `?redirect=` path if there is one, else
 * the role's home. A redirect is never trusted as-is (`safeRedirectPath`).
 */
export function postSignInPath(role: StaffRole | null, redirect: unknown): string {
  const home = role ? HOME_BY_ROLE[role] : HOME_BY_ROLE.tutor;
  const target = safeRedirectPath(redirect, home);
  // Don't send someone back to the sign-in or invite pages they just used.
  if (/^\/(sign-in|invite)(\/|\?|#|$)/.test(target)) return home;
  return target;
}
