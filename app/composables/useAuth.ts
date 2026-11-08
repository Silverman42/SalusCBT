import { computed } from "vue";
import { getAuthClient } from "~/lib/authClient";
import type { StaffRole } from "~/lib/authGuard";

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
  // Point the Convex client at this session (idempotent).
  useNuxtApp().$connectConvexAuth();

  const isPending = computed(() => session.value.isPending);
  const isSignedIn = computed(() => Boolean(session.value.data?.session));
  const user = computed(() => session.value.data?.user ?? null);

  /**
   * Ask for a sign-in code. Always resolves the same way whether or not the
   * email has an account (no enumeration); `error` is set only for a
   * malformed request or a rate limit.
   */
  function sendCode(email: string) {
    return client.emailOtp.sendVerificationOtp({ email, type: "sign-in" });
  }

  /** Exchange a code for a session; sets the session cookie on success. */
  function verifyCode(email: string, otp: string) {
    return client.signIn.emailOtp({ email, otp });
  }

  function signOut() {
    return client.signOut();
  }

  /** The current session, fetched from the server (not the cached store). */
  async function fetchSession() {
    const { data } = await client.getSession();
    return data ?? null;
  }

  /**
   * The caller's active Salus role, `null` without an active profile.
   *
   * SEAM(T-404): there is no `profiles.me` query yet, so the role is
   * unknown (`undefined`) and the route guards let any signed-in user
   * through. Once T-404 adds it, query it here through the Convex client
   * (`useNuxtApp().$convex.query(api.profiles.me, {})`) and map the result.
   */
  async function fetchRole(): Promise<StaffRole | null | undefined> {
    return undefined;
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
  };
}
