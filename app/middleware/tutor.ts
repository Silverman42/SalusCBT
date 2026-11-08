// Tutor area guard (LLD §14.1): `definePageMeta({ middleware: "tutor" })`.
// Signed out → /sign-in; admin passes. UX only: Convex checks every call (SE-2).
import { staffMiddleware } from "~/lib/staffMiddleware";

export default defineNuxtRouteMiddleware(staffMiddleware("tutor"));
