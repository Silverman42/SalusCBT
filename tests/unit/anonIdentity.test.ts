import { describe, expect, it } from "vitest";
import {
  DISPLAY_NAME_MAX,
  IMPORT_ERRORS,
  IMPORT_MAX_BYTES,
  STORAGE_KEY,
  buildExport,
  generateToken,
  loadOrCreateIdentity,
  parseImport,
  saveIdentity,
  serializeExport,
  type StorageLike,
} from "../../app/lib/anonIdentity";

function memoryStorage(): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, String(v)),
  };
}

const blocked: StorageLike = {
  getItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
  setItem: () => {
    throw new DOMException("blocked", "SecurityError");
  },
};

const VALID = "A".repeat(42) + "_";

describe("generateToken", () => {
  it("is 43 base64url chars without padding", () => {
    for (let i = 0; i < 50; i++) expect(generateToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("encodes 32 bytes using - and _", () => {
    const rng = {
      getRandomValues: <T extends ArrayBufferView | null>(a: T) => (
        new Uint8Array(a!.buffer).fill(0xff),
        a
      ),
    };
    expect(generateToken(rng as Crypto)).toBe("_".repeat(42) + "8");
  });

  it("is random", () => {
    expect(generateToken()).not.toBe(generateToken());
  });
});

describe("loadOrCreateIdentity", () => {
  it("creates, persists and reloads the same token", () => {
    const s = memoryStorage();
    const first = loadOrCreateIdentity(s, { now: () => 123 });
    expect(first.persistent).toBe(true);
    expect(JSON.parse(s.data.get(STORAGE_KEY)!)).toEqual({ token: first.token, createdAt: 123 });
    const second = loadOrCreateIdentity(s);
    expect(second).toEqual(first);
  });

  it("round-trips displayName", () => {
    const s = memoryStorage();
    saveIdentity(s, { token: VALID, displayName: "Ada", createdAt: 1 });
    expect(loadOrCreateIdentity(s)).toEqual({
      token: VALID,
      displayName: "Ada",
      createdAt: 1,
      persistent: true,
    });
  });

  it("replaces corrupt stored data", () => {
    const s = memoryStorage();
    s.data.set(STORAGE_KEY, "{not json");
    const id = loadOrCreateIdentity(s);
    expect(id.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.parse(s.data.get(STORAGE_KEY)!).token).toBe(id.token);
  });

  it("falls back to a session-only token when storage throws", () => {
    const id = loadOrCreateIdentity(blocked);
    expect(id.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(id.persistent).toBe(false);
  });

  it("falls back when only setItem throws (e.g. quota)", () => {
    const s: StorageLike = { getItem: () => null, setItem: blocked.setItem };
    expect(loadOrCreateIdentity(s).persistent).toBe(false);
  });

  it("falls back when storage is unavailable", () => {
    const id = loadOrCreateIdentity(null);
    expect(id.persistent).toBe(false);
    expect(id.token).toHaveLength(43);
  });
});

describe("export", () => {
  it("has the documented shape", () => {
    const at = new Date("2026-11-08T10:00:00Z");
    expect(buildExport({ token: VALID, displayName: "Ada" }, at)).toEqual({
      v: 1,
      token: VALID,
      displayName: "Ada",
      exportedAt: "2026-11-08T10:00:00.000Z",
    });
    expect(buildExport({ token: VALID }, at).displayName).toBeNull();
  });

  it("round-trips through parseImport", () => {
    const text = serializeExport(buildExport({ token: VALID, displayName: "Ada" }));
    const r = parseImport(text);
    expect(r.ok && r.value.token).toBe(VALID);
    expect(r.ok && r.value.displayName).toBe("Ada");
  });
});

describe("parseImport", () => {
  const ok = (extra: object = {}) =>
    JSON.stringify({ v: 1, token: VALID, displayName: null, exportedAt: "x", ...extra });

  it("accepts a valid file", () => {
    expect(parseImport(ok())).toEqual({ ok: true, value: { token: VALID, exportedAt: "x" } });
  });

  it.each([
    ["malformed JSON", "{oops", IMPORT_ERRORS.notJson],
    ["non-object", "[1,2]", IMPORT_ERRORS.notObject],
    ["null", "null", IMPORT_ERRORS.notObject],
    ["wrong version", ok({ v: 2 }), IMPORT_ERRORS.version],
    ["missing version", JSON.stringify({ token: VALID }), IMPORT_ERRORS.version],
    ["short token", ok({ token: "abc" }), IMPORT_ERRORS.token],
    ["padded token", ok({ token: "A".repeat(42) + "=" }), IMPORT_ERRORS.token],
    ["non-string token", ok({ token: 42 }), IMPORT_ERRORS.token],
    [
      "long displayName",
      ok({ displayName: "x".repeat(DISPLAY_NAME_MAX + 1) }),
      IMPORT_ERRORS.displayName,
    ],
    ["non-string displayName", ok({ displayName: 5 }), IMPORT_ERRORS.displayName],
    ["oversize", ok({ pad: "x".repeat(IMPORT_MAX_BYTES) }), IMPORT_ERRORS.tooLarge],
  ])("rejects %s", (_name, text, error) => {
    expect(parseImport(text)).toEqual({ ok: false, error });
  });
});
