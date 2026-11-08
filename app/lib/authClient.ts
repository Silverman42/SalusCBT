import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";

/** Path of the same-origin Better Auth proxy (`server/api/auth/[...].ts`). */
export const AUTH_BASE_PATH = "/api/auth";

function create() {
  return createAuthClient({
    // Better Auth needs an absolute URL; the path is always the app's own
    // origin, so cookies stay first-party (LLD §9.1).
    baseURL: `${window.location.origin}${AUTH_BASE_PATH}`,
    plugins: [emailOTPClient(), convexClient()],
  });
}

export type AuthClient = ReturnType<typeof create>;

let client: AuthClient | null = null;

/**
 * The browser's Better Auth client (one per page load). Browser only: staff
 * pages and the sign-in page render client-side (`routeRules` in
 * nuxt.config.ts), and the session cookie is `HttpOnly`.
 */
export function getAuthClient(): AuthClient {
  if (typeof window === "undefined") {
    throw new Error("The auth client is only available in the browser.");
  }
  client ??= create();
  return client;
}
