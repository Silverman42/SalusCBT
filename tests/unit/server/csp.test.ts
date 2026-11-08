import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COLOR_MODE_TRANSITION_STYLE,
  CONVEX_CLOUD_FALLBACK,
  STATIC_STYLE_HASHES,
  connectSrc,
  convexConnectSources,
  cspHash,
  hashInlineTags,
  usesHashedCsp,
} from "../../../server/utils/csp";

const sha = (s: string) => `'sha256-${createHash("sha256").update(s).digest("base64")}'`;

describe("convexConnectSources", () => {
  it("allows the deployment over https and wss", () => {
    expect(convexConnectSources("https://happy-otter-123.convex.cloud")).toEqual([
      "https://happy-otter-123.convex.cloud",
      "wss://happy-otter-123.convex.cloud",
    ]);
  });

  it("keeps the region in the host and drops any path", () => {
    expect(convexConnectSources("https://a-b-1.ap-southeast-2.convex.cloud/x?y=1")).toEqual([
      "https://a-b-1.ap-southeast-2.convex.cloud",
      "wss://a-b-1.ap-southeast-2.convex.cloud",
    ]);
  });

  it("uses ws for a local http backend", () => {
    expect(convexConnectSources("http://127.0.0.1:3210")).toEqual([
      "http://127.0.0.1:3210",
      "ws://127.0.0.1:3210",
    ]);
  });

  it("falls back to *.convex.cloud when missing or invalid", () => {
    expect(convexConnectSources(undefined)).toEqual(CONVEX_CLOUD_FALLBACK);
    expect(convexConnectSources("")).toEqual(CONVEX_CLOUD_FALLBACK);
    expect(convexConnectSources("not a url")).toEqual(CONVEX_CLOUD_FALLBACK);
    expect(convexConnectSources("javascript:alert(1)")).toEqual(CONVEX_CLOUD_FALLBACK);
  });

  it("connectSrc puts 'self' first", () => {
    expect(connectSrc("https://x.convex.cloud")).toEqual([
      "'self'",
      "https://x.convex.cloud",
      "wss://x.convex.cloud",
    ]);
  });
});

describe("usesHashedCsp", () => {
  it("matches share pages only", () => {
    expect(usesHashedCsp("/r/abc")).toBe(true);
    expect(usesHashedCsp("/r/abc?x=1")).toBe(true);
    expect(usesHashedCsp("/r")).toBe(false);
    expect(usesHashedCsp("/results")).toBe(false);
    expect(usesHashedCsp("/")).toBe(false);
    expect(usesHashedCsp("/exam/r/x")).toBe(false);
  });
});

describe("hashInlineTags", () => {
  it("hashes inline executable scripts, import maps and styles", () => {
    const head = [
      '<script type="importmap">{"imports":{}}</script>',
      '<script type="module" src="/_nuxt/entry.js" crossorigin></script>',
      '<style id="nuxt-ui-colors">:root{--a:1}</style>',
    ].join("");
    const bodyAppend = [
      '<script type="application/json" id="__NUXT_DATA__">[1]</script>',
      "<script>window.__NUXT__={}</script>",
    ].join("");
    expect(hashInlineTags([head, bodyAppend])).toEqual({
      scripts: [sha('{"imports":{}}'), sha("window.__NUXT__={}")],
      styles: [sha(":root{--a:1}")],
    });
  });

  it("skips external, empty and data scripts, and dedupes", () => {
    const html =
      '<script src="/a.js"></script><script></script><script type="application/ld+json">{}</script>' +
      "<style></style><style>a{}</style><style>a{}</style>";
    expect(hashInlineTags([html])).toEqual({ scripts: [], styles: [sha("a{}")] });
  });

  it("treats a module script and single-quoted types as executable", () => {
    const html =
      "<script type='module'>import('/x')</script><script type=text/javascript>1</script>";
    expect(hashInlineTags([html]).scripts).toEqual([sha("import('/x')"), sha("1")]);
  });

  it("cspHash matches the browser's sha256 source format", () => {
    expect(cspHash("x")).toBe(sha("x"));
  });
});

describe("STATIC_STYLE_HASHES", () => {
  it("matches the transition style in @nuxtjs/color-mode", () => {
    const file = new URL(
      "../../../node_modules/@nuxtjs/color-mode/dist/runtime/plugin.client.js",
      import.meta.url,
    );
    const source = readFileSync(file, "utf8");
    expect(source).toContain(JSON.stringify(COLOR_MODE_TRANSITION_STYLE));
    expect(STATIC_STYLE_HASHES).toEqual([sha(COLOR_MODE_TRANSITION_STYLE)]);
  });
});
