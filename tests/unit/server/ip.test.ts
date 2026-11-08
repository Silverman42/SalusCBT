import { describe, expect, it } from "vitest";
import { normaliseIp, resolveClientIp } from "../../../server/utils/ip";

describe("normaliseIp", () => {
  it("accepts IPv4 and IPv6 literals", () => {
    expect(normaliseIp(" 203.0.113.7 ")).toBe("203.0.113.7");
    expect(normaliseIp("2001:DB8::1")).toBe("2001:db8::1");
    expect(normaliseIp("[::1]")).toBe("::1");
  });

  it("unwraps IPv4-mapped IPv6", () => {
    expect(normaliseIp("::ffff:203.0.113.7")).toBe("203.0.113.7");
  });

  it("rejects anything else", () => {
    for (const bad of [
      null,
      undefined,
      "",
      "unknown",
      "1.2.3.4, 5.6.7.8",
      "1.2.3.4:80",
      "999.1.1.1",
      "<script>",
    ]) {
      expect(normaliseIp(bad)).toBeNull();
    }
  });
});

describe("resolveClientIp", () => {
  it("prefers Netlify's client connection IP", () => {
    expect(
      resolveClientIp({
        netlifyClientIp: "203.0.113.7",
        forwardedFor: "198.51.100.1",
        socketIp: "10.0.0.1",
        trustForwardedFor: true,
      }),
    ).toBe("203.0.113.7");
  });

  it("ignores x-forwarded-for unless trusted (it is client-writable)", () => {
    expect(resolveClientIp({ forwardedFor: "198.51.100.1", socketIp: "10.0.0.1" })).toBe(
      "10.0.0.1",
    );
  });

  it("uses the leftmost x-forwarded-for entry when trusted (local dev)", () => {
    expect(
      resolveClientIp({
        forwardedFor: "198.51.100.1, 10.0.0.2",
        socketIp: "127.0.0.1",
        trustForwardedFor: true,
      }),
    ).toBe("198.51.100.1");
  });

  it("falls through invalid values to the socket address", () => {
    expect(
      resolveClientIp({
        netlifyClientIp: "garbage",
        forwardedFor: "also garbage",
        socketIp: "::ffff:127.0.0.1",
        trustForwardedFor: true,
      }),
    ).toBe("127.0.0.1");
  });

  it("returns null when nothing is known", () => {
    expect(resolveClientIp({})).toBeNull();
  });
});
