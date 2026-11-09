import { clearAuthCaches } from "~/lib/authClient";
import { ref } from "vue";
import { adminErrorMessage, isSessionError, type AdminAction } from "~/lib/admin";
import { SIGN_IN_PATH } from "~/lib/authGuard";

/**
 * Runs one admin mutation with a busy flag, a toast for the outcome, and a
 * trip to sign-in when the session has ended. `run` resolves to the
 * mutation's result, or `null` when it failed (the error toast is shown).
 */
export function useAdminAction() {
  const toast = useToast();
  const route = useRoute();
  const busy = ref(false);

  async function run<T>(
    action: AdminAction,
    call: () => Promise<T>,
    success?: (result: T) => string,
  ): Promise<T | null> {
    if (busy.value) return null;
    busy.value = true;
    try {
      const result = await call();
      if (success) {
        toast.add({ title: success(result), color: "success", icon: "i-lucide-circle-check" });
      }
      return result;
    } catch (err) {
      toast.add({
        title: adminErrorMessage(err, action),
        color: "error",
        icon: "i-lucide-circle-alert",
      });
      if (isSessionError(err)) {
        clearAuthCaches();
        await navigateTo(`${SIGN_IN_PATH}?redirect=${encodeURIComponent(route.fullPath)}`, {
          replace: true,
        });
      }
      return null;
    } finally {
      busy.value = false;
    }
  }

  return { busy, run };
}
