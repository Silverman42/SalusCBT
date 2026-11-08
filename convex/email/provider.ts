/**
 * The one email interface (LLD §11, PRD AR-4, HLD D7).
 *
 * Every email goes through `getProvider().send(...)`. Templates live in
 * `templates.ts`, outside the adapters, so changing provider means:
 *   1. add `convex/email/<name>.ts` implementing `EmailProvider`,
 *   2. add one `case` below,
 *   3. set `EMAIL_PROVIDER=<name>` (plus that provider's secrets).
 *
 * `EMAIL_PROVIDER` unset → `console` (the LLD default: local dev and deploy
 * previews never send real mail). An unknown value throws instead of falling
 * back, so a typo in production can't silently write OTP codes to the logs.
 */
import { env } from "../_generated/server";
import { ConsoleProvider } from "./console";
import { ResendProvider } from "./resend";

export type EmailTag = "otp" | "invite";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  tag?: EmailTag;
}

export interface SendOptions {
  /** Same key on every retry of one message, so a provider can de-duplicate. */
  idempotencyKey?: string;
}

export interface EmailProvider {
  send(msg: EmailMessage, opts?: SendOptions): Promise<{ id?: string }>;
}

/**
 * Thrown by adapters. `retryable: false` marks a permanent failure (bad
 * request, bad key), which `email.send` doesn't retry.
 */
export class EmailSendError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "EmailSendError";
  }
}

type EnvLike = Record<string, string | undefined>;

// `env` is `process.env` at runtime. Its generated type lists only variables
// declared in `convex.config.ts`; until EMAIL_PROVIDER, RESEND_API_KEY and
// EMAIL_FROM are declared there, read it as a plain record.
const deploymentEnv = env as unknown as EnvLike;

function required(env: EnvLike, name: string): string {
  const value = env[name];
  if (!value) throw new EmailSendError(`${name} is not set`, false);
  return value;
}

export function getProvider(source: EnvLike = deploymentEnv): EmailProvider {
  const name = source.EMAIL_PROVIDER ?? "console";
  switch (name) {
    case "resend":
      return new ResendProvider(required(source, "RESEND_API_KEY"), required(source, "EMAIL_FROM"));
    case "console":
      return new ConsoleProvider();
    default:
      throw new EmailSendError(`Unknown EMAIL_PROVIDER "${name}"`, false);
  }
}
