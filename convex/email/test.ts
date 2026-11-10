/**
 * `npx convex run email/test:sendTest '{"to":"you@example.com"}'` (add
 * `--prod` for production) sends one email through the configured provider
 * (EMAIL_PROVIDER, RESEND_API_KEY, EMAIL_FROM) and reports what happened, so
 * a production email setup can be checked without signing in. Internal: it
 * can only be run from the CLI or dashboard by someone with deploy access.
 */
import { v } from "convex/values";
import { env, internalAction } from "../_generated/server";
import { EmailSendError, getProvider } from "./provider";
import { testEmail } from "./templates";

export const sendTest = internalAction({
  args: { to: v.string() },
  returns: v.union(
    v.object({ ok: v.literal(true), provider: v.string(), id: v.optional(v.string()) }),
    v.object({ ok: v.literal(false), error: v.string() }),
  ),
  handler: async (_ctx, { to }) => {
    try {
      const provider = getProvider();
      const { id } = await provider.send(testEmail({ to }));
      return {
        ok: true as const,
        provider: env.EMAIL_PROVIDER ?? "console",
        ...(id ? { id } : {}),
      };
    } catch (err) {
      const error =
        err instanceof EmailSendError || err instanceof Error ? err.message : "unknown error";
      return { ok: false as const, error };
    }
  },
});
