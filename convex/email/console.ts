/**
 * Development adapter: writes the email to the Convex logs instead of sending
 * it (PRD AR-4). Logging the plain-text body, and so the OTP code, is the
 * point of this path; it is never selected unless `EMAIL_PROVIDER` is
 * `console` or unset (see `provider.ts`).
 */
import type { EmailMessage, EmailProvider } from "./provider";

export class ConsoleProvider implements EmailProvider {
  async send(msg: EmailMessage): Promise<{ id?: string }> {
    console.log(
      `[email:console] to=${msg.to} tag=${msg.tag ?? "-"} subject=${JSON.stringify(msg.subject)}\n${msg.text}`,
    );
    return {};
  }
}
