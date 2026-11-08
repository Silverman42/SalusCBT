import { describe, expect, it } from "vitest";
import {
  CLASS_CODE_ALPHABET,
  CLASS_CODE_PATTERN,
  base64url,
  newClassCode,
  newPublicId,
  normaliseClassCode,
  randomToken,
  randomUint32,
  sha256Hex,
  timingSafeEqual,
} from "../../../convex/lib/codes";

describe("random tokens", () => {
  it("defaults to 43-char base64url (256 bits)", () => {
    const t = randomToken();
    expect(t).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(t);
  });

  it("share-link ids are 22-char base64url (128 bits)", () => {
    expect(newPublicId()).toMatch(/^[A-Za-z0-9_-]{22}$/);
  });

  it("base64url uses the URL-safe alphabet without padding", () => {
    expect(base64url(new Uint8Array([0xfb, 0xff]))).toBe("-_8");
  });

  it("randomUint32 is an unsigned 32-bit integer", () => {
    for (let i = 0; i < 100; i++) {
      const n = randomUint32();
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(0xffffffff);
    }
  });
});

describe("class codes", () => {
  it("alphabet has 32 symbols and no look-alikes", () => {
    expect(CLASS_CODE_ALPHABET).toHaveLength(32);
    expect(new Set(CLASS_CODE_ALPHABET).size).toBe(32);
    for (const c of "0O1I") expect(CLASS_CODE_ALPHABET).not.toContain(c);
  });

  it("generates SEC-XXXX codes from the alphabet", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const code = newClassCode();
      expect(code).toMatch(CLASS_CODE_PATTERN);
      expect(code.slice(4)).not.toMatch(/[01OI]/);
      seen.add(code);
    }
    expect(seen.size).toBeGreaterThan(490);
  });

  it("normalises input for lookup", () => {
    expect(normaliseClassCode(" sec-4k7q ")).toBe("SEC-4K7Q");
    expect(normaliseClassCode("sec - 4k 7q")).toBe("SEC-4K7Q");
  });
});

describe("sha256Hex", () => {
  it("matches known vectors", async () => {
    expect(await sha256Hex("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});

describe("timingSafeEqual", () => {
  it("compares equal and unequal strings", () => {
    expect(timingSafeEqual("secret", "secret")).toBe(true);
    expect(timingSafeEqual("secret", "secreT")).toBe(false);
    expect(timingSafeEqual("secret", "secret!")).toBe(false);
    expect(timingSafeEqual("", "")).toBe(true);
    expect(timingSafeEqual("", "a")).toBe(false);
    expect(timingSafeEqual("é", "é")).toBe(false);
  });
});
