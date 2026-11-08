/**
 * Scheduled jobs (LLD §12.3). Each job's work lives with its table's
 * functions; this file only wires the schedules.
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// T-207: finalise attempts whose timer job failed (deadline + 60 s passed).
crons.interval("sweepOpenAttempts", { minutes: 10 }, internal.attempts.sweepOpenAttempts, {});

// Pending invitations past `expiresAt` → `expired` (T-405). A safety net:
// each invitation also schedules its own expiry job at `expiresAt`.
crons.cron("expireInvitations", "0 2 * * *", internal.invitations.expireInvitations, {});

export default crons;
