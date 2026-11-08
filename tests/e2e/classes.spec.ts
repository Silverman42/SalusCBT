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
import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { codeFor, convexUrl, MailLog } from "./helpers/convex";

const ENABLED = process.env.E2E_CLASSES === "1";
const TUTOR_EMAIL = process.env.E2E_TUTOR_EMAIL ?? "";
/** The gate: the dashboard shows the submission within this long. */
const GATE_MS = 5_000;

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
