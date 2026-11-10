import { afterEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../convex/_generated/api";
import { setup } from "../lib/fixtures";

describe("email/test:sendTest (production email check)", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends through Resend and returns its id", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Salus <no-reply@salus.test>");
    const fetchMock = vi.fn(
      async (_url: string, _init: RequestInit) =>
        new Response(JSON.stringify({ id: "email_9" }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const t = setup();
    expect(await t.action(internal.email.test.sendTest, { to: "me@example.com" })).toEqual({
      ok: true,
      provider: "resend",
      id: "email_9",
    });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    const body = JSON.parse(String(init.body)) as { subject: string; to: string[] };
    expect(body.subject).toBe("Salus email test");
    expect(body.to).toEqual(["me@example.com"]);
  });

  it("reports a missing setting without throwing", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "");
    const t = setup();
    expect(await t.action(internal.email.test.sendTest, { to: "me@example.com" })).toEqual({
      ok: false,
      error: "RESEND_API_KEY is not set",
    });
  });

  it("reports a rejected request with Resend's reason, addresses redacted", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "resend");
    vi.stubEnv("RESEND_API_KEY", "re_test_key");
    vi.stubEnv("EMAIL_FROM", "Salus <no-reply@salus.test>");
    const message = "You can only send to me@example.com until you verify a domain.";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ message }), { status: 403 })),
    );
    const t = setup();
    expect(await t.action(internal.email.test.sendTest, { to: "me@example.com" })).toEqual({
      ok: false,
      error: "Resend responded 403",
      detail: "You can only send to <address> until you verify a domain.",
    });
  });
});
