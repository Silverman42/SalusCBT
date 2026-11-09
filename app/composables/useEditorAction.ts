import { clearAuthCaches } from "~/lib/authClient";
import { ref } from "vue";
import { isSessionError } from "~/lib/admin";
import { SIGN_IN_PATH } from "~/lib/authGuard";
import { editorErrorMessage, type EditorAction } from "~/lib/editor";

/**
 * One question-editor mutation with a busy flag, a toast for the outcome and
 * a trip to sign-in when the session has ended (like `useAdminAction`, with
 * editor wording). `run` resolves to the result, or `null` when it failed;
 * `onError` sees the error first (e.g. to show field issues) and returns
 * `false` to skip the error toast.
 */
export function useEditorAction() {
  const toast = useToast();
  const route = useRoute();
  const busy = ref(false);

  async function run<T>(
    action: EditorAction,
    call: () => Promise<T>,
    options: { success?: (result: T) => string; onError?: (err: unknown) => boolean } = {},
  ): Promise<T | null> {
    if (busy.value) return null;
    busy.value = true;
    try {
      const result = await call();
      if (options.success) {
        toast.add({
          title: options.success(result),
          color: "success",
          icon: "i-lucide-circle-check",
        });
      }
      return result;
    } catch (err) {
      const toastIt = options.onError?.(err) !== false;
      if (toastIt || isSessionError(err)) {
        toast.add({
          title: editorErrorMessage(err, action),
          color: "error",
          icon: "i-lucide-circle-alert",
        });
      }
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
