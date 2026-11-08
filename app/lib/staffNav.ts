/**
 * Sidebar items for `layouts/staff.vue` (mockup screens 09 "Tutor class" and
 * 10 "Admin"). The area comes from the route: `/admin/**` or `/tutor/**`.
 */
import type { StaffRole } from "./authGuard";

export interface StaffNavItem {
  label: string;
  to: string;
  icon: string;
}

export const STAFF_NAV: Record<StaffRole, StaffNavItem[]> = {
  admin: [
    { label: "Tutors", to: "/admin/tutors", icon: "i-lucide-user-plus" },
    { label: "Invitations", to: "/admin/invitations", icon: "i-lucide-mail" },
    { label: "Default exam", to: "/admin/exam", icon: "i-lucide-layers" },
    { label: "Audit log", to: "/admin/audit", icon: "i-lucide-file-text" },
    { label: "Delete attempts", to: "/admin/attempts", icon: "i-lucide-trash-2" },
  ],
  tutor: [
    { label: "Classes", to: "/tutor", icon: "i-lucide-users" },
    { label: "Question editor", to: "/tutor/versions", icon: "i-lucide-pen-line" },
    { label: "Oral questions", to: "/oral", icon: "i-lucide-message-circle" },
    { label: "Terminal lab", to: "/lab", icon: "i-lucide-terminal" },
  ],
};

export const ROLE_LABEL: Record<StaffRole, string> = { admin: "Admin", tutor: "Tutor" };

/** The staff area a path belongs to; `/admin/**` is admin, anything else tutor. */
export function staffAreaOf(path: string): StaffRole {
  return /^\/admin(\/|$)/.test(path) ? "admin" : "tutor";
}

/**
 * The item to highlight for `path`: the longest `to` that equals the path or
 * is a parent of it, so `/tutor/versions/x` lights "Question editor", not
 * "Classes".
 */
export function activeNavItem(items: StaffNavItem[], path: string): StaffNavItem | null {
  const clean = path.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  let best: StaffNavItem | null = null;
  for (const item of items) {
    if (clean === item.to || clean.startsWith(`${item.to}/`)) {
      if (!best || item.to.length > best.to.length) best = item;
    }
  }
  return best;
}
