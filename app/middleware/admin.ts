// Admin area guard (LLD §14.1): `definePageMeta({ middleware: "admin" })`.
// Signed out → /sign-in; a tutor → /tutor. UX only: Convex checks every call (SE-2).
import { staffMiddleware } from "~/lib/staffMiddleware";

export default defineNuxtRouteMiddleware(staffMiddleware("admin"));
