import { httpRouter } from "convex/server";
import { authComponent, createAuth } from "./auth";

const http = httpRouter();

// Better Auth's routes under /api/auth/* on the Convex site URL (LLD §9.1).
// The browser reaches them only through the Nuxt proxy (T-403).
authComponent.registerRoutes(http, createAuth);

export default http;
