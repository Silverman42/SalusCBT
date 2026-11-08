/**
 * Route guard decisions for the tutor and admin areas (LLD §14.1, §16).
 *
 * UX only (SE-2): every tutor and admin Convex function checks the caller
 * itself (`convex/lib/guards.ts`). These rules just keep people off pages
 * that would only show errors.
 */

export type StaffRole = "tutor" | "admin";

export const SIGN_IN_PATH = "/sign-in";

/** Where each role lands when it is sent away from an area it can't use. */
export const HOME_BY_ROLE: Record<StaffRole, string> = {
  tutor: "/tutor",
  admin: "/admin/tutors",
};

export interface GuardInput {
  /** The area the route belongs to. */
  required: StaffRole;
  /** A Better Auth session exists. */
  signedIn: boolean;
  /**
   * The caller's active Salus role, `null` when they have no active profile
   * (FORBIDDEN), or `undefined` when it isn't known yet. Until
   * `profiles.me` exists (T-404) it is always `undefined`, and any
   * signed-in user passes.
   */
  role: StaffRole | null | undefined;
  /** `route.fullPath`, so sign-in can return here. */
  path: string;
}

/** `null` to allow the navigation, otherwise the path to redirect to. */
export function staffGuardRedirect(input: GuardInput): string | null {
  if (!input.signedIn || input.role === null) {
    return `${SIGN_IN_PATH}?redirect=${encodeURIComponent(input.path)}`;
  }
  if (input.role === undefined) return null;
  // Admin passes every check, as in convex/lib/guards.ts.
  if (input.role === "admin" || input.role === input.required) return null;
  return HOME_BY_ROLE[input.role];
}

/**
 * A `redirect` query value that is safe to navigate to after sign-in: a path
 * on this site. Anything else (absolute URLs, `//host`, `/\host`) gives
 * `fallback`, so the parameter can't be used as an open redirect.
 */
export function safeRedirectPath(value: unknown, fallback = "/tutor"): string {
  if (typeof value !== "string") return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) {
    return fallback;
  }
  // Control characters (e.g. a tab inside "/\t/host") are stripped by URL parsers.
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return fallback;
  }
  return value;
}
