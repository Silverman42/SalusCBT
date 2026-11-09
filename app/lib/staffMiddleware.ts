import type { RouteLocationNormalized } from "vue-router";
import { navigateTo } from "#imports";
import { useAuth } from "~/composables/useAuth";
import { staffGuardRedirect, type StaffRole } from "~/lib/authGuard";

/**
 * Shared body of `middleware/tutor.ts` and `middleware/admin.ts`. Runs in
 * the browser only: those routes are `ssr: false` (nuxt.config.ts).
 */
export function staffMiddleware(required: StaffRole) {
  return async (to: RouteLocationNormalized) => {
    if (import.meta.server) return;
    const auth = useAuth();
    let signedIn: boolean;
    let role: StaffRole | null | undefined;
    try {
      // Cached for a few minutes after a pass; UX only (Convex re-checks every call).
      ({ signedIn, role } = await auth.checkAccess());
    } catch {
      // Network or server trouble: treat as signed out; sign-in shows the error.
      signedIn = false;
    }
    const redirect = staffGuardRedirect({ required, signedIn, role, path: to.fullPath });
    if (redirect) return navigateTo(redirect, { replace: true });
  };
}
