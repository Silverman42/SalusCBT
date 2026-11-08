// Same-origin proxy to Better Auth on the Convex site URL (HLD D6, LLD §9.1).
// Header rules and the reasons for them are in server/utils/authProxy.ts;
// client-IP trust is in server/utils/ip.ts. Cookies pass through both ways
// unchanged: the browser's Cookie header goes out, Convex's Set-Cookie comes
// back and lands on the app's own origin.
//
// Never log the outgoing headers (proxy secret) or bodies (sign-in codes).

let warnedMissingSecret = false;

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event);
  if (!config.convexSiteUrl) {
    throw createError({ statusCode: 500, statusMessage: "CONVEX_SITE_URL is not set" });
  }
  if (!config.serverSecret && !warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      "[auth proxy] NUXT_SERVER_SECRET is not set; Convex will not trust x-salus-client-ip for its per-IP limits.",
    );
  }

  const request = toWebRequest(event);
  const requestUrl = new URL(request.url);
  const target = authProxyTarget(requestUrl, config.convexSiteUrl);
  if (!target) throw createError({ statusCode: 404, statusMessage: "Not found" });

  const clientIp = resolveClientIp({
    netlifyClientIp: getRequestHeader(event, NETLIFY_CLIENT_IP_HEADER),
    forwardedFor: getRequestHeader(event, "x-forwarded-for"),
    socketIp: getRequestIP(event),
    // x-forwarded-for is client-writable; only trust it in `nuxt dev`.
    trustForwardedFor: import.meta.dev,
  });

  const headers = buildProxyHeaders({
    incoming: request.headers,
    requestUrl,
    convexSiteUrl: config.convexSiteUrl,
    clientIp,
    serverSecret: config.serverSecret,
  });

  const init: RequestInit = { method: request.method, headers, redirect: "manual" };
  if (request.method !== "GET" && request.method !== "HEAD") {
    const body = await request.arrayBuffer();
    if (body.byteLength > 0) init.body = body;
  }

  return fetch(target, init);
});
