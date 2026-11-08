import { describe, expect, it } from "vitest";
import { assertHttpUrl, escapeHtml, invitation, otp } from "../../../convex/email/templates";

const NASTY = `<script>alert("x")</script> & 'quoted' "double"`;
const NASTY_ESCAPED =
  "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;quoted&#39; &quot;double&quot;";

describe("escapeHtml", () => {
  it("escapes &, <, >, double and single quotes", () => {
    expect(escapeHtml(NASTY)).toBe(NASTY_ESCAPED);
  });

  it("escapes & first, so entities aren't double-decoded", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });
});

describe("assertHttpUrl", () => {
  it("accepts http and https URLs", () => {
    expect(assertHttpUrl("https://salus.example/invite/abc")).toBe(
      "https://salus.example/invite/abc",
    );
    expect(assertHttpUrl("http://localhost:3000/invite/abc")).toBe(
      "http://localhost:3000/invite/abc",
    );
  });

  it.each([
    "javascript:alert(1)",
    "JavaScript:alert(1)",
    "data:text/html,<script>alert(1)</script>",
    "/invite/relative",
    "not a url",
    "",
  ])("rejects %j", (link) => {
    expect(() => assertHttpUrl(link)).toThrow();
  });
});

describe("otp template", () => {
  const msg = otp({ to: "tutor@example.com", code: "123456" });

  it("builds a tagged message with text and HTML", () => {
    expect(msg).toMatchObject({ to: "tutor@example.com", tag: "otp" });
    expect(msg.subject).toBe("Your Salus sign-in code");
    expect(msg.text).toContain("123456");
    expect(msg.html).toContain(">123456<");
    expect(msg.text).toContain("10 minutes");
  });

  it("has no images, tracking pixels or links", () => {
    expect(msg.html).not.toMatch(/<img|<a\s|href=|src=|https?:\/\//i);
    expect(msg.text).not.toMatch(/https?:\/\//);
  });

  it("escapes the inserted code", () => {
    const evil = otp({ to: "tutor@example.com", code: NASTY });
    expect(evil.html).toContain(NASTY_ESCAPED);
    expect(evil.html).not.toContain("<script>");
  });

  it("rejects a recipient with whitespace or newlines", () => {
    expect(() => otp({ to: "a@b.c\nBcc: x@y.z", code: "1" })).toThrow();
    expect(() => otp({ to: "not-an-address", code: "1" })).toThrow();
  });
});

describe("invitation template", () => {
  const link = "https://salus.example/invite/tok_123?x=1&y=2";
  const msg = invitation({ to: "new@example.com", link, invitedBy: "Admin" });

  it("builds a tagged message with the link in both parts", () => {
    expect(msg).toMatchObject({ to: "new@example.com", tag: "invite" });
    expect(msg.subject).toBe("You're invited to Salus");
    expect(msg.text).toContain(link);
    expect(msg.text).toContain("Admin has invited you");
    expect(msg.html).toContain('href="https://salus.example/invite/tok_123?x=1&amp;y=2"');
    expect(msg.text).toContain("7 days");
  });

  it("contains no link other than the invitation and no images", () => {
    const hrefs = [...msg.html.matchAll(/href="([^"]*)"/g)].map((m) => m[1]);
    expect(hrefs).toEqual(["https://salus.example/invite/tok_123?x=1&amp;y=2"]);
    expect(msg.html).not.toMatch(/<img|src=/i);
  });

  it("escapes invitedBy and the link", () => {
    const evil = invitation({
      to: "new@example.com",
      link: `https://salus.example/invite/"><script>alert(1)</script>`,
      invitedBy: NASTY,
    });
    expect(evil.html).toContain(NASTY_ESCAPED);
    expect(evil.html).not.toContain("<script>");
    expect(evil.html).not.toMatch(/href="[^"]*"[^>]*>\s*<script/);
  });

  it("refuses a javascript: link", () => {
    expect(() =>
      invitation({ to: "new@example.com", link: "javascript:alert(1)", invitedBy: "Admin" }),
    ).toThrow();
  });
});
