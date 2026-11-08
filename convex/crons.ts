/**
 * Scheduled jobs (LLD §12.3).
 */
import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Pending invitations past `expiresAt` → `expired` (T-405). A safety net:
// each invitation also schedules its own expiry job at `expiresAt`.
crons.cron("expireInvitations", "0 2 * * *", internal.invitations.expireInvitations, {});

export default crons;
