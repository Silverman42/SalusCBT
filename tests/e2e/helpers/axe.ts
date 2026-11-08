/**
 * axe-core scan for the e2e specs (T-220, PRD QA-2, LLD §17): WCAG 2.x A and
 * AA rules; fails on any `serious` or `critical` violation and lists the
 * offending nodes. Minor and moderate findings are attached to the report.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type TestInfo } from "@playwright/test";

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const BLOCKING = new Set(["serious", "critical"]);

export async function expectNoSeriousA11yViolations(page: Page, testInfo: TestInfo, name: string) {
  const results = await new AxeBuilder({ page })
    .withTags(TAGS)
    // The Nuxt DevTools launcher is injected by `nuxt dev` only.
    .exclude("nuxt-devtools-frame")
    .analyze();
  const blocking = results.violations.filter((v) => BLOCKING.has(v.impact ?? ""));
  const other = results.violations.filter((v) => !BLOCKING.has(v.impact ?? ""));
  if (other.length) {
    await testInfo.attach(`axe-${name}-minor.json`, {
      body: JSON.stringify(other, null, 2),
      contentType: "application/json",
    });
  }
  const summary = blocking.map(
    (v) =>
      `${v.impact} ${v.id}: ${v.help}\n` +
      v.nodes.map((n) => `  ${n.target.join(" ")}  ${n.failureSummary ?? ""}`).join("\n"),
  );
  expect(summary, `axe serious/critical violations on ${name}`).toEqual([]);
}
