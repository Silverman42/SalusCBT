/**
 * Anonymous student identity (LLD §4, HLD D4, PRD EX-20 / PR-1 / SE-3).
 *
 * Plain TypeScript with no Nuxt or DOM dependencies so it can be unit-tested
 * in node. `app/composables/useAnonIdentity.ts` is a thin wrapper over this.
 */

export const STORAGE_KEY = "salus.anon.v1";
export const EXPORT_FILENAME = "salus-progress.json";
export const EXPORT_VERSION = 1;
export const TOKEN_BYTES = 32;
export const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const DISPLAY_NAME_MAX = 40;
/** A valid export is ~150 bytes; anything far larger is not ours. */
export const IMPORT_MAX_BYTES = 4 * 1024;

export interface StoredIdentity {
  token: string;
  displayName?: string;
  createdAt: number;
}

export interface ProgressExport {
  v: typeof EXPORT_VERSION;
  token: string;
  displayName: string | null;
  exportedAt: string;
}

export interface IdentityState extends StoredIdentity {
  /** false when localStorage is blocked: the token lasts for this tab only. */
  persistent: boolean;
}

/** Minimal subset of the Web Storage API we use; easy to mock. */
export type StorageLike = Pick<Storage, "getItem" | "setItem">;

type RandomSource = Pick<Crypto, "getRandomValues">;

export function base64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** 32 random bytes, base64url without padding (43 characters). */
export function generateToken(rng: RandomSource = globalThis.crypto): string {
  const bytes = new Uint8Array(TOKEN_BYTES);
  rng.getRandomValues(bytes);
  return base64url(bytes);
}

export function isValidToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN_PATTERN.test(value);
}

function normaliseDisplayName(value: unknown): string | undefined | null {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length > DISPLAY_NAME_MAX) return null;
  return trimmed === "" ? undefined : trimmed;
}

function parseStored(raw: string | null): StoredIdentity | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (!data || typeof data !== "object" || !isValidToken(data.token)) return null;
    const displayName = normaliseDisplayName(data.displayName);
    const createdAt = typeof data.createdAt === "number" ? data.createdAt : Date.now();
    return { token: data.token, createdAt, ...(displayName ? { displayName } : {}) };
  } catch {
    return null;
  }
}

/** Write the identity; returns false if storage is unavailable or throws. */
export function saveIdentity(storage: StorageLike | null | undefined, id: StoredIdentity): boolean {
  if (!storage) return false;
  try {
    const value: StoredIdentity = { token: id.token, createdAt: id.createdAt };
    if (id.displayName) value.displayName = id.displayName;
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the stored identity or create one. If storage is missing or throws,
 * a fresh session-only token is returned with `persistent: false`.
 */
export function loadOrCreateIdentity(
  storage: StorageLike | null | undefined,
  opts: { rng?: RandomSource; now?: () => number } = {},
): IdentityState {
  const now = opts.now ?? Date.now;
  let existing: StoredIdentity | null = null;
  let readable = !!storage;
  if (storage) {
    try {
      existing = parseStored(storage.getItem(STORAGE_KEY));
    } catch {
      readable = false;
    }
  }
  if (existing) return { ...existing, persistent: true };

  const fresh: StoredIdentity = { token: generateToken(opts.rng), createdAt: now() };
  const persistent = readable && saveIdentity(storage, fresh);
  return { ...fresh, persistent };
}

export function buildExport(
  id: Pick<StoredIdentity, "token" | "displayName">,
  now: Date = new Date(),
): ProgressExport {
  return {
    v: EXPORT_VERSION,
    token: id.token,
    displayName: id.displayName ?? null,
    exportedAt: now.toISOString(),
  };
}

export function serializeExport(data: ProgressExport): string {
  return JSON.stringify(data, null, 2);
}

export type ImportResult =
  | { ok: true; value: { token: string; displayName?: string; exportedAt?: string } }
  | { ok: false; error: string };

export const IMPORT_ERRORS = {
  tooLarge: "This file is too large to be a Salus progress file.",
  notJson: "This file is not a valid Salus progress file (it could not be read as JSON).",
  notObject: "This file is not a valid Salus progress file.",
  version: "This progress file is from an unsupported version of Salus.",
  token: "This progress file does not contain a valid anonymous ID.",
  displayName: `The display name in this file is invalid (it must be text of at most ${DISPLAY_NAME_MAX} characters).`,
} as const;

/** Parse and validate the text of a `salus-progress.json` file. */
export function parseImport(text: string): ImportResult {
  if (new TextEncoder().encode(text).length > IMPORT_MAX_BYTES) {
    return { ok: false, error: IMPORT_ERRORS.tooLarge };
  }
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: IMPORT_ERRORS.notJson };
  }
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return { ok: false, error: IMPORT_ERRORS.notObject };
  }
  const obj = data as Record<string, unknown>;
  if (obj.v !== EXPORT_VERSION) return { ok: false, error: IMPORT_ERRORS.version };
  if (!isValidToken(obj.token)) return { ok: false, error: IMPORT_ERRORS.token };
  const displayName = normaliseDisplayName(obj.displayName);
  if (displayName === null) return { ok: false, error: IMPORT_ERRORS.displayName };
  const exportedAt = typeof obj.exportedAt === "string" ? obj.exportedAt : undefined;
  return {
    ok: true,
    value: {
      token: obj.token,
      ...(displayName ? { displayName } : {}),
      ...(exportedAt ? { exportedAt } : {}),
    },
  };
}
