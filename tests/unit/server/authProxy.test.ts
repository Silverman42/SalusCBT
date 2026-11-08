import { describe, expect, it } from "vitest";
import {
  CLIENT_IP_HEADER,
  PROXY_SECRET_HEADER,
  authProxyTarget,
  buildProxyHeaders,
} from "../../../server/utils/authProxy";

const SITE = "https://blissful-spaniel-919.convex.site";
const APP = new URL("https://salus.example.app/api/auth/email-otp/send-verification-otp?x=1");

function build(
  incoming: Record<string, string>,
  extra: Partial<Parameters<typeof buildProxyHeaders>[0]> = {},
) {
  return buildProxyHeaders({
    incoming: new Headers(incoming),
    requestUrl: APP,
    convexSiteUrl: SITE,
    clientIp: "203.0.113.7",
    serverSecret: "s3cret",
    ...extra,
  });
}

describe("buildProxyHeaders", () => {
  it("keeps ordinary request headers, including cookies", () => {
    const h = build({
      cookie: "better-auth.session_token=abc",
      "content-type": "application/json",
      origin: "https://salus.example.app",
      "user-agent": "test",
    });
    expect(h.get("cookie")).toBe("better-auth.session_token=abc");
    expect(h.get("content-type")).toBe("application/json");
    expect(h.get("origin")).toBe("https://salus.example.app");
    expect(h.get("user-agent")).toBe("test");
  });

  it("drops hop-by-hop headers and points host at the Convex site", () => {
    const h = build({
      host: "salus.example.app",
      connection: "keep-alive",
      "keep-alive": "timeout=5",
      "transfer-encoding": "chunked",
      "content-length": "42",
      upgrade: "websocket",
      te: "trailers",
    });
    expect(h.get("host")).toBe("blissful-spaniel-919.convex.site");
    for (const name of [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "content-length",
      "upgrade",
      "te",
    ]) {
      expect(h.has(name)).toBe(false);
    }
    expect(h.get("accept-encoding")).toBe("application/json");
  });

  it("sends the browser origin only in x-better-auth-forwarded-*", () => {
    const h = build({
      "x-forwarded-host": "evil.example",
      "x-forwarded-proto": "http",
      "x-forwarded-for": "198.51.100.1",
      "x-better-auth-forwarded-host": "evil.example",
    });
    expect(h.has("x-forwarded-host")).toBe(false);
    expect(h.has("x-forwarded-proto")).toBe(false);
    expect(h.has("x-forwarded-for")).toBe(false);
    expect(h.get("x-better-auth-forwarded-host")).toBe("salus.example.app");
    expect(h.get("x-better-auth-forwarded-proto")).toBe("https");
  });

  it("replaces client-supplied x-salus-* headers with trusted values", () => {
    const h = build({
      [CLIENT_IP_HEADER]: "1.2.3.4",
      [PROXY_SECRET_HEADER]: "guess",
      "X-Salus-Anything": "x",
    });
    expect(h.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
    expect(h.get(PROXY_SECRET_HEADER)).toBe("s3cret");
    expect(h.has("x-salus-anything")).toBe(false);
  });

  it("drops other client-IP headers a browser could set", () => {
    const h = build({
      forwarded: "for=1.2.3.4",
      "x-real-ip": "1.2.3.4",
      "true-client-ip": "1.2.3.4",
      "cf-connecting-ip": "1.2.3.4",
      "x-nf-client-connection-ip": "1.2.3.4",
    });
    for (const name of [
      "forwarded",
      "x-real-ip",
      "true-client-ip",
      "cf-connecting-ip",
      "x-nf-client-connection-ip",
    ]) {
      expect(h.has(name)).toBe(false);
    }
  });

  it("omits the IP header when no IP is known, and never forwards the client's", () => {
    const h = build({ [CLIENT_IP_HEADER]: "1.2.3.4" }, { clientIp: null });
    expect(h.has(CLIENT_IP_HEADER)).toBe(false);
  });

  it("omits the secret header when no secret is configured", () => {
    const h = build({ [PROXY_SECRET_HEADER]: "guess" }, { serverSecret: "" });
    expect(h.has(PROXY_SECRET_HEADER)).toBe(false);
    expect(h.get(CLIENT_IP_HEADER)).toBe("203.0.113.7");
  });

  it("uses the header names convex/lib/clientIp.ts reads", () => {
    expect(CLIENT_IP_HEADER).toBe("x-salus-client-ip");
    expect(PROXY_SECRET_HEADER).toBe("x-salus-proxy-secret");
  });
});

describe("authProxyTarget", () => {
  it("keeps the path and query", () => {
    expect(authProxyTarget(APP, SITE)).toBe(`${SITE}/api/auth/email-otp/send-verification-otp?x=1`);
  });

  it("tolerates a trailing slash on the site URL", () => {
    expect(authProxyTarget(new URL("http://localhost:3000/api/auth/get-session"), `${SITE}/`)).toBe(
      `${SITE}/api/auth/get-session`,
    );
  });

  it("refuses paths outside /api/auth/", () => {
    expect(authProxyTarget(new URL("http://localhost:3000/api/authx"), SITE)).toBeNull();
    expect(authProxyTarget(new URL("http://localhost:3000/api/auth/../attempts"), SITE)).toBeNull();
    expect(authProxyTarget(new URL("http://localhost:3000/other"), SITE)).toBeNull();
  });
});
