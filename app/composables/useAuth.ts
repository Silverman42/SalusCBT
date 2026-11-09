import { ConvexHttpClient } from "convex/browser";
import { computed, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import { clearAuthCaches, getAccessCache, getAuthClient, getTokenCache } from "~/lib/authClient";
import { roleFromProfile, type StaffRole } from "~/lib/authGuard";
import { parseRetryAfter } from "~/lib/signIn";

/**
 * Tutor and admin sign-in through Better Auth (LLD §9.1). Browser only.
 *
 * The session cookie is `HttpOnly` on the app's origin; the reactive
 * `session` is Better Auth's own store, refreshed after sign-in and
 * sign-out. The Convex client follows it once `useAuth` has been called
 * (`plugins/convex.client.ts`).
 */
export function useAuth() {
  const client = getAuthClient();
  const session = client.useSession();
  // Read now: `useRuntimeConfig` needs the Nuxt context, which is gone after
  // an `await` in the route middleware.
  const convexUrl = useRuntimeConfig().public.convexUrl;
  // Point the Convex client at this session (idempotent).
  useNuxtApp().$connectConvexAuth();

  const isPending = computed(() => session.value.isPending);
  const isSignedIn = computed(() => Boolean(session.value.data?.session));
  const user = computed(() => session.value.data?.user ?? null);

  /**
   * Ask for a sign-in code. Always resolves the same way whether or not the
   * email has an account (no enumeration); `error` is set only for a
   * malformed request or a rate limit. `retryAfterS` comes from the 429's
   * `X-Retry-After` header (seconds), else `null`.
   */
  async function sendCode(email: string) {
    let retryAfterS: number | null = null;
    const result = await client.emailOtp.sendVerificationOtp({
      email,
      type: "sign-in",
      fetchOptions: {
        onError: (ctx: { response: Response }) => {
          retryAfterS = parseRetryAfter(ctx.response.headers.get("X-Retry-After"));
        },
      },
    });
    return { ...result, retryAfterS };
  }

  /**
   * Exchange a code for a session; sets the session cookie on success.
   * `retryAfterS` as for `sendCode`.
   */
  async function verifyCode(email: string, otp: string) {
    let retryAfterS: number | null = null;
    clearAuthCaches(); // a new session replaces any cached token or role
    const result = await client.signIn.emailOtp({
      email,
      otp,
      fetchOptions: {
        onError: (ctx: { response: Response }) => {
          retryAfterS = parseRetryAfter(ctx.response.headers.get("X-Retry-After"));
        },
      },
    });
    return { ...result, retryAfterS };
  }

  async function signOut() {
    clearAuthCaches();
    try {
      return await client.signOut();
    } finally {
      clearAuthCaches();
    }
  }

  /** The current session, fetched from the server (not the cached store). */
  async function fetchSession() {
    const { data } = await client.getSession();
    return data ?? null;
  }

  /**
   * The caller's active Salus role from `profiles.me`, `null` without an
   * active profile (signed out, no profile, or removed).
   *
   * Uses a one-off HTTP client with a freshly fetched Convex token rather
   * than `$convex`: the shared client only picks up the token once the
   * reactive session store has loaded, which may be after the route guard
   * runs, and would then answer as signed out.
   */
  async function fetchRole(): Promise<StaffRole | null> {
    const token = await getTokenCache().get();
    if (!token) return null;
    return await roleWithToken(token);
  }

  async function roleWithToken(token: string): Promise<StaffRole | null> {
    const http = new ConvexHttpClient(convexUrl);
    http.setAuth(token);
    return roleFromProfile(await http.query(api.profiles.me, {}));
  }

  /** The loaded session id, waiting for Better Auth's store (it loads once per page). */
  function loadedSessionId(): Promise<string | null> {
    return new Promise((resolve) => {
      let done = false;
      const stop = watch(
        () => session.value,
        (s) => {
          if (done || s.isPending) return;
          done = true;
          resolve(s.data?.session.id ?? null);
          // With `immediate`, this can run before `stop` exists: stop afterwards.
          queueMicrotask(() => stop());
        },
        { immediate: true },
      );
    });
  }

  /**
   * Signed in, and with which role? For the staff route guard.
   *
   * "Signed in" comes from Better Auth's session store, which every page
   * loads once anyway (no extra request, and no 401 when signed out). The
   * role is cached per session (`AccessCache`, this tab's sessionStorage), so
   * navigations and reloads within a few minutes cost nothing more; a cold
   * check is one token request (shared with the Convex connection) plus
   * `profiles.me`.
   */
  async function checkAccess(): Promise<{ signedIn: boolean; role: StaffRole | null }> {
    const sessionId = await loadedSessionId();
    if (!sessionId) return { signedIn: false, role: null };
    const access = getAccessCache();
    const cached = access.get(sessionId);
    if (cached) return { signedIn: true, role: cached };
    const token = await getTokenCache().get();
    if (!token) return { signedIn: false, role: null };
    const role = await roleWithToken(token);
    access.set(sessionId, role);
    return { signedIn: true, role };
  }

  return {
    client,
    session,
    isPending,
    isSignedIn,
    user,
    sendCode,
    verifyCode,
    signOut,
    fetchSession,
    fetchRole,
    checkAccess,
  };
}
