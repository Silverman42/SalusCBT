/**
 * T-706 / T-702: the in-browser lab on /lab. Types the Lab A–C commands into
 * the terminal, checks the output, passes the three checks, resets the lab,
 * and runs axe at 375 px and 1280 px in light and dark mode.
 *
 * Needs no deployment: the lab runs entirely in the browser.
 */
import { expect, test, type Page } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "./helpers/axe";

async function openLab(page: Page) {
  await page.goto("/lab");
  await expect(page.getByRole("heading", { level: 1, name: "Practice lab" })).toBeVisible();
  await expect(page.getByTestId("terminal-input")).toBeVisible();
  await expect(page.getByTestId("terminal-output")).toContainText("Welcome to the Salus");
}

/** Type a line, press Enter, wait for the command to finish; returns its output. */
async function run(page: Page, line: string): Promise<string> {
  const output = page.getByTestId("terminal-output");
  const input = page.getByTestId("terminal-input");
  const before = (await output.innerText()).length;
  await input.fill(line);
  await input.press("Enter");
  await expect(page.getByTestId("terminal-busy")).toHaveCount(0, { timeout: 15_000 });
  await expect(input).toHaveValue("");
  const text = await output.innerText();
  return text.slice(before);
}

test.describe("terminal lab", () => {
  test("Lab A: commands give the expected output and the check passes", async ({ page }) => {
    await openLab(page);
    await run(page, "cd ~/secplus-lab/log");
    await expect(page.getByText("root@lab:~/secplus-lab/log#").last()).toBeVisible();
    expect(await run(page, "grep -c 'Failed password' auth.log")).toMatch(/\n?\d+\n?$/);
    const ranking = await run(
      page,
      "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr",
    );
    expect(ranking).toContain("     50 185.220.101.47");
    expect(await run(page, "grep 'Accepted' auth.log")).toContain("backup");
    expect(await run(page, "nmap localhost")).toContain("not available in this lab");

    const panel = page.getByRole("tabpanel");
    await panel.getByLabel("1. Attacker IP address").fill("10.0.0.1");
    await panel.getByLabel("2. Account it logged in to").fill("backup");
    await panel.getByLabel("3. Failed password entries from that IP").fill("50");
    await panel.getByRole("button", { name: "Check" }).click();
    await expect(page.getByTestId("lab-a-result")).toContainText("2 of 3 answers right");
    await panel.getByLabel("1. Attacker IP address").fill("185.220.101.47");
    await panel.getByRole("button", { name: "Check" }).click();
    await expect(page.getByTestId("lab-a-result")).toContainText("Lab A passed");
    await expect(page.getByRole("tab", { name: /Lab A.*passed/ })).toBeVisible();
  });

  test("Lab B: sha256sum -c finds the tampered installer", async ({ page }) => {
    await openLab(page);
    await page.getByRole("tab", { name: /Lab B/ }).click();
    await run(page, "cd ~/secplus-lab/downloads");
    expect(await run(page, "cat vendor_hashes.txt")).toMatch(/[0-9a-f]{64} {2}\S+/);
    const check = await run(page, "sha256sum -c vendor_hashes.txt");
    const failed = /(\S+): FAILED/.exec(check)?.[1];
    expect(failed).toBeTruthy();
    expect(check).toMatch(/WARNING: 1 computed checksum did NOT match/);

    const panel = page.getByRole("tabpanel");
    await panel.getByLabel("Which installer was tampered with?").fill(failed!);
    await panel.getByRole("button", { name: "Check" }).click();
    await expect(page.getByTestId("lab-b-result")).toContainText("Lab B passed");
  });

  test("Lab C: fixes pass the check, reset undoes them", async ({ page }) => {
    await openLab(page);
    await page.getByRole("tab", { name: /Lab C/ }).click();
    const panel = page.getByRole("tabpanel");
    await panel.getByRole("button", { name: "Check my fixes" }).click();
    await expect(page.getByTestId("lab-c-result")).toContainText("0 of 3 fixes done");

    await run(page, "cd ~/secplus-lab");
    expect(await run(page, "ls -l etc")).toContain("shadow");
    await run(page, "chmod 640 etc/shadow");
    await run(page, "chmod 600 home/deploy/.ssh/id_rsa");
    await run(page, "sed -i 's/^PermitRootLogin yes/PermitRootLogin no/' etc/ssh/sshd_config");
    const stat = await run(page, "stat -c '%a %n' etc/shadow home/deploy/.ssh/id_rsa");
    expect(stat).toContain("640 etc/shadow");
    expect(stat).toContain("600 home/deploy/.ssh/id_rsa");
    expect(await run(page, "grep '^PermitRootLogin' etc/ssh/sshd_config")).toContain(
      "PermitRootLogin no",
    );
    await panel.getByRole("button", { name: "Check my fixes" }).click();
    await expect(page.getByTestId("lab-c-result")).toContainText("Lab C passed");

    await page.getByRole("button", { name: "Reset lab" }).click();
    await page.getByTestId("confirm-reset").click();
    await expect(page.getByTestId("terminal-output")).toContainText("Lab reset");
    await expect(page.getByTestId("terminal-input")).toBeFocused();
    await expect(page.getByTestId("lab-c-result")).toHaveCount(0);
    // The seed's world-writable shadow file is back.
    expect(await run(page, "stat -c '%a %n' etc/shadow")).not.toContain("640 etc/shadow");
  });

  test("keyboard: history, Tab completion, Ctrl+C and Ctrl+L", async ({ page }) => {
    await openLab(page);
    const input = page.getByTestId("terminal-input");
    const output = page.getByTestId("terminal-output");
    await run(page, "pwd");
    await run(page, "echo two");
    await input.press("ArrowUp");
    await expect(input).toHaveValue("echo two");
    await input.press("ArrowUp");
    await expect(input).toHaveValue("pwd");
    await input.press("ArrowDown");
    await input.press("ArrowDown");
    await expect(input).toHaveValue("");

    await input.fill("cat lo");
    await input.press("Tab");
    await expect(input).toHaveValue("cat log/");
    await input.pressSequentially("au");
    await input.press("Tab");
    await expect(input).toHaveValue("cat log/auth.log ");
    await expect(input).toBeFocused();

    await input.press("Control+c");
    await expect(input).toHaveValue("");
    await expect(output).toContainText("cat log/auth.log ^C");

    await input.press("Control+l");
    await expect(output).not.toContainText("echo two");

    // An empty line: Tab leaves the terminal as usual.
    await input.press("Tab");
    await expect(input).not.toBeFocused();
  });

  test("output is text, never HTML", async ({ page }) => {
    await openLab(page);
    await run(page, "echo '<img src=x onerror=alert(1)><b>bold</b>'");
    await expect(page.getByTestId("terminal-output")).toContainText("<b>bold</b>");
    await expect(page.getByTestId("terminal-output").locator("img, b")).toHaveCount(0);
  });
});

for (const scheme of ["light", "dark"] as const) {
  for (const width of [375, 1280]) {
    test(`/lab axe, ${scheme}, ${width}px`, async ({ page }, testInfo) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await openLab(page);
      await run(page, "ls -l ~/secplus-lab/etc");
      await run(page, "foo");
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));
      const scroll = await page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
      );
      expect(scroll, "no horizontal page scroll").toBeLessThanOrEqual(0);
      await expectNoSeriousA11yViolations(page, testInfo, `lab-${scheme}-${width}`);
      for (const tab of ["Lab B", "Lab C", "Lab D"]) {
        await page.getByRole("tab", { name: new RegExp(tab) }).click();
        await expect(page.getByRole("tab", { name: new RegExp(tab) })).toHaveAttribute(
          "aria-selected",
          "true",
        );
        // Let the tab colour transition finish before axe measures contrast.
        await page.waitForFunction(() => document.getAnimations().length === 0);
        await expectNoSeriousA11yViolations(page, testInfo, `lab-${tab}-${scheme}-${width}`);
      }
    });
  }
}
