import { ConvexHttpClient } from "convex/browser";
import { computed } from "vue";
import { api } from "~~/convex/_generated/api";
import { getAuthClient } from "~/lib/authClient";
import { roleFromProfile, type StaffRole } from "~/lib/authGuard";

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
   * The caller's active Salus role from `profiles.me`, `null` without an
   * active profile (signed out, no profile, or removed).
   *
   * Uses a one-off HTTP client with a freshly fetched Convex token rather
   * than `$convex`: the shared client only picks up the token once the
   * reactive session store has loaded, which may be after the route guard
   * runs, and would then answer as signed out.
   */
  async function fetchRole(): Promise<StaffRole | null> {
    const { data } = await client.convex.token();
    if (!data?.token) return null;
    const http = new ConvexHttpClient(convexUrl);
    http.setAuth(data.token);
    return roleFromProfile(await http.query(api.profiles.me, {}));
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
