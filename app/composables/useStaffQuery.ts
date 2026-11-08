import type { FunctionArgs, FunctionReference, FunctionReturnType } from "convex/server";
import { computed, onScopeDispose, shallowRef, watch } from "vue";
import { useAuth } from "~/composables/useAuth";
import { isSessionError } from "~/lib/admin";
import { SIGN_IN_PATH } from "~/lib/authGuard";

/**
 * A live Convex query for tutor and admin pages (browser only).
 *
 * Calls `useAuth()` so the shared `$convex` client authenticates with the
 * Better Auth session, and subscribes only once that session has loaded, so
 * the first result isn't an `UNAUTHENTICATED` from an anonymous socket. If
 * the server says the session has ended or lost its role (a removed tutor,
 * a sign-out elsewhere), it sends the user to sign in.
 */
export function useStaffQuery<Q extends FunctionReference<"query">>(
  query: Q,
  args: FunctionArgs<Q>,
) {
  const { $convex } = useNuxtApp();
  const auth = useAuth();
  const route = useRoute();

  const data = shallowRef<FunctionReturnType<Q> | undefined>(undefined);
  const error = shallowRef<Error | null>(null);
  const ready = computed(() => !auth.isPending.value && auth.isSignedIn.value);
  let unsubscribe: (() => void) | null = null;

  function stop() {
    unsubscribe?.();
    unsubscribe = null;
  }

  watch(
    ready,
    (isReady) => {
      stop();
      if (!isReady) return;
      unsubscribe = $convex.onUpdate(
        query,
        args,
        (result) => {
          data.value = result;
          error.value = null;
        },
        (err) => {
          error.value = err;
          if (isSessionError(err)) {
            void navigateTo(`${SIGN_IN_PATH}?redirect=${encodeURIComponent(route.fullPath)}`, {
              replace: true,
            });
          }
        },
      );
    },
    { immediate: true },
  );

  onScopeDispose(stop);

  const loading = computed(() => data.value === undefined && error.value === null);
  return { data, error, loading };
}
