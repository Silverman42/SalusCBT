/**
 * Resend adapter (LLD §11). Plain `fetch` to the REST API, so it runs in the
 * default Convex runtime without the SDK or `"use node"`.
 * https://resend.com/docs/api-reference/emails/send-email
 */
import {
  EmailSendError,
  redactDetail,
  type EmailMessage,
  type EmailProvider,
  type SendOptions,
} from "./provider";

const ENDPOINT = "https://api.resend.com/emails";

export class ResendProvider implements EmailProvider {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(msg: EmailMessage, opts: SendOptions = {}): Promise<{ id?: string }> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
    if (opts.idempotencyKey) headers["Idempotency-Key"] = opts.idempotencyKey;

    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "POST",
        headers,
        body: JSON.stringify({
          from: this.from,
          to: [msg.to],
          subject: msg.subject,
          html: msg.html,
          text: msg.text,
          ...(msg.tag ? { tags: [{ name: "type", value: msg.tag }] } : {}),
        }),
      });
    } catch (e) {
      throw new EmailSendError(`Resend request failed: ${(e as Error).message}`, true);
    }

    if (!res.ok) {
      // Only the status is kept: error bodies can echo the recipient (PR-2).
      // 429 and 5xx are transient; other 4xx (bad key, bad payload) are not.
      const retryable = res.status === 429 || res.status >= 500;
      const reply = (await res.json().catch(() => ({}))) as { message?: unknown };
      const detail = typeof reply.message === "string" ? redactDetail(reply.message) : undefined;
      throw new EmailSendError(`Resend responded ${res.status}`, retryable, detail);
    }
    const body = (await res.json().catch(() => ({}))) as { id?: unknown };
    return typeof body.id === "string" ? { id: body.id } : {};
  }
}
