/**
 * Random tokens, class codes, hashing and constant-time comparison
 * (LLD §4, §7.1, §9.3, PRD CL-1).
 *
 * Uses Web Crypto only, which the default Convex runtime provides in queries,
 * mutations and actions (no "use node" needed).
 */

/** Class code alphabet: digits and capitals without the look-alikes 0/O and 1/I (CL-1). */
export const CLASS_CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CLASS_CODE_PREFIX = "SEC-";
export const CLASS_CODE_LENGTH = 4;
export const CLASS_CODE_PATTERN = new RegExp(
  `^${CLASS_CODE_PREFIX}[${CLASS_CODE_ALPHABET}]{${CLASS_CODE_LENGTH}}$`,
);

export function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Random base64url token. 32 bytes (the default) gives 43 characters / 256 bits. */
export function randomToken(bytes = 32): string {
  return base64url(randomBytes(bytes));
}

/** Share-link id: 128-bit random, 22 base64url characters (LLD §3.1 `shareLinks.publicId`). */
export function newPublicId(): string {
  return randomToken(16);
}

/** Random uint32, e.g. `attempts.shuffleSeed` (LLD §7.1 step 6). */
export function randomUint32(): number {
  return new Uint32Array(randomBytes(4).buffer)[0] as number;
}

/**
 * A new class code such as `SEC-4K7Q`. The alphabet has 32 symbols, so each
 * byte is masked to 5 bits with no modulo bias. 32^4 ≈ 1M codes: callers must
 * check `classes.by_code` and retry on a collision.
 */
export function newClassCode(): string {
  let code = CLASS_CODE_PREFIX;
  for (const b of randomBytes(CLASS_CODE_LENGTH)) code += CLASS_CODE_ALPHABET[b & 31];
  return code;
}

/** Normalise user input for a `by_code` lookup: upper-case, remove whitespace (LLD §7.1 step 4). */
export function normaliseClassCode(input: string): string {
  return input.toUpperCase().replace(/\s+/g, "");
}

/** SHA-256 of the UTF-8 text, lower-case hex. Used for anon keys and invitation token hashes. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Compare two secrets without an early exit on the first differing byte.
 * The length is not hidden; every secret we compare has a fixed, public length.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}
