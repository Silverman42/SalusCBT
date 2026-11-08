import { describe, expect, it, vi } from "vitest";
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  ipRateLimitKey,
  secretsMatch,
  trustedClientIp,
} from "../../../convex/lib/clientIp";

const headers = (h: Record<string, string>) => new Headers(h);

describe("trustedClientIp (LLD §18.1 finding 4)", () => {
  it("uses the proxy's header when the shared secret matches", async () => {
    const h = headers({ [CLIENT_IP_HEADER]: "203.0.113.5", [PROXY_SECRET_HEADER]: "s3cret" });
    expect(await trustedClientIp(h, "192.0.2.1", "s3cret")).toBe("203.0.113.5");
  });

  it("falls back to the caller address on a wrong or missing secret", async () => {
    const wrong = headers({ [CLIENT_IP_HEADER]: "203.0.113.5", [PROXY_SECRET_HEADER]: "nope" });
    const missing = headers({ [CLIENT_IP_HEADER]: "203.0.113.5" });
    expect(await trustedClientIp(wrong, "192.0.2.1", "s3cret")).toBe("192.0.2.1");
    expect(await trustedClientIp(missing, "192.0.2.1", "s3cret")).toBe("192.0.2.1");
  });

  it("never trusts the header when SERVER_SECRET is unset, and says so once", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const h = headers({ [CLIENT_IP_HEADER]: "203.0.113.5", [PROXY_SECRET_HEADER]: "" });
    expect(await trustedClientIp(h, "192.0.2.1", undefined)).toBe("192.0.2.1");
    expect(await trustedClientIp(h, null, "")).toBeNull();
    expect(errors.mock.calls.length).toBeLessThanOrEqual(1);
    errors.mockRestore();
  });

  it("ignores a malformed header even with the right secret", async () => {
    for (const bad of ["1.2.3.4, 5.6.7.8", "not an ip", "", "x".repeat(60)]) {
      const h = headers({ [CLIENT_IP_HEADER]: bad, [PROXY_SECRET_HEADER]: "s3cret" });
      expect(await trustedClientIp(h, "192.0.2.1", "s3cret")).toBe("192.0.2.1");
    }
    const v6 = headers({ [CLIENT_IP_HEADER]: "2001:db8::1", [PROXY_SECRET_HEADER]: "s3cret" });
    expect(await trustedClientIp(v6, null, "s3cret")).toBe("2001:db8::1");
  });
});

describe("secretsMatch / ipRateLimitKey", () => {
  it("compares secrets exactly", async () => {
    expect(await secretsMatch("abc", "abc")).toBe(true);
    expect(await secretsMatch("abc", "abd")).toBe(false);
    expect(await secretsMatch("abc", "abcd")).toBe(false);
  });

  it("gives a stable opaque key per IP and secret", async () => {
    const a = await ipRateLimitKey("203.0.113.5", "k1");
    expect(a).toBe(await ipRateLimitKey("203.0.113.5", "k1"));
    expect(a).not.toContain("203.0.113.5");
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(await ipRateLimitKey("203.0.113.6", "k1"));
    expect(a).not.toBe(await ipRateLimitKey("203.0.113.5", "k2"));
  });
});
