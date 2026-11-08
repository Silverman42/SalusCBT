import { ConvexClient } from "convex/browser";
import { watch } from "vue";
import { getAuthClient } from "~/lib/authClient";

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
    const fetchToken = async () => {
      const { data } = await auth.convex.token();
      return data?.token ?? null;
    };

    // ConvexClient asks for a token only when setAuth is called, so call it
    // again whenever the Better Auth session changes (sign-in, sign-out, user
    // switch). Without this, queries stay unauthenticated after sign-in
    // (LLD §18.1 finding 2).
    const session = auth.useSession();
    watch(
      () => session.value.data?.session.id ?? null,
      (id) => {
        if (id) convex.setAuth(fetchToken);
        else convex.client.clearAuth();
      },
      { immediate: true },
    );
  }

  return { provide: { convex, connectConvexAuth } };
});
