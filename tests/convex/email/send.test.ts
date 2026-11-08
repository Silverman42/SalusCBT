import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { internal } from "../../../convex/_generated/api";
import { getProvider } from "../../../convex/email/provider";
import { ConsoleProvider } from "../../../convex/email/console";
import { ResendProvider } from "../../../convex/email/resend";
import { MAX_RETRIES, RETRY_DELAYS_MS } from "../../../convex/email/send";
import { otp } from "../../../convex/email/templates";
import { setup } from "../lib/fixtures";

const message = otp({ to: "tutor@example.com", code: "654321" });

/** Fake Resend: answers with the given statuses in order, then 200. */
function fakeResend(statuses: number[]) {
  const queue = [...statuses];
  const fetchMock = vi.fn(async (_url: string, _init: RequestInit) => {
    const status = queue.shift() ?? 200;
    return status === 200
      ? new Response(JSON.stringify({ id: "email_1" }), { status })
      : new Response(JSON.stringify({ message: "nope" }), { status });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function useResend() {
  vi.stubEnv("EMAIL_PROVIDER", "resend");
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
  vi.stubEnv("EMAIL_FROM", "Salus <no-reply@salus.test>");
}

describe("getProvider (LLD §11)", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("defaults to the console provider when EMAIL_PROVIDER is unset", () => {
    expect(getProvider({})).toBeInstanceOf(ConsoleProvider);
    expect(getProvider({ EMAIL_PROVIDER: "console" })).toBeInstanceOf(ConsoleProvider);
  });

  it("selects Resend and requires its key and sender", () => {
    expect(
      getProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k", EMAIL_FROM: "a@b.c" }),
    ).toBeInstanceOf(ResendProvider);
    expect(() => getProvider({ EMAIL_PROVIDER: "resend", EMAIL_FROM: "a@b.c" })).toThrow(
      /RESEND_API_KEY/,
    );
    expect(() => getProvider({ EMAIL_PROVIDER: "resend", RESEND_API_KEY: "k" })).toThrow(
      /EMAIL_FROM/,
    );
  });

  it("refuses an unknown provider instead of falling back to the console", () => {
    expect(() => getProvider({ EMAIL_PROVIDER: "resnd" })).toThrow(/Unknown EMAIL_PROVIDER/);
  });

  it("reads the deployment environment by default", () => {
    useResend();
    expect(getProvider()).toBeInstanceOf(ResendProvider);
  });
});

describe("internal.email.send.send", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends once through Resend with the expected request", async () => {
    useResend();
    const fetchMock = fakeResend([]);
    const t = setup();
    const result = await t.action(internal.email.send.send, message);
    expect(result).toEqual({ status: "sent", id: "email_1" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer re_test_key");
    expect(headers["Idempotency-Key"]).toMatch(/\S+/);
    expect(JSON.parse(init.body as string)).toEqual({
      from: "Salus <no-reply@salus.test>",
      to: ["tutor@example.com"],
      subject: message.subject,
      html: message.html,
      text: message.text,
      tags: [{ name: "type", value: "otp" }],
    });
  });

  it("retries transient failures with backoff and the same idempotency key", async () => {
    useResend();
    const fetchMock = fakeResend([500, 429, 503]);
    const t = setup();
    const first = await t.action(internal.email.send.send, message);
    expect(first).toEqual({ status: "retrying", retryInMs: RETRY_DELAYS_MS[0] });

    const scheduled = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(scheduled).toHaveLength(1);
    expect(scheduled[0]!.scheduledTime - scheduled[0]!._creationTime).toBeGreaterThanOrEqual(
      RETRY_DELAYS_MS[0] - 50,
    );

    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(4); // 1 + 3 retries, the last succeeds
    const keys = fetchMock.mock.calls.map(
      ([, init]) => (init.headers as Record<string, string>)["Idempotency-Key"],
    );
    expect(new Set(keys).size).toBe(1);

    const all = await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect());
    expect(all.map((f) => f.args[0].attempt)).toEqual([1, 2, 3]);
    expect(all.every((f) => f.state.kind === "success")).toBe(true);
  });

  it(`gives up after ${MAX_RETRIES} retries`, async () => {
    useResend();
    const fetchMock = fakeResend([500, 500, 500, 500, 500]);
    const t = setup();
    await t.action(internal.email.send.send, message);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(MAX_RETRIES + 1);
    expect(console.error).toHaveBeenCalledTimes(1);
    expect(vi.mocked(console.error).mock.calls[0]![0]).toMatch(/failed permanently/);
  });

  it("doesn't retry a permanent failure (bad request or bad key)", async () => {
    useResend();
    const fetchMock = fakeResend([422]);
    const t = setup();
    expect(await t.action(internal.email.send.send, message)).toEqual({ status: "failed" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries network errors", async () => {
    useResend();
    let calls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        calls++;
        if (calls === 1) throw new TypeError("network down");
        return new Response(JSON.stringify({ id: "email_2" }), { status: 200 });
      }),
    );
    const t = setup();
    expect((await t.action(internal.email.send.send, message)).status).toBe("retrying");
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(calls).toBe(2);
  });

  it("never logs the recipient or the body on failure", async () => {
    useResend();
    fakeResend([500, 500, 500, 500]);
    const t = setup();
    await t.action(internal.email.send.send, message);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const logged = [...vi.mocked(console.warn).mock.calls, ...vi.mocked(console.error).mock.calls]
      .flat()
      .join("\n");
    expect(logged).not.toContain("tutor@example.com");
    expect(logged).not.toContain("654321");
  });

  it("logs the email with the console provider (dev path)", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "console");
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    const t = setup();
    expect(await t.action(internal.email.send.send, message)).toEqual({ status: "sent" });
    expect(log.mock.calls.flat().join("\n")).toContain("654321");
  });
});
