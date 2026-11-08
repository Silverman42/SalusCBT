/**
 * Audit log writer (LLD §12.2, PRD AU-7, CL-11).
 *
 * Only the event names below may be written, so the admin audit view can rely
 * on a closed set. `ipHash` is an HMAC computed by the Nuxt server and is
 * cleared after 30 days by the `purgeIpHashes` cron (PR-3).
 */
import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export const AUDIT_ACTIONS = [
  "invite.created",
  "invite.resent",
  "invite.cancelled",
  "invite.accepted",
  "auth.otp_requested",
  "auth.otp_failed",
  "auth.signin",
  "auth.signout",
  "tutor.removed",
  "tutor.restored",
  "class.created",
  "class.closed",
  "attempt.deleted", // meta: { count }
  "version.published",
  "exam.default_changed",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntry {
  /** Omit for system or anonymous events. */
  actorId?: Id<"profiles">;
  action: AuditAction;
  /** Free-form target reference, e.g. an id or a lower-cased email. */
  target?: string;
  /** Small JSON-safe details. Never secrets, tokens or OTP codes. */
  meta?: Record<string, unknown>;
  ipHash?: string;
}

export async function writeAudit(
  ctx: Pick<MutationCtx, "db">,
  entry: AuditEntry,
): Promise<Id<"auditLog">> {
  return await ctx.db.insert("auditLog", {
    action: entry.action,
    at: Date.now(),
    ...(entry.actorId !== undefined ? { actorId: entry.actorId } : {}),
    ...(entry.target !== undefined ? { target: entry.target } : {}),
    ...(entry.meta !== undefined ? { meta: entry.meta } : {}),
    ...(entry.ipHash !== undefined ? { ipHash: entry.ipHash } : {}),
  });
}
