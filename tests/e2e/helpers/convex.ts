/**
 * Shared helpers for the live e2e specs: the Convex URL the Nuxt dev server
 * uses, and a tail of `npx convex logs` for console-provider emails.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

/** Reads `KEY=value` from `.env.local` (no shell expansion; quotes stripped). */
export function envLocal(key: string): string {
  if (!existsSync(".env.local")) return "";
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith(`${key}=`));
  return (
    line
      ?.slice(key.length + 1)
      .trim()
      .replace(/^"|"$/g, "") ?? ""
  );
}

/** `E2E_CONVEX_URL`, `CONVEX_URL`, or `CONVEX_URL` from `.env.local`. */
export function convexUrl(): string {
  return process.env.E2E_CONVEX_URL ?? process.env.CONVEX_URL ?? envLocal("CONVEX_URL");
}

/** Tails `npx convex logs` and hands out the console-provider emails. */
export class MailLog {
  private proc: ChildProcess | null = null;
  private buffer = "";

  start() {
    this.proc = spawn("npx", ["convex", "logs"], { stdio: ["ignore", "pipe", "pipe"] });
    this.proc.stdout?.on("data", (chunk: Buffer) => (this.buffer += chunk.toString()));
  }

  stop() {
    this.proc?.kill();
  }

  /** Waits for the first match of `pattern` after `from` (a buffer offset). */
  async waitFor(pattern: RegExp, from: number, timeoutMs = 30_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const match = pattern.exec(this.buffer.slice(from));
      if (match) return match[1]!;
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error(`No email matching ${pattern} in the Convex logs`);
  }

  get offset() {
    return this.buffer.length;
  }
}

export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** The sign-in code in a console-provider email to `email`. */
export const codeFor = (email: string) =>
  new RegExp(`to=${escapeRegExp(email)} tag=otp[\\s\\S]*?code is: (\\d{6})`);

/** The invite token in a console-provider email to `email`. */
export const inviteFor = (email: string) =>
  new RegExp(`to=${escapeRegExp(email)} tag=invite[\\s\\S]*?/invite/([A-Za-z0-9_-]{43})`);
