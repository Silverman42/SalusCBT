/**
 * T-510: the Stage 5 dashboard gate in a real browser. A tutor has the class
 * page open; a student starts and submits an attempt in that class; the row
 * shows the result within 5 seconds of the submit returning (PRD CL-5).
 *
 * Skipped unless `E2E_CLASSES=1`: it needs a live dev deployment set up for
 * sign-in (as for tests/e2e/auth.spec.ts) and an active tutor account. To
 * run it locally:
 *
 *   npx convex env set ADMIN_EMAIL admin@example.com   # any address
 *   npx convex env set SERVER_SECRET <random>          # NUXT_SERVER_SECRET in .env.local
 *   npx convex env set EMAIL_PROVIDER console          # or leave unset
 *   # .env.local also needs NUXT_IP_PEPPER for /api/attempts/start
 *   npm run seed:import                                # once: a published default version
 *   # a tutor: invite one from /admin/invitations and accept it (or run auth.spec.ts)
 *   E2E_CLASSES=1 E2E_TUTOR_EMAIL=tutor@example.com npm run test:e2e -- classes.spec.ts
 *
 * The tutor signs in by code, read from `npx convex logs` (console email
 * provider), so the shell must point at the same deployment as the Nuxt dev
 * server. The code request limits (1 per minute per email) allow one run a
 * minute. The student side calls `POST /api/attempts/start` (the start form
 * is T-211/T-508) and then `attempts.submit` directly with the Convex client,
 * at `E2E_CONVEX_URL` or `CONVEX_URL` (from the environment or .env.local).
 * Each run leaves one class ("E2E <timestamp>") with one blank submitted
 * attempt behind; delete or close it from the class page.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

const ENABLED = process.env.E2E_CLASSES === "1";
const TUTOR_EMAIL = process.env.E2E_TUTOR_EMAIL ?? "";
/** The gate: the dashboard shows the submission within this long. */
const GATE_MS = 5_000;

function convexUrl(): string {
  const fromEnv = process.env.E2E_CONVEX_URL ?? process.env.CONVEX_URL;
  if (fromEnv) return fromEnv;
  if (!existsSync(".env.local")) return "";
  const line = readFileSync(".env.local", "utf8")
    .split("\n")
    .find((l) => l.startsWith("CONVEX_URL="));
  return line?.slice("CONVEX_URL=".length).trim().replace(/^"|"$/g, "") ?? "";
}

/** Tails `npx convex logs` for the console-provider sign-in code. */
class MailLog {
  private proc: ChildProcess | null = null;
  private buffer = "";

  start() {
    this.proc = spawn("npx", ["convex", "logs"], { stdio: ["ignore", "pipe", "pipe"] });
    this.proc.stdout?.on("data", (chunk: Buffer) => (this.buffer += chunk.toString()));
  }

  stop() {
    this.proc?.kill();
  }

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

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const codeFor = (email: string) =>
  new RegExp(`to=${escape(email)} tag=otp[\\s\\S]*?code is: (\\d{6})`);

test.describe("Stage 5 gate in the browser (T-510)", () => {
  test.skip(
    !ENABLED,
    "Set E2E_CLASSES=1 (and E2E_TUTOR_EMAIL) against a configured dev deployment",
  );

  const mail = new MailLog();
  test.beforeAll(() => mail.start());
  test.afterAll(() => mail.stop());

  test("an open class page shows a student's submission within 5 s", async ({ browser }) => {
    test.setTimeout(120_000);
    expect(TUTOR_EMAIL, "E2E_TUTOR_EMAIL").not.toBe("");
    const url = convexUrl();
    expect(url, "E2E_CONVEX_URL / CONVEX_URL").not.toBe("");

    // The tutor signs in by code and creates a class.
    const tutor = await (await browser.newContext()).newPage();
    await tutor.goto("/sign-in");
    const from = mail.offset;
    await tutor.getByLabel("Email").fill(TUTOR_EMAIL);
    await tutor.getByRole("button", { name: "Send code" }).click();
    await expect(tutor.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await tutor.getByLabel("Sign-in code").fill(await mail.waitFor(codeFor(TUTOR_EMAIL), from));
    await tutor.getByRole("button", { name: "Sign in" }).click();
    await expect(tutor).not.toHaveURL(/\/sign-in/);

    await tutor.goto("/tutor");
    await tutor.getByRole("button", { name: "New class" }).first().click();
    await tutor.getByLabel("Class name").fill(`E2E ${Date.now()}`);
    await tutor.getByRole("button", { name: "Create class" }).click();
    await expect(tutor).toHaveURL(/\/tutor\/classes\/[^/]+$/);
    const code = (await tutor
      .getByText(/^SEC-[A-Z0-9]{4}$/)
      .first()
      .textContent())!.trim();

    // A student (another browser) starts an attempt with the class code.
    const student = await (await browser.newContext()).newPage();
    const anonToken = randomBytes(32).toString("base64url");
    const name = `Student ${randomBytes(3).toString("hex")}`;
    const started = await student.request.post("/api/attempts/start", {
      data: { anonToken, classCode: code, displayName: name, mode: "standard" },
    });
    expect(started.status(), await started.text()).toBe(200);
    const { attemptId } = (await started.json()) as { attemptId: Id<"attempts"> };

    // The live table picks up the new attempt, then the submission.
    const row = tutor.getByRole("row").filter({ hasText: name });
    await expect(row).toContainText("In progress", { timeout: GATE_MS });

    const client = new ConvexHttpClient(url, { logger: false });
    await client.mutation(api.attempts.submit, { attemptId, anonToken });
    const submittedAt = Date.now();
    // A blank paper scores 100: below the 750 pass mark.
    await expect(row).toContainText("Below 750", { timeout: GATE_MS });
    const elapsed = Date.now() - submittedAt;
    console.info(`[T-510] dashboard showed the submission ${elapsed} ms after submit returned`);
    expect(elapsed).toBeLessThan(GATE_MS);
  });
});
