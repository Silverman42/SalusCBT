/**
 * T-410: the Stage 4 gate in a real browser (invite → accept → code →
 * signed in → sign out), with the console email provider.
 *
 * Skipped unless `E2E_AUTH=1`: it needs a live dev deployment set up for
 * sign-in, which CI doesn't have yet. To run it locally:
 *
 *   npx convex env set ADMIN_EMAIL admin@example.com   # any address
 *   npx convex env set SERVER_SECRET <random>          # same value in .env.local for Nuxt
 *   npx convex env set EMAIL_PROVIDER console          # or leave unset
 *   npx convex run profiles:ensureAdmin
 *   E2E_AUTH=1 E2E_ADMIN_EMAIL=admin@example.com npm run test:e2e -- auth.spec.ts
 *
 * Emails are read from `npx convex logs` (the console provider prints the
 * invite link and the code there), so the shell must point at the same
 * deployment as the Nuxt dev server (`.env.local`). Each run invites a new
 * address (`e2e-<timestamp>@example.com`); the code request limits (1 per
 * minute, 5 per hour per email) allow one run a minute.
 */
import { expect, test, type Page } from "@playwright/test";
import { codeFor, inviteFor, MailLog } from "./helpers/convex";

const ENABLED = process.env.E2E_AUTH === "1";
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL ?? "";

async function enterCode(page: Page, code: string) {
  await page.getByLabel("Sign-in code").fill(code);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function sessionEmail(page: Page): Promise<string | null> {
  const res = await page.request.get("/api/auth/get-session");
  const body = (await res.json()) as { user?: { email?: string } } | null;
  return body?.user?.email ?? null;
}

test.describe("Stage 4 gate in the browser (T-410)", () => {
  test.skip(!ENABLED, "Set E2E_AUTH=1 (and E2E_ADMIN_EMAIL) against a configured dev deployment");

  const mail = new MailLog();
  test.beforeAll(() => mail.start());
  test.afterAll(() => mail.stop());

  test("invite → accept → code → signed in → sign out", async ({ browser }) => {
    test.setTimeout(120_000);
    expect(ADMIN_EMAIL, "E2E_ADMIN_EMAIL").not.toBe("");
    const tutorEmail = `e2e-${Date.now()}@example.com`;

    // The admin signs in by code and invites the tutor.
    const adminPage = await (await browser.newContext()).newPage();
    await adminPage.goto("/sign-in");
    let from = mail.offset;
    await adminPage.getByLabel("Email").fill(ADMIN_EMAIL);
    await adminPage.getByRole("button", { name: "Send code" }).click();
    await expect(adminPage.getByRole("heading", { name: "Check your email" })).toBeVisible();
    await enterCode(adminPage, await mail.waitFor(codeFor(ADMIN_EMAIL), from));
    await expect(adminPage).toHaveURL(/\/admin/);

    await adminPage.goto("/admin/invitations");
    from = mail.offset;
    await adminPage.getByLabel("Tutor's email").fill(tutorEmail);
    await adminPage.getByRole("button", { name: "Send invite" }).click();
    const token = await mail.waitFor(inviteFor(tutorEmail), from);

    // The tutor, in a fresh browser, accepts and signs in by code.
    const tutorContext = await browser.newContext();
    const page = await tutorContext.newPage();
    await page.goto(`/invite/${token}`);
    await expect(page.getByRole("heading", { name: "You're invited to Salus" })).toBeVisible();
    from = mail.offset;
    await page.getByRole("button", { name: "Accept and send code" }).click();
    const code = await mail.waitFor(codeFor(tutorEmail), from);

    // A wrong code is refused and leaves the tutor signed out.
    await enterCode(page, code === "000000" ? "111111" : "000000");
    await expect(page.getByRole("alert").or(page.locator("[aria-live] p"))).toBeVisible();
    expect(await sessionEmail(page)).toBeNull();

    // The right one signs in.
    await enterCode(page, code);
    await expect(page).not.toHaveURL(/\/(sign-in|invite)/);
    expect(await sessionEmail(page)).toBe(tutorEmail);
    const cookies = await tutorContext.cookies();
    expect(cookies.find((c) => c.name.endsWith("session_token"))?.httpOnly).toBe(true);

    // The invite link is spent.
    await page.goto(`/invite/${token}`);
    await expect(
      page.getByRole("heading", { name: "This invitation link doesn't work" }),
    ).toBeVisible();

    // Sign out from a staff page (the header button is on /tutor and /admin).
    await page.goto("/tutor");
    await page.getByRole("button", { name: "Sign out" }).first().click();
    await expect.poll(() => sessionEmail(page)).toBeNull();
  });
});
