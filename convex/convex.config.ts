import { defineApp } from "convex/server";
import betterAuth from "@convex-dev/better-auth/convex.config";
import rateLimiter from "@convex-dev/rate-limiter/convex.config";

// Components (LLD §3.1, §12.1). Better Auth keeps its own user, session,
// account and verification tables; rate-limit state lives in the rate limiter.
// Auth configuration (auth.ts, auth.config.ts, http.ts) is added in T-402.
const app = defineApp();
app.use(betterAuth);
app.use(rateLimiter);

export default app;
