/**
 * Client-side caches that keep staff page loads fast. Plain TypeScript (no
 * Nuxt), so they can be unit-tested.
 *
 * - `TokenCache` holds the Convex JWT from `/api/auth/convex/token` until
 *   shortly before it expires, and shares one in-flight request, so the route
 *   guard and the live Convex connection don't each fetch their own.
 * - `AccessCache` remembers the result of the staff route guard (signed in,
 *   role) for a few minutes, so moving between staff pages skips the checks.
 *
 * Both are UX only: every Convex function still checks the caller's role on
 * the server (SE-2), so a stale entry can at worst show a page whose queries
 * then fail and send the user to sign in.
 */

export type Clock = () => number;

/** Seconds-since-epoch `exp` from a JWT, or null if it can't be read. */
export function jwtExpiryMs(token: string): number | null {
  const part = token.split(".")[1];
  if (!part) return null;
  try {
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" && Number.isFinite(exp) ? exp * 1000 : null;
  } catch {
    return null;
  }
}

/** Refresh this long before the token's own expiry. */
export const TOKEN_REFRESH_MARGIN_MS = 60_000;
/** Cache a token without a readable `exp` this long at most. */
export const TOKEN_FALLBACK_TTL_MS = 60_000;

export class TokenCache {
  private token: string | null = null;
  private validUntil = 0;
  private inFlight: Promise<string | null> | null = null;
  private generation = 0;

  constructor(
    private readonly fetchToken: () => Promise<string | null>,
    private readonly now: Clock = Date.now,
  ) {}

  /** The cached token if still fresh, else a new one. `force` always refetches. */
  async get(force = false): Promise<string | null> {
    if (!force && this.token && this.now() < this.validUntil) return this.token;
    if (!force && this.inFlight) return this.inFlight;
    const generation = this.generation;
    const request = this.fetchToken().then(
      (token) => {
        // A clear() while this was in flight wins: don't store a stale token.
        if (generation === this.generation) {
          this.token = token;
          const exp = token ? jwtExpiryMs(token) : null;
          this.validUntil = token
            ? exp !== null
              ? exp - TOKEN_REFRESH_MARGIN_MS
              : this.now() + TOKEN_FALLBACK_TTL_MS
            : 0;
        }
        return token;
      },
      (err: unknown) => {
        if (generation === this.generation) this.clear();
        throw err;
      },
    );
    this.inFlight = request;
    const done = () => {
      if (this.inFlight === request) this.inFlight = null;
    };
    // Both branches handled, so a failure here isn't an unhandled rejection;
    // the caller still gets the error from `request`.
    request.then(done, done);
    return request;
  }

  clear(): void {
    this.generation += 1;
    this.token = null;
    this.validUntil = 0;
    this.inFlight = null;
  }
}

export type StaffRoleValue = "admin" | "tutor";

export interface AccessResult {
  signedIn: boolean;
  /** `null`: signed in without an active profile. */
  role: StaffRoleValue | null;
}

/** How long a passed guard check is trusted for later navigations. */
export const ACCESS_TTL_MS = 5 * 60_000;
export const ACCESS_STORAGE_KEY = "salus.staffAccess.v1";

/** Minimal Web Storage subset; `null` when storage is unavailable. */
export type AccessStorage = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

interface AccessEntry {
  sessionId: string;
  role: StaffRoleValue;
  at: number;
}

/**
 * The staff role for one Better Auth session, trusted for `ttlMs`. Kept in
 * `sessionStorage` (this tab only, gone when it closes) so a reload doesn't
 * repeat the check. Holds no secret: a session id and a role, which the
 * server checks again on every call.
 */
export class AccessCache {
  private entry: AccessEntry | null = null;

  constructor(
    private readonly storage: AccessStorage = null,
    private readonly ttlMs: number = ACCESS_TTL_MS,
    private readonly now: Clock = Date.now,
  ) {
    this.entry = this.load();
  }

  /** The cached role for this session if still fresh, else null. */
  get(sessionId: string): StaffRoleValue | null {
    const e = this.entry;
    if (!e || e.sessionId !== sessionId) return null;
    if (this.now() - e.at >= this.ttlMs) {
      this.clear();
      return null;
    }
    return e.role;
  }

  /** Remember a role; a missing role (no active profile) is never cached. */
  set(sessionId: string, role: StaffRoleValue | null): void {
    if (!role) return this.clear();
    this.entry = { sessionId, role, at: this.now() };
    try {
      this.storage?.setItem(ACCESS_STORAGE_KEY, JSON.stringify(this.entry));
    } catch {
      // Storage full or blocked: the in-memory entry still works.
    }
  }

  clear(): void {
    this.entry = null;
    try {
      this.storage?.removeItem(ACCESS_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  private load(): AccessEntry | null {
    try {
      const raw = this.storage?.getItem(ACCESS_STORAGE_KEY);
      if (!raw) return null;
      const e = JSON.parse(raw) as Partial<AccessEntry>;
      const roleOk = e.role === "admin" || e.role === "tutor";
      return typeof e.sessionId === "string" && roleOk && typeof e.at === "number"
        ? { sessionId: e.sessionId, role: e.role as StaffRoleValue, at: e.at }
        : null;
    } catch {
      return null;
    }
  }
}
