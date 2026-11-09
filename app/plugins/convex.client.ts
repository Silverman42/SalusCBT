import { ConvexClient } from "convex/browser";
import { watch } from "vue";
import { clearAuthCaches, getAuthClient, getTokenCache } from "~/lib/authClient";

/**
 * The browser's Convex client, as `useNuxtApp().$convex` (LLD §2: a thin
 * `ConvexClient` wrapper; `useConvex*` composables come with T-212).
 *
 * Students stay anonymous, so nothing auth-related runs on their pages.
 * `useAuth()` calls `$connectConvexAuth()` (staff pages, sign-in), which
 * makes the client authenticate with the Convex JWT that Better Auth's
 * Convex plugin issues at `/api/auth/convex/token`, through the same-origin
 * proxy.
 */
export default defineNuxtPlugin(() => {
  const convex = new ConvexClient(useRuntimeConfig().public.convexUrl);
  let connected = false;

  function connectConvexAuth() {
    if (connected) return;
    connected = true;
    const auth = getAuthClient();
    // Shared with the route guard, so a page load fetches the JWT once.
    // Convex asks for a forced refresh when the server rejects the token.
    const tokens = getTokenCache();
    const fetchToken = ({ forceRefreshToken }: { forceRefreshToken: boolean }) =>
      tokens.get(forceRefreshToken);

    // ConvexClient asks for a token only when setAuth is called, so call it
    // again whenever the Better Auth session changes (sign-in, sign-out, user
    // switch). Without this, queries stay unauthenticated after sign-in
    // (LLD §18.1 finding 2).
    const session = auth.useSession();
    let lastId: string | null = null;
    watch(
      () => session.value.data?.session.id ?? null,
      (id) => {
        // A different session (or none) makes cached tokens and roles stale.
        if (id !== lastId && lastId !== null) clearAuthCaches();
        lastId = id;
        if (id) convex.setAuth(fetchToken);
        else convex.client.clearAuth();
      },
      { immediate: true },
    );
  }

  return { provide: { convex, connectConvexAuth } };
});
