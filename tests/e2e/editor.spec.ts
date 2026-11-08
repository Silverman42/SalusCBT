/**
 * T-609: the Stage 6 editor path in a real browser. A tutor signs in, starts
 * a draft from the default exam, generates new values for PBQ 1 with a fixed
 * seed, previews the draft as a student, submits and sees the review,
 * publishes it, and gives it to a new class; a student starting in that
 * class gets the generated question. Marking with the key's answers (full
 * marks, standard and retake) and old attempts keeping their version are
 * proven in tests/convex/editor/gate.test.ts; this spec covers the UI.
 *
 * Skipped unless `E2E_EDITOR=1`: it needs a live dev deployment set up for
 * sign-in (as for tests/e2e/auth.spec.ts) and an active tutor account. To
 * run it locally:
 *
 *   npx convex env set ADMIN_EMAIL admin@example.com   # any address
 *   npx convex env set SERVER_SECRET <random>          # NUXT_SERVER_SECRET in .env.local
 *   npx convex env set EMAIL_PROVIDER console          # or leave unset
 *   # .env.local also needs NUXT_IP_PEPPER for /api/attempts/start
 *   npm run seed:import                                # once: a published default version
 *   # a tutor: invite one from /admin/invitations and accept it (or run auth.spec.ts)
 *   E2E_EDITOR=1 E2E_TUTOR_EMAIL=tutor@example.com npm run test:e2e -- editor.spec.ts
 *
 * The tutor signs in by code, read from `npx convex logs` (console email
 * provider), so the shell must point at the same deployment as the Nuxt dev
 * server. The code request limits (1 per minute per email) allow one run a
 * minute. The default exam's question 1 must still be the seeded sshLog PBQ
 * (set A). The student side calls `POST /api/attempts/start` and then
 * `attempts.getPaper` / `attempts.submit` with the Convex client, at
 * `E2E_CONVEX_URL` or `CONVEX_URL` (from the environment or .env.local).
 * Each run leaves a published version ("E2E editor <timestamp>"), a class
 * of the same name with one blank submitted attempt, and a preview attempt
 * behind; close or delete the class from its page.
 */
import { randomBytes } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { generate } from "../../convex/generators";
import { codeFor, convexUrl, MailLog } from "./helpers/convex";

const ENABLED = process.env.E2E_EDITOR === "1";
const TUTOR_EMAIL = process.env.E2E_TUTOR_EMAIL ?? "";
/** The generator seed typed into "Generate new values" for question 1. */
const SEED = 609;

async function signIn(page: Page, mail: MailLog, email: string) {
  await page.goto("/sign-in");
  const from = mail.offset;
  await page.getByLabel("Email").fill(email);
  await page.getByRole("button", { name: "Send code" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  await page.getByLabel("Sign-in code").fill(await mail.waitFor(codeFor(email), from));
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).not.toHaveURL(/\/sign-in/);
}

test.describe("Stage 6 editor in the browser (T-609)", () => {
  test.skip(!ENABLED, "Set E2E_EDITOR=1 (and E2E_TUTOR_EMAIL) against a configured dev deployment");

  const mail = new MailLog();
  test.beforeAll(() => mail.start());
  test.afterAll(() => mail.stop());

  test("new draft → generate a PBQ → preview → submit → review → publish → class", async ({
    browser,
  }) => {
    test.setTimeout(180_000);
    expect(TUTOR_EMAIL, "E2E_TUTOR_EMAIL").not.toBe("");
    const url = convexUrl();
    expect(url, "E2E_CONVEX_URL / CONVEX_URL").not.toBe("");
    const label = `E2E editor ${Date.now()}`;

    const page = await (await browser.newContext()).newPage();
    await signIn(page, mail, TUTOR_EMAIL);

    // A new draft, copied from the default exam (the dialog's preselected source).
    await page.goto("/tutor/versions");
    await page.getByRole("button", { name: "New draft" }).first().click();
    const newDraft = page.getByRole("dialog");
    await expect(newDraft.getByLabel("Copy from")).not.toHaveValue("");
    await newDraft.getByLabel("Draft name").fill(label);
    await newDraft.getByRole("button", { name: "Create draft" }).click();
    await expect(page).toHaveURL(/\/tutor\/versions\/[^/]+$/);
    const versionPath = new URL(page.url()).pathname;
    await expect(page.getByRole("heading", { name: label })).toBeVisible();

    // Generate new values for PBQ 1 (sshLog, set A) with a fixed seed.
    await page.getByRole("button", { name: /^PBQs · \d+$/ }).click();
    await page
      .getByRole("region", { name: "Questions" })
      .getByRole("button", { name: /^Q1\b/ })
      .click();
    await expect(page.getByRole("heading", { name: /^Question 1 · / })).toBeVisible();
    await page.getByRole("button", { name: "Generate new values" }).click();
    const generateDialog = page.getByRole("dialog", { name: "Generate new values?" });
    await generateDialog.getByLabel("Seed (optional)").fill(String(SEED));
    await generateDialog.getByRole("button", { name: "Generate and save" }).click();
    await expect(generateDialog).toBeHidden();
    await expect(page.getByText(`generated from seed ${SEED}`)).toBeVisible();

    // Validation passes: Publish is enabled once the check has run with no errors.
    const publishButton = page.getByRole("button", { name: /^Publish v\d+$/ });
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });

    // Preview as a student (standard paper), submit, see the result and review.
    await page.getByRole("button", { name: "Preview as student" }).click();
    const previewDialog = page.getByRole("dialog", { name: "Preview as a student" });
    await previewDialog.getByRole("button", { name: "Start preview" }).click();
    await expect(page).toHaveURL(/\/tutor\/versions\/[^/]+\/preview\/[^/]+$/);
    // The paper opens on PBQ 1, showing the generated log.
    const generatedLog = generate("sshLog", SEED, { set: "A" }).payload.log;
    const firstLine = generatedLog.split("\n")[0]!;
    await expect(page.getByText(firstLine, { exact: false }).first()).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole("button", { name: "Submit preview" }).first().click();
    const submitDialog = page.getByRole("dialog", { name: "Submit this preview?" });
    await submitDialog.getByRole("button", { name: "Submit preview" }).click();
    await expect(page.getByRole("heading", { name: /^Preview result · / })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByRole("heading", { name: "Answer review" })).toBeVisible();

    // Back in the editor: publish.
    await page.getByRole("link", { name: "Back to the editor" }).first().click();
    await expect(page).toHaveURL(new RegExp(`${versionPath}$`));
    await expect(publishButton).toBeEnabled({ timeout: 15_000 });
    const publishName = (await publishButton.textContent())!.trim();
    await publishButton.click();
    const publishDialog = page.getByRole("dialog");
    await publishDialog.getByRole("button", { name: publishName }).click();
    await expect(page.getByText(/This version is published, so it can't be changed/)).toBeVisible();

    // A class on the new version.
    await page.goto("/tutor");
    await page.getByRole("button", { name: "New class" }).first().click();
    await page.getByLabel("Class name").fill(label);
    await page.getByLabel("Exam version").click();
    await page.getByRole("option", { name: label, exact: true }).click();
    await page.getByRole("button", { name: "Create class" }).click();
    await expect(page).toHaveURL(/\/tutor\/classes\/[^/]+$/);
    await expect(page.getByText(label).first()).toBeVisible();
    const code = (await page
      .getByText(/^SEC-[A-Z0-9]{4}$/)
      .first()
      .textContent())!.trim();

    // A student in that class gets the generated question 1.
    const student = await (await browser.newContext()).newPage();
    const anonToken = randomBytes(32).toString("base64url");
    const started = await student.request.post("/api/attempts/start", {
      data: { anonToken, classCode: code, displayName: "Editor E2E", mode: "standard" },
    });
    expect(started.status(), await started.text()).toBe(200);
    const { attemptId } = (await started.json()) as { attemptId: Id<"attempts"> };
    const client = new ConvexHttpClient(url, { logger: false });
    const paper = await client.query(api.attempts.getPaper, { attemptId, anonToken });
    const q1 = paper.questions.find((q) => q.displayNumber === "1");
    expect(q1?.kind).toBe("pbq");
    expect(q1?.kind === "pbq" && q1.payload.template === "sshLog" ? q1.payload.log : null).toBe(
      generatedLog,
    );
    await client.mutation(api.attempts.submit, { attemptId, anonToken });
  });
});
