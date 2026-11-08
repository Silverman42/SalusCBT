import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  adminErrorMessage,
  deletedMessage,
  describeAudit,
  displayName,
  effectiveInvitationStatus,
  expiryLabel,
  formatDate,
  formatWhen,
  initials,
  invitationActions,
  invitationStatusBadge,
  isOpenInvitation,
  isSessionError,
  maskEmail,
  parseAttemptIds,
  retryWording,
  tutorStatusBadge,
} from "../../app/lib/admin";
import { activeNavItem, STAFF_NAV, staffAreaOf } from "../../app/lib/staffNav";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
// Sun 8 Nov 2026, 12:00 UTC.
const NOW = Date.UTC(2026, 10, 8, 12, 0);
const UTC = "UTC";

describe("status badges", () => {
  it("shows tutors as Active or Removed, as in the mockup", () => {
    expect(tutorStatusBadge("active")).toEqual({ label: "Active", tone: "ok" });
    expect(tutorStatusBadge("removed")).toEqual({ label: "Removed", tone: "muted" });
  });

  it("labels every invitation status", () => {
    expect(invitationStatusBadge("pending").label).toBe("Pending");
    expect(invitationStatusBadge("accepted")).toEqual({ label: "Accepted", tone: "ok" });
    expect(invitationStatusBadge("expired").label).toBe("Expired");
    expect(invitationStatusBadge("cancelled").tone).toBe("muted");
  });
});

describe("invitation state", () => {
  it("treats a pending invitation past its expiry as expired before the cron runs", () => {
    expect(effectiveInvitationStatus({ status: "pending", expiresAt: NOW + 1 }, NOW)).toBe(
      "pending",
    );
    expect(effectiveInvitationStatus({ status: "pending", expiresAt: NOW }, NOW)).toBe("expired");
    expect(effectiveInvitationStatus({ status: "accepted", expiresAt: NOW - DAY }, NOW)).toBe(
      "accepted",
    );
  });

  it("offers resend and cancel only while the invitation is open", () => {
    const at = { expiresAt: NOW };
    expect(invitationActions({ ...at, status: "pending" })).toEqual({ resend: true, cancel: true });
    expect(invitationActions({ ...at, status: "expired" })).toEqual({ resend: true, cancel: true });
    expect(invitationActions({ ...at, status: "accepted" })).toEqual({
      resend: false,
      cancel: false,
    });
    expect(invitationActions({ ...at, status: "cancelled" }).resend).toBe(false);
    expect(isOpenInvitation({ ...at, status: "expired" })).toBe(true);
    expect(isOpenInvitation({ ...at, status: "cancelled" })).toBe(false);
  });

  it("words the time left like the mockup", () => {
    expect(expiryLabel(NOW + 7 * DAY, NOW)).toBe("Expires in 7 days");
    expect(expiryLabel(NOW + 6 * DAY - HOUR, NOW)).toBe("Expires in 6 days");
    expect(expiryLabel(NOW + DAY + HOUR, NOW)).toBe("Expires in 1 day");
    expect(expiryLabel(NOW + 5 * HOUR + 10, NOW)).toBe("Expires in 5 hours");
    expect(expiryLabel(NOW + HOUR, NOW)).toBe("Expires in 1 hour");
    expect(expiryLabel(NOW + 10 * 60_000, NOW)).toBe("Expires in under an hour");
    expect(expiryLabel(NOW, NOW)).toBe("Expired");
  });
});

describe("dates", () => {
  it("formats audit times as Today, Yesterday or a date, with a 24-hour time", () => {
    expect(formatWhen(Date.UTC(2026, 10, 8, 9, 14), NOW, UTC)).toBe("Today · 09:14");
    expect(formatWhen(Date.UTC(2026, 10, 7, 17, 30), NOW, UTC)).toBe("Yesterday · 17:30");
    expect(formatWhen(Date.UTC(2026, 10, 4, 11, 20), NOW, UTC)).toBe("4 Nov · 11:20");
  });

  it("uses calendar days in the given time zone, not 24-hour spans", () => {
    // 23:30 on 7 Nov UTC is "yesterday" at noon on 8 Nov, though only 12.5 hours ago.
    expect(formatWhen(Date.UTC(2026, 10, 7, 23, 30), NOW, UTC)).toBe("Yesterday · 23:30");
    // In Lagos (UTC+1) the same instant is already 8 Nov.
    expect(formatWhen(Date.UTC(2026, 10, 7, 23, 30), NOW, "Africa/Lagos")).toBe("Today · 00:30");
  });

  it("adds the year only for other years", () => {
    expect(formatDate(Date.UTC(2026, 0, 2), NOW, UTC)).toBe("2 Jan");
    expect(formatDate(Date.UTC(2025, 11, 30), NOW, UTC)).toBe("30 Dec 2025");
  });
});

describe("people", () => {
  it("makes initials from the name, else the email", () => {
    expect(initials("Ngozi Obi", "ngozi@hizo.africa")).toBe("NO");
    expect(initials("Ada Lovelace Byron", "a@x.org")).toBe("AB");
    expect(initials("Fatima", "f@x.org")).toBe("FA");
    expect(initials(null, "s.mwangi@cyberke.org")).toBe("SM");
    expect(initials("  ", "@x.org")).toBe("?");
  });

  it("shows the name, else the email", () => {
    expect(displayName("David Asare", "d@x.org")).toBe("David Asare");
    expect(displayName(null, "d@x.org")).toBe("d@x.org");
    expect(displayName(" ", "d@x.org")).toBe("d@x.org");
  });

  it("masks emails like the mockup", () => {
    expect(maskEmail("fatima@kano-sec.ng")).toBe("f***@kano-sec.ng");
    expect(maskEmail("not-an-email")).toBe("not-an-email");
  });
});

describe("describeAudit", () => {
  const row = (action: string, extra: Partial<Parameters<typeof describeAudit>[0]> = {}) =>
    describeAudit({ action, actorEmail: "admin@salus.test", target: null, meta: null, ...extra });

  it("words the mockup's events", () => {
    expect(row("auth.signin", { actorEmail: "ngozi@hizo.africa" })).toEqual({
      icon: "i-lucide-log-in",
      tone: "brand",
      text: "ngozi@hizo.africa signed in",
    });
    expect(
      row("auth.otp_failed", {
        actorEmail: null,
        target: "fatima@kano-sec.ng",
        meta: { reason: "INVALID_OTP" },
      }),
    ).toMatchObject({ tone: "warn", text: "Wrong code for f***@kano-sec.ng" });
    expect(row("invite.created", { target: "kemi@lagoscyber.ng" }).text).toBe(
      "Invitation sent to kemi@lagoscyber.ng",
    );
    expect(row("attempt.deleted", { meta: { count: 1 } })).toMatchObject({
      tone: "bad",
      text: "admin@salus.test deleted 1 attempt",
    });
    expect(row("attempt.deleted", { meta: { count: 3 } }).text).toBe(
      "admin@salus.test deleted 3 attempts",
    );
    expect(row("tutor.removed", { target: "s.mwangi@cyberke.org" })).toMatchObject({
      icon: "i-lucide-user-x",
      tone: "bad",
      text: "s.mwangi@cyberke.org removed · sessions ended",
    });
    expect(row("invite.accepted", { target: "fatima@kano-sec.ng" }).text).toBe(
      "fatima@kano-sec.ng accepted invitation",
    );
  });

  it("covers every LLD §12.2 event without falling back to the raw name", () => {
    const actions = [
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
      "attempt.deleted",
      "version.published",
      "exam.default_changed",
    ];
    for (const action of actions) {
      const view = row(action, { target: "x@y.org" });
      expect(view.text).not.toBe(action);
      expect(view.icon).not.toBe("i-lucide-activity");
    }
    expect(row("something.new").text).toBe("something.new");
  });

  it("uses meta for details", () => {
    expect(
      row("invite.cancelled", { target: "a@b.org", meta: { reason: "superseded" } }).text,
    ).toBe("Invitation to a@b.org replaced by a new one");
    expect(row("class.created", { meta: { code: "SEC-4K7Q" } }).text).toBe(
      "admin@salus.test created class SEC-4K7Q",
    );
    expect(
      row("version.published", { actorEmail: null, meta: { source: "seed", versionNo: 2 } }).text,
    ).toBe("Exam version 2 published by the seed import");
    expect(row("auth.signin", { actorEmail: null }).text).toBe("System signed in");
    expect(
      row("auth.otp_failed", { target: "a@b.org", meta: { reason: "ACCOUNT_INACTIVE" } }).text,
    ).toBe("Sign-in refused (removed account) for a***@b.org");
  });
});

describe("parseAttemptIds", () => {
  const id1 = "j57a8bq3k2m9x4c7d1e6f0g5h8n2p3r4";
  const id2 = "k9wq2n3m4p5r6s7t8v9w0x1y2z3a4b5c";

  it("reads ids and links, deduplicated", () => {
    expect(parseAttemptIds(`${id1}\nhttps://salus.example/exam/${id2}/result?x=1, ${id1}`)).toEqual(
      { ids: [id1, id2], invalid: [] },
    );
  });

  it("reports what isn't an id", () => {
    expect(parseAttemptIds(`${id1} hello /r/abc`)).toEqual({
      ids: [id1],
      invalid: ["hello", "/r/abc"],
    });
    expect(parseAttemptIds("  \n ")).toEqual({ ids: [], invalid: [] });
  });

  it("words the result", () => {
    expect(deletedMessage(2, 2)).toBe("Deleted 2 attempts.");
    expect(deletedMessage(3, 1)).toBe("Deleted 1 attempt. 2 were already gone or not found.");
    expect(deletedMessage(1, 0)).toBe("Deleted 0 attempts. 1 was already gone or not found.");
  });
});

describe("adminErrorMessage", () => {
  it("explains invitation refusals by reason", () => {
    const refuse = (reason: string) => new ConvexError({ code: "VALIDATION_FAILED", reason });
    expect(adminErrorMessage(refuse("INVALID_EMAIL"), "invite")).toMatch(/valid email/);
    expect(adminErrorMessage(refuse("ALREADY_ACTIVE"), "invite")).toMatch(/already belongs/);
    expect(adminErrorMessage(refuse("NOT_PENDING"), "cancel")).toMatch(/accepted or cancelled/);
  });

  it("says when to retry a rate limit", () => {
    const err = new ConvexError({ code: "RATE_LIMITED", retryAfter: 3 * HOUR - 1 });
    expect(adminErrorMessage(err, "invite")).toMatch(/Try again in 3 hours\./);
    expect(retryWording(1)).toBe("1 minute");
    expect(retryWording(90_000)).toBe("2 minutes");
  });

  it("explains a restore blocked by another active account", () => {
    expect(adminErrorMessage(new ConvexError("VALIDATION_FAILED"), "restore")).toMatch(
      /Another active account/,
    );
  });

  it("recognises an ended session", () => {
    expect(isSessionError(new ConvexError("UNAUTHENTICATED"))).toBe(true);
    expect(isSessionError(new ConvexError("FORBIDDEN"))).toBe(true);
    expect(isSessionError(new ConvexError("NOT_FOUND"))).toBe(false);
    expect(adminErrorMessage(new ConvexError("FORBIDDEN"), "remove")).toMatch(/Sign in again/);
  });

  it("falls back to a generic message", () => {
    expect(adminErrorMessage(new Error("network"), "load")).toMatch(/Something went wrong/);
    expect(
      adminErrorMessage(
        new Error("ArgumentValidationError: Value does not match validator"),
        "deleteAttempts",
      ),
    ).toMatch(/aren't attempt IDs/);
  });
});

describe("staff nav", () => {
  it("picks the area from the path", () => {
    expect(staffAreaOf("/admin/tutors")).toBe("admin");
    expect(staffAreaOf("/admin")).toBe("admin");
    expect(staffAreaOf("/tutor/classes/x")).toBe("tutor");
    expect(staffAreaOf("/administrator")).toBe("tutor");
  });

  it("highlights the most specific item", () => {
    expect(activeNavItem(STAFF_NAV.tutor, "/tutor")?.label).toBe("Classes");
    expect(activeNavItem(STAFF_NAV.tutor, "/tutor/classes/abc")?.label).toBe("Classes");
    expect(activeNavItem(STAFF_NAV.tutor, "/tutor/versions/v1?tab=x")?.label).toBe(
      "Question editor",
    );
    expect(activeNavItem(STAFF_NAV.admin, "/admin/audit/")?.label).toBe("Audit log");
    expect(activeNavItem(STAFF_NAV.admin, "/admin/tutorsx")).toBeNull();
  });
});
