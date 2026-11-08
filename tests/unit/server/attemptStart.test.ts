import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  START_BODY_MAX_BYTES,
  computeIpHash,
  isJsonContentType,
  isSameOriginRequest,
  mapStartError,
  misconfigured,
  parseStartBody,
} from "../../../server/utils/attemptStart";

const TOKEN = "A".repeat(42) + "_";
const SECRET = "server-secret-value";

const body = (value: unknown) => JSON.stringify(value);

describe("parseStartBody", () => {
  it("accepts a minimal body and defaults mode to standard", () => {
    expect(parseStartBody(body({ anonToken: TOKEN }))).toEqual({
      ok: true,
      value: { anonToken: TOKEN, mode: "standard" },
    });
  });

  it("keeps trimmed name and class code, and retake mode", () => {
    expect(
      parseStartBody(
        body({ anonToken: TOKEN, displayName: "  Ada  ", classCode: " sec-ab12 ", mode: "retake" }),
      ),
    ).toEqual({
      ok: true,
      value: { anonToken: TOKEN, displayName: "Ada", classCode: "sec-ab12", mode: "retake" },
    });
  });

  it("drops blank or null optional fields", () => {
    const result = parseStartBody(body({ anonToken: TOKEN, displayName: "   ", classCode: null }));
    expect(result).toEqual({ ok: true, value: { anonToken: TOKEN, mode: "standard" } });
  });

  it.each([
    ["empty", ""],
    ["not JSON", "{anonToken"],
    ["an array", "[]"],
    ["null", "null"],
    ["a string", '"x"'],
  ])("rejects %s as BAD_REQUEST", (_label, raw) => {
    expect(parseStartBody(raw)).toEqual({
      ok: false,
      error: { status: 400, body: { code: "BAD_REQUEST" } },
    });
  });

  it("rejects undefined", () => {
    expect(parseStartBody(undefined).ok).toBe(false);
  });

  it.each([
    ["missing", {}],
    ["too short", { anonToken: "A".repeat(42) }],
    ["too long", { anonToken: "A".repeat(44) }],
    ["bad chars", { anonToken: "A".repeat(42) + "=" }],
    ["a number", { anonToken: 42 }],
  ])("rejects a %s token as BAD_TOKEN", (_label, value) => {
    const result = parseStartBody(body(value));
    expect(result).toEqual({ ok: false, error: { status: 400, body: { code: "BAD_TOKEN" } } });
  });

  it.each([
    ["unknown key", { anonToken: TOKEN, serverSecret: "x" }],
    ["ipHash smuggled in", { anonToken: TOKEN, ipHash: "x" }],
    ["non-string name", { anonToken: TOKEN, displayName: 5 }],
    ["non-string class code", { anonToken: TOKEN, classCode: ["a"] }],
    ["unknown mode", { anonToken: TOKEN, mode: "practice" }],
    ["null mode", { anonToken: TOKEN, mode: null }],
  ])("rejects %s as BAD_REQUEST", (_label, value) => {
    const result = parseStartBody(body(value));
    expect(result).toEqual({ ok: false, error: { status: 400, body: { code: "BAD_REQUEST" } } });
  });

  it("rejects a display name over 40 characters as VALIDATION_FAILED", () => {
    expect(parseStartBody(body({ anonToken: TOKEN, displayName: "x".repeat(40) })).ok).toBe(true);
    expect(parseStartBody(body({ anonToken: TOKEN, displayName: "x".repeat(41) }))).toEqual({
      ok: false,
      error: { status: 400, body: { code: "VALIDATION_FAILED" } },
    });
  });

  it("rejects an over-long class code as CLASS_UNKNOWN", () => {
    expect(parseStartBody(body({ anonToken: TOKEN, classCode: "C".repeat(33) }))).toEqual({
      ok: false,
      error: { status: 400, body: { code: "CLASS_UNKNOWN" } },
    });
  });

  it("rejects bodies over the size limit with 413", () => {
    const raw = body({ anonToken: TOKEN, displayName: "x".repeat(START_BODY_MAX_BYTES) });
    expect(parseStartBody(raw)).toEqual({
      ok: false,
      error: { status: 413, body: { code: "PAYLOAD_TOO_LARGE" } },
    });
  });

  it("never echoes the token in an error", () => {
    const result = parseStartBody(body({ anonToken: TOKEN, displayName: "x".repeat(41) }));
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });
});

describe("isJsonContentType", () => {
  it("accepts application/json with parameters", () => {
    expect(isJsonContentType("application/json")).toBe(true);
    expect(isJsonContentType("Application/JSON; charset=utf-8")).toBe(true);
  });

  it("rejects form and text types", () => {
    for (const type of [
      undefined,
      null,
      "",
      "text/plain",
      "application/x-www-form-urlencoded",
      "multipart/form-data; boundary=x",
    ]) {
      expect(isJsonContentType(type)).toBe(false);
    }
  });
});

describe("isSameOriginRequest", () => {
  const siteOrigin = "https://salus.example";

  it("accepts same-origin browser requests", () => {
    expect(
      isSameOriginRequest({ origin: siteOrigin, secFetchSite: "same-origin", siteOrigin }),
    ).toBe(true);
    expect(isSameOriginRequest({ origin: "HTTPS://SALUS.EXAMPLE", siteOrigin })).toBe(true);
    expect(isSameOriginRequest({ secFetchSite: "same-origin", siteOrigin })).toBe(true);
  });

  it("accepts non-browser requests with neither header", () => {
    expect(isSameOriginRequest({ siteOrigin })).toBe(true);
  });

  it("rejects other origins", () => {
    for (const origin of [
      "https://evil.example",
      "http://salus.example",
      "https://salus.example:8443",
      "https://salus.example.evil.example",
      "null",
    ]) {
      expect(isSameOriginRequest({ origin, siteOrigin })).toBe(false);
    }
  });

  it("rejects cross-site and same-site fetches even with a matching Origin", () => {
    for (const secFetchSite of ["cross-site", "same-site", "none"]) {
      expect(isSameOriginRequest({ origin: siteOrigin, secFetchSite, siteOrigin })).toBe(false);
    }
  });
});

describe("computeIpHash", () => {
  it("is deterministic for one pepper and depends on the pepper", () => {
    const a = computeIpHash("pepper-1", "203.0.113.7");
    expect(computeIpHash("pepper-1", "203.0.113.7")).toBe(a);
    expect(computeIpHash("pepper-2", "203.0.113.7")).not.toBe(a);
    expect(computeIpHash("pepper-1", "203.0.113.8")).not.toBe(a);
  });

  it("is a 64-character hex digest that never contains the raw IP", () => {
    for (const ip of ["203.0.113.7", "2001:db8::1", "unknown"]) {
      const hash = computeIpHash("pepper", ip);
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
      expect(hash).not.toBe(ip);
      expect(hash).not.toContain(ip);
    }
  });

  it("matches the HMAC-SHA256 test vector (RFC 4231 case 2)", () => {
    expect(computeIpHash("Jefe", "what do ya want for nothing?")).toBe(
      "5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843",
    );
  });

  it("refuses an empty pepper", () => {
    expect(() => computeIpHash("", "203.0.113.7")).toThrow();
  });
});

describe("mapStartError", () => {
  it.each(["BAD_TOKEN", "VALIDATION_FAILED", "CLASS_UNKNOWN", "CLASS_CLOSED"] as const)(
    "maps %s to 400 with its code",
    (code) => {
      expect(mapStartError(new ConvexError(code))).toEqual({ status: 400, body: { code } });
    },
  );

  it("maps NOT_FOUND to 404", () => {
    const res = mapStartError(new ConvexError("NOT_FOUND"));
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ code: "NOT_FOUND" });
  });

  it("maps RATE_LIMITED to 429 with retryAfter (ms) and Retry-After (s)", () => {
    expect(mapStartError(new ConvexError({ code: "RATE_LIMITED", retryAfter: 61_500 }))).toEqual({
      status: 429,
      body: { code: "RATE_LIMITED", retryAfter: 61_500 },
      retryAfterSeconds: 62,
    });
  });

  it("keeps Retry-After at least 1 s when retryAfter is missing or tiny", () => {
    expect(mapStartError(new ConvexError({ code: "RATE_LIMITED", retryAfter: 10 }))).toMatchObject({
      status: 429,
      retryAfterSeconds: 1,
    });
    expect(mapStartError(new ConvexError({ code: "RATE_LIMITED" }))).toMatchObject({
      status: 429,
      body: { code: "RATE_LIMITED", retryAfter: 0 },
      retryAfterSeconds: 1,
    });
  });

  it("maps FORBIDDEN (our secret is wrong) to a generic 500 with a log line", () => {
    const res = mapStartError(new ConvexError("FORBIDDEN"));
    expect(res.status).toBe(500);
    expect(res.body).toEqual({ code: "SERVER_ERROR" });
    expect(res.log).toMatch(/NUXT_SERVER_SECRET/);
  });

  it("maps plain errors and unknown values to a generic 500", () => {
    const plain = mapStartError(new Error("[Request ID: x] Server Error"));
    expect(plain).toMatchObject({ status: 500, body: { code: "SERVER_ERROR" } });
    expect(mapStartError(new ConvexError("ATTEMPT_CLOSED"))).toMatchObject({ status: 500 });
    expect(mapStartError("boom")).toMatchObject({ status: 500, body: { code: "SERVER_ERROR" } });
  });

  it("never puts the secret or token in the body", () => {
    for (const err of [new ConvexError("FORBIDDEN"), new Error(`x ${SECRET} ${TOKEN}`)]) {
      expect(JSON.stringify(mapStartError(err).body)).not.toMatch(new RegExp(`${SECRET}|${TOKEN}`));
    }
  });
});

describe("misconfigured", () => {
  it("names the env var in the log only", () => {
    const res = misconfigured("NUXT_IP_PEPPER");
    expect(res).toMatchObject({ status: 500, body: { code: "SERVER_ERROR" } });
    expect(res.log).toContain("NUXT_IP_PEPPER");
    expect(JSON.stringify(res.body)).not.toContain("NUXT_IP_PEPPER");
  });
});
