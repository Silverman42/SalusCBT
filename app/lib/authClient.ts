import { convexClient } from "@convex-dev/better-auth/client/plugins";
import { emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/vue";
import { AccessCache, TokenCache } from "~/lib/staffAuthCache";

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

let tokenCache: TokenCache | null = null;
let accessCache: AccessCache | null = null;

/** The Convex JWT, shared by the route guard and the live Convex connection. */
export function getTokenCache(): TokenCache {
  tokenCache ??= new TokenCache(async () => {
    const { data } = await getAuthClient().convex.token();
    return data?.token ?? null;
  });
  return tokenCache;
}

/** The staff route guard's last result (see `staffAuthCache.ts`). */
export function getAccessCache(): AccessCache {
  accessCache ??= new AccessCache(tabStorage());
  return accessCache;
}

/** This tab's sessionStorage, or null when the browser blocks it (memory only). */
function tabStorage(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Forget cached auth state: on sign-in, sign-out, or a session error from Convex. */
export function clearAuthCaches(): void {
  tokenCache?.clear();
  accessCache?.clear();
}
