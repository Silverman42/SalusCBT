import { describe, expect, it, vi } from "vitest";
import {
  ACCESS_STORAGE_KEY,
  ACCESS_TTL_MS,
  AccessCache,
  TOKEN_FALLBACK_TTL_MS,
  TOKEN_REFRESH_MARGIN_MS,
  TokenCache,
  jwtExpiryMs,
} from "../../app/lib/staffAuthCache";

function jwt(payload: object): string {
  const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${b64('{"alg":"RS256"}')}.${b64(JSON.stringify(payload))}.sig`;
}

describe("jwtExpiryMs", () => {
  it("reads exp in milliseconds", () => {
    expect(jwtExpiryMs(jwt({ exp: 1_800_000_000 }))).toBe(1_800_000_000_000);
  });
  it("returns null for junk or a missing exp", () => {
    expect(jwtExpiryMs("nope")).toBeNull();
    expect(jwtExpiryMs("a.%%%.c")).toBeNull();
    expect(jwtExpiryMs(jwt({ sub: "x" }))).toBeNull();
  });
});

describe("TokenCache", () => {
  it("fetches once and reuses the token until shortly before it expires", async () => {
    let now = 1_000_000;
    const token = jwt({ exp: (now + 15 * 60_000) / 1000 });
    const fetch = vi.fn(async () => token);
    const cache = new TokenCache(fetch, () => now);
    expect(await cache.get()).toBe(token);
    expect(await cache.get()).toBe(token);
    expect(fetch).toHaveBeenCalledTimes(1);
    now += 15 * 60_000 - TOKEN_REFRESH_MARGIN_MS; // inside the margin
    await cache.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent callers", async () => {
    let resolve!: (t: string) => void;
    const fetch = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const cache = new TokenCache(fetch, () => 0);
    const both = Promise.all([cache.get(), cache.get()]);
    resolve(jwt({ exp: 10_000 }));
    const [a, b] = await both;
    expect(a).toBe(b);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refetches when forced (Convex rejected the token)", async () => {
    const fetch = vi.fn(async () => jwt({ exp: 10_000 }));
    const cache = new TokenCache(fetch, () => 0);
    await cache.get();
    await cache.get(true);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("doesn't cache a missing token (signed out)", async () => {
    const fetch = vi.fn(async () => null);
    const cache = new TokenCache(fetch, () => 0);
    expect(await cache.get()).toBeNull();
    await cache.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps a token without exp only briefly", async () => {
    let now = 0;
    const fetch = vi.fn(async () => "opaque");
    const cache = new TokenCache(fetch, () => now);
    await cache.get();
    now = TOKEN_FALLBACK_TTL_MS - 1;
    await cache.get();
    expect(fetch).toHaveBeenCalledTimes(1);
    now = TOKEN_FALLBACK_TTL_MS;
    await cache.get();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("clear() drops the token and ignores a request already in flight", async () => {
    let resolve!: (t: string) => void;
    const fetch = vi
      .fn<() => Promise<string>>()
      .mockImplementationOnce(() => new Promise((r) => (resolve = r)))
      .mockImplementation(async () => "fresh");
    const cache = new TokenCache(fetch, () => 0);
    const stale = cache.get();
    cache.clear();
    resolve("stale");
    await stale;
    expect(await cache.get()).toBe("fresh");
  });

  it("forgets a failed request so the next call retries", async () => {
    const fetch = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValue(jwt({ exp: 10_000 }));
    const cache = new TokenCache(fetch, () => 0);
    await expect(cache.get()).rejects.toThrow("offline");
    expect(await cache.get()).toBeTruthy();
  });
});

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    map,
  };
}

describe("AccessCache", () => {
  it("returns the role only for the same session, within the TTL", () => {
    let now = 0;
    const cache = new AccessCache(null, ACCESS_TTL_MS, () => now);
    cache.set("s1", "tutor");
    expect(cache.get("s1")).toBe("tutor");
    expect(cache.get("s2")).toBeNull();
    now = ACCESS_TTL_MS - 1;
    expect(cache.get("s1")).toBe("tutor");
    now = ACCESS_TTL_MS;
    expect(cache.get("s1")).toBeNull();
  });

  it("never caches a missing role", () => {
    const cache = new AccessCache();
    cache.set("s1", "admin");
    cache.set("s1", null);
    expect(cache.get("s1")).toBeNull();
  });

  it("survives a reload through storage, and clear() removes it", () => {
    const storage = memoryStorage();
    new AccessCache(storage, ACCESS_TTL_MS, () => 0).set("s1", "admin");
    expect(storage.map.has(ACCESS_STORAGE_KEY)).toBe(true);
    const reloaded = new AccessCache(storage, ACCESS_TTL_MS, () => 1000);
    expect(reloaded.get("s1")).toBe("admin");
    reloaded.clear();
    expect(storage.map.has(ACCESS_STORAGE_KEY)).toBe(false);
  });

  it("ignores junk in storage and works when storage throws", () => {
    const junk = memoryStorage();
    junk.setItem(ACCESS_STORAGE_KEY, '{"sessionId":"s1","role":"root","at":0}');
    expect(new AccessCache(junk).get("s1")).toBeNull();
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    const cache = new AccessCache(broken, ACCESS_TTL_MS, () => 0);
    cache.set("s1", "tutor");
    expect(cache.get("s1")).toBe("tutor");
    cache.clear();
    expect(cache.get("s1")).toBeNull();
  });
});
