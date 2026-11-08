/**
 * Email templates (LLD §11, PRD AR-4, PR-2).
 *
 * Plain text plus simple inline-styled HTML. No images, tracking pixels or
 * links other than the one the email exists for. Every inserted value is
 * HTML-escaped; the invitation link must also be an absolute http(s) URL, so a
 * `javascript:` or `data:` link can't reach an `href`. Subjects are fixed text.
 */
import type { EmailMessage } from "./provider";

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]!);
}

/** Absolute http(s) URL, or throw. Returns the URL as given. */
export function assertHttpUrl(link: string): string {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    throw new Error("Email link is not a valid URL");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("Email link must use http or https");
  }
  return link;
}

/** Reject recipients with whitespace or control characters (header safety). */
function assertAddress(to: string): string {
  if (!/^[^\s@]+@[^\s@]+$/.test(to)) throw new Error("Invalid recipient address");
  return to;
}

function layout(bodyHtml: string): string {
  return [
    "<!doctype html>",
    '<html lang="en"><head><meta charset="utf-8"><title>Salus</title></head>',
    '<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff">',
    '<div style="max-width:480px;margin:0 auto">',
    '<p style="font-size:18px;font-weight:bold;margin:0 0 16px">Salus</p>',
    bodyHtml,
    '<p style="font-size:12px;color:#555;margin-top:32px">This is an automated message from Salus. Please don\'t reply.</p>',
    "</div></body></html>",
  ].join("");
}

/** Sign-in code (AU-1, AU-2: 6 digits, valid for 10 minutes). */
export function otp({ to, code }: { to: string; code: string }): EmailMessage {
  const subject = "Your Salus sign-in code";
  const text = [
    `Your Salus sign-in code is: ${code}`,
    "",
    "It expires in 10 minutes. If you didn't ask for this code, you can ignore this email.",
  ].join("\n");
  const html = layout(
    [
      "<p>Your Salus sign-in code is:</p>",
      `<p style="font-size:28px;font-weight:bold;letter-spacing:4px;font-family:monospace">${escapeHtml(code)}</p>`,
      "<p>It expires in 10 minutes. If you didn't ask for this code, you can ignore this email.</p>",
    ].join(""),
  );
  return { to: assertAddress(to), subject, text, html, tag: "otp" };
}

/** Tutor invitation (LLD §9.3: link valid for 7 days). */
export function invitation({
  to,
  link,
  invitedBy,
}: {
  to: string;
  link: string;
  invitedBy: string;
}): EmailMessage {
  const href = assertHttpUrl(link);
  const subject = "You're invited to Salus";
  const text = [
    `${invitedBy} has invited you to Salus as a tutor.`,
    "",
    "Accept the invitation here:",
    href,
    "",
    "The link expires in 7 days. If you weren't expecting this, you can ignore this email.",
  ].join("\n");
  const html = layout(
    [
      `<p>${escapeHtml(invitedBy)} has invited you to Salus as a tutor.</p>`,
      `<p><a href="${escapeHtml(href)}" style="color:#1d4ed8">Accept the invitation</a></p>`,
      `<p style="font-size:12px;color:#555;word-break:break-all">Or copy this link: ${escapeHtml(href)}</p>`,
      "<p>The link expires in 7 days. If you weren't expecting this, you can ignore this email.</p>",
    ].join(""),
  );
  return { to: assertAddress(to), subject, text, html, tag: "invite" };
}
