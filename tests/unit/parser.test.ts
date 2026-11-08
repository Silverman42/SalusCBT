import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { Issues, scanLines, splitSections, tableCells } from "../../scripts/lib/markdown";
import { parseExam } from "../../scripts/lib/parseExam";
import type { ParseIssue, SeedExam, SeedMcq, SeedPbq } from "../../scripts/lib/types";

const SOURCE_PATH = "content/source/secplus-701-mock-exam.md";
const source = readFileSync(SOURCE_PATH, "utf8");

function parsed(): SeedExam {
  const result = parseExam(source);
  if (!result.ok) throw new Error(result.errors.map((e) => `${e.line}: ${e.message}`).join("\n"));
  return result.exam;
}
const exam = parsed();
const mcqs = exam.questions.filter((q): q is SeedMcq => q.kind === "mcq");
const pbqs = exam.questions.filter((q): q is SeedPbq => q.kind === "pbq");
const keyOf = (n: string) => exam.answerKeys.find((k) => k.displayNumber === n)!;

/** 1-based line of the first line containing `needle` (optionally after line `after`). */
function lineOf(text: string, needle: string, after = 0): number {
  const lines = text.split("\n");
  const i = lines.findIndex((l, idx) => idx >= after && l.includes(needle));
  if (i < 0) throw new Error(`fixture: "${needle}" not found`);
  return i + 1;
}

/** Replace exactly one occurrence (after line `after`) and parse; the parse must fail. */
function breakSource(
  find: string,
  replace: string,
  after = 0,
): { src: string; errors: ParseIssue[] } {
  const lines = source.split("\n");
  const at = lineOf(source, find, after) - 1;
  lines[at] = lines[at]!.replace(find, replace);
  const src = lines.join("\n");
  const result = parseExam(src);
  if (result.ok) throw new Error(`expected "${find}" → "${replace}" to fail`);
  return { src, errors: result.errors };
}

describe("parseExam on the real source", () => {
  it("reads the header", () => {
    expect(exam.exam).toEqual({
      slug: "sy0-701",
      title: "CompTIA Security+ (SY0-701) Mock Exam",
      timeLimitMin: 90,
      passScaled: 750,
      comfortScaled: 800,
      domainTarget: 0.81,
    });
    expect(exam.scoring).toMatchObject({
      scaleMin: 100,
      scaleMax: 900,
      totalPoints: 102,
      passPoints: 83,
    });
  });

  it("has 85 MCQs numbered 6–90, 10 PBQs and a key for each", () => {
    expect(mcqs.map((q) => q.displayNumber)).toEqual(
      Array.from({ length: 85 }, (_, i) => String(i + 6)),
    );
    expect(pbqs.map((q) => q.displayNumber)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "B1",
      "B2",
      "B3",
      "B4",
      "B5",
    ]);
    expect(pbqs.map((q) => q.section)).toEqual([
      ...Array(5).fill("pbqA"),
      ...Array(5).fill("pbqB"),
    ]);
    expect(exam.answerKeys.map((k) => k.displayNumber).sort()).toEqual(
      exam.questions.map((q) => q.displayNumber).sort(),
    );
    for (const q of mcqs) {
      expect(q.options.length).toBeGreaterThanOrEqual(4);
      expect(q.options.length).toBeLessThanOrEqual(6);
      for (const id of keyOf(q.displayNumber).correct!)
        expect(q.options.map((o) => o.id)).toContain(id);
    }
  });

  it("detects exactly the four Choose TWO questions, matching two-letter keys (EX-9)", () => {
    const two = mcqs.filter((q) => q.chooseCount === 2).map((q) => q.displayNumber);
    expect(two).toEqual(["20", "26", "50", "78"]);
    expect(mcqs.filter((q) => q.chooseCount !== 1 && q.chooseCount !== 2)).toEqual([]);
    expect(two.map((n) => keyOf(n).correct)).toEqual([
      ["A", "B"],
      ["D", "E"],
      ["B", "E"],
      ["A", "D"],
    ]);
    for (const q of mcqs) expect(keyOf(q.displayNumber).correct).toHaveLength(q.chooseCount);
    expect(mcqs.find((q) => q.displayNumber === "20")!.stem).not.toContain("Choose");
  });

  it("domain totals are 13 + 22 + 19 + 31 + 17 = 102", () => {
    expect(exam.domains.map((d) => [d.domain, d.points])).toEqual([
      ["1.0", 13],
      ["2.0", 22],
      ["3.0", 19],
      ["4.0", 31],
      ["5.0", 17],
    ]);
    const standard = exam.questions.filter((q) => q.section !== "pbqB");
    const byDomain: Record<string, number> = {};
    for (const q of standard) byDomain[q.domain] = (byDomain[q.domain] ?? 0) + q.points;
    expect(byDomain).toEqual({ "1.0": 13, "2.0": 22, "3.0": 19, "4.0": 31, "5.0": 17 });
    expect(standard.reduce((s, q) => s + q.points, 0)).toBe(102);
    expect(exam.domains.reduce((s, d) => s + d.weight, 0)).toBeCloseTo(1);
  });

  it("set B PBQs take their set A twin's template, domain and points", () => {
    for (let n = 1; n <= 5; n++) {
      const a = pbqs.find((q) => q.displayNumber === String(n))!;
      const b = pbqs.find((q) => q.displayNumber === `B${n}`)!;
      expect([b.template, b.domain, b.points]).toEqual([a.template, a.domain, a.points]);
    }
    expect(pbqs.slice(0, 5).map((q) => [q.template, q.domain, q.points])).toEqual([
      ["sshLog", "4.0", 3],
      ["nmap", "2.0", 3],
      ["hashCheck", "1.0", 3],
      ["permissions", "4.0", 4],
      ["firewall", "3.0", 4],
    ]);
  });

  it("normalises every Part 6 PBQ answer", () => {
    const keys = Object.fromEntries(
      pbqs.map((q) => [q.displayNumber, keyOf(q.displayNumber).parts]),
    );
    const practice =
      "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr";
    expect(keys).toEqual({
      "1": {
        parts: { "1a": "193.32.162.71", "1b": "backup", "1c": "54" },
        practice: { "1d": practice },
      },
      "2": { parts: { "2a": "23", "2b": "22", "2c": "21" } },
      "3": { parts: { "3a": "backup-tool-1.8.deb", "3b": "B", "3c": "B" } },
      "4": { parts: { "4a": "/etc/shadow", "4b": "640", "4c": "600", "4d": "PermitRootLogin" } },
      "5": {
        rules: [
          { port: "443", action: "ALLOW" },
          { port: "22", action: "ALLOW" },
          { port: "3306", action: "ALLOW" },
          { port: "Any", action: "DENY" },
        ],
      },
      B1: {
        parts: { B1a: "91.240.118.29", B1b: "svc_web", B1c: "56" },
        practice: { B1d: practice },
      },
      B2: { parts: { B2a: ["110", "995"], B2b: ["143", "993"], B2c: "389" } },
      B3: { parts: { B3a: "agent-installer-v4.2.exe", B3b: "B", B3c: "B" } },
      B4: { parts: { B4a: "/etc/shadow", B4b: "640", B4c: "600", B4d: "PermitRootLogin" } },
      B5: {
        rules: [
          { port: "25", action: "ALLOW" },
          { port: "993", action: "ALLOW" },
          { port: "22", action: "ALLOW" },
          { port: "Any", action: "DENY" },
        ],
      },
    });
    for (const k of exam.answerKeys) expect(k.explanation.length).toBeGreaterThan(20);
  });

  it("builds payloads with the right part kinds and practice parts unscored", () => {
    const kinds = (n: string) => {
      const p = pbqs.find((q) => q.displayNumber === n)!.payload;
      return "parts" in p
        ? p.parts.map((x) => [x.id, x.kind, "scored" in x ? x.scored : true])
        : [];
    };
    expect(kinds("1")).toEqual([
      ["1a", "ip", true],
      ["1b", "text", true],
      ["1c", "integer", true],
      ["1d", "text", false],
    ]);
    expect(kinds("B2")).toEqual([
      ["B2a", "portPair", true],
      ["B2b", "portPair", true],
      ["B2c", "port", true],
    ]);
    expect(kinds("3")).toEqual([
      ["3a", "pick", true],
      ["3b", "mcq", true],
      ["3c", "mcq", true],
    ]);
    expect(kinds("4").map((k) => k[1])).toEqual(["path", "octal", "octal", "directive"]);

    const perms = pbqs.find((q) => q.displayNumber === "4")!.payload;
    if (perms.template !== "permissions") throw new Error("PBQ 4 template");
    expect(perms.listings).toMatch(/^analyst@web01:~\$ ls -l \/etc\n/);
    expect(perms.listings).not.toContain("sshd_config");
    expect(perms.sshdConfig).toMatch(/^analyst@web01:~\$ cat \/etc\/ssh\/sshd_config\n# This is/);
    expect(perms.sshdConfig).toContain("PermitRootLogin yes");

    const fw = pbqs.find((q) => q.displayNumber === "5")!.payload;
    if (fw.template !== "firewall") throw new Error("PBQ 5 template");
    expect(fw.portChoices).toEqual(["Any", "22", "23", "80", "443", "3306", "3389"]);
    expect(fw.actionChoices).toEqual(["ALLOW", "DENY"]);
    expect(fw.requirements).toHaveLength(4);
    expect(fw.rules[2]).toEqual({ source: "10.1.1.10", destination: "10.1.2.20", protocol: "TCP" });
  });

  it("keeps answer keys out of the student-visible question content (SE-1)", () => {
    const visible = JSON.stringify(exam.questions);
    expect(visible).not.toContain('193.32.162.71"');
    expect(visible).not.toContain('PermitRootLogin"');
    for (const q of exam.questions) {
      expect(q).not.toHaveProperty("correct");
      expect(q).not.toHaveProperty("explanation");
      if (q.kind === "pbq") expect(q.payload).not.toHaveProperty("practice");
    }
    for (const k of exam.answerKeys)
      expect(Object.keys(k).sort()).toEqual(
        expect.arrayContaining(["displayNumber", "explanation"]),
      );
  });

  it("reads 10 oral questions, the score table and the lab", () => {
    expect(exam.oralQuestions.map((o) => o.order)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const o of exam.oralQuestions) {
      expect(o.question).not.toMatch(/\*\*/);
      expect(o.modelAnswer.length).toBeGreaterThan(20);
    }
    // Same rows as LLD §8.2 (fixture for T-202).
    expect(exam.scoring.conversion.map((r) => [r.points, r.scaled, r.passed])).toEqual([
      [102, 900, true],
      [95, 845, true],
      [90, 806, true],
      [87, 782, true],
      [83, 751, true],
      [82, 743, false],
      [78, 712, false],
      [70, 649, false],
      [60, 571, false],
    ]);
    expect(exam.lab.steps.map((s) => s.title)).toEqual([
      "Step 1. Build the lab",
      "Step 2. Lab A: find the brute force",
      "Step 3. Lab B: verify the installers",
      "Step 4. Lab C: find and fix permissions",
      "Step 5. Lab D: scan your own machine",
    ]);
    expect(exam.lab.steps[0]!.body).toContain("# ---- Lab A: authentication log ----");
    expect(exam.lab.cheatSheet).toHaveLength(11);
    expect(exam.lab.cheatSheet).toContainEqual({
      command: "sort | uniq -c | sort -nr",
      description: "count repeats and list the most frequent first",
    });
    expect(exam.labAnswers).toHaveLength(4);
  });

  it("is deterministic", () => {
    expect(JSON.stringify(parsed())).toBe(JSON.stringify(exam));
  });
});

describe("parseExam reports format drift with line numbers", () => {
  it("a Choose TWO marker removed from Q20 → error on the key row", () => {
    const { src, errors } = breakSource("**20.** **(Choose TWO)** ", "**20.** ");
    expect(errors).toContainEqual({
      line: lineOf(src, "| 20 | **A, B** |"),
      message: expect.stringMatching(
        /^Q20: key has 2 answers but the question \(line \d+\) is not marked/,
      ),
    });
  });

  it("a Choose TWO marker added where the key has one letter", () => {
    const { src, errors } = breakSource("**6.** ", "**6.** **(Choose TWO)** ");
    expect(errors).toContainEqual({
      line: lineOf(src, "| 6 | **C** |"),
      message: expect.stringMatching(/^Q6: question \(line \d+\) says Choose 2, key has 1/),
    });
  });

  it("a key letter that is not an option", () => {
    const { src, errors } = breakSource("| 6 | **C** |", "| 6 | **F** |");
    expect(errors).toContainEqual({
      line: lineOf(src, "| 6 | **F** |"),
      message: "Q6: key answer F is not one of the options",
    });
  });

  it("a missing key row", () => {
    const { src, errors } = breakSource("| 90 | **D** | 3.0 |", "| 9O | **D** | 3.0 |");
    expect(errors).toContainEqual({
      line: lineOf(src, "**90.**"),
      message: "Q90: no row in the Part 6 key",
    });
    expect(errors.some((e) => e.message.includes('"9O" is not a question number'))).toBe(true);
  });

  it("a question with too few options", () => {
    const { src, errors } = breakSource("- D. Honeypot", "");
    expect(errors).toContainEqual({
      line: lineOf(src, "**6.**"),
      message: "Q6: has 3 options, expected 4–6",
    });
  });

  it("a skipped question number", () => {
    const { src, errors } = breakSource("**7.** ", "**70.** ");
    expect(errors).toContainEqual({
      line: lineOf(src, "**70.** The SOC"),
      message: "Q70: expected question 7 here",
    });
  });

  it("a domain total that does not add up", () => {
    const { src, errors } = breakSource("71, 77, 80, 81 | 13 |", "71, 77, 80, 81 | 14 |");
    expect(errors).toContainEqual({
      line: lineOf(src, "| 1.0 General Security Concepts"),
      message: "domain 1.0: table says 14 points, questions add up to 13",
    });
    expect(
      errors.some((e) => e.message.startsWith("domain table Total is 102, rows add up to 103")),
    ).toBe(true);
  });

  it("a key row domain that disagrees with the domain table", () => {
    const { src, errors } = breakSource("| 6 | **C** | 1.0 |", "| 6 | **C** | 2.0 |");
    expect(errors).toContainEqual({
      line: lineOf(src, "| 6 | **C** | 2.0 |"),
      message: expect.stringMatching(
        /^Q6: key says domain 2\.0, domain table \(line \d+\) says 1\.0$/,
      ),
    });
  });

  it("a firewall key port that is not in the port choices", () => {
    const { src, errors } = breakSource("**443 / ALLOW**", "**8443 / ALLOW**");
    expect(errors).toContainEqual({
      line: lineOf(src, "**PBQ 5. Configure the perimeter firewall**"),
      message: 'PBQ 5 key rules[0].port: "8443" is not in portChoices',
    });
  });

  it("a malformed octal answer", () => {
    const { src, errors } = breakSource("**640  (chmod 640 /etc/shadow)**", "**64x**");
    expect(errors).toContainEqual({
      line: lineOf(src, "**64x**"),
      message: 'PBQ 4 4b: "64x" is not an octal mode',
    });
  });

  it("an hashCheck MCQ answer whose text does not match its option", () => {
    const solutions = lineOf(source, "## Part 1 PBQ solutions");
    const { src, errors } = breakSource("**B. Integrity**", "**B. Availability**", solutions);
    expect(errors).toContainEqual({
      line: lineOf(src, "**B. Availability**"),
      message: "PBQ 3 3c: answer text does not match option B",
    });
  });

  it("a PBQ whose points heading disagrees with its scored parts", () => {
    const { src, errors } = breakSource(
      "## PBQ 2. Find insecure services with nmap (3 points)",
      "## PBQ 2. Find insecure services with nmap (4 points)",
    );
    expect(errors).toContainEqual({
      line: lineOf(src, "## PBQ 2."),
      message: "PBQ 2: heading says 4 points, found 3 scored",
    });
  });

  it("a missing PBQ solution bullet", () => {
    const { src, errors } = breakSource(
      "- Port transferring files in cleartext",
      "Port transferring files in cleartext",
    );
    expect(
      errors.some(
        (e) =>
          e.line === lineOf(src, "**PBQ 2. Find insecure") &&
          e.message === "PBQ 2: no answer for part 2c",
      ),
    ).toBe(true);
  });

  it("a missing oral model answer and a wrong count", () => {
    const { src, errors } = breakSource("Model answer: SLE = 80,000", "SLE = 80,000");
    expect(errors).toContainEqual({
      line: lineOf(src, "**10. Calculate the ALE"),
      message: 'oral question 10: missing "Model answer: …"',
    });
  });

  it("a score conversion row that disagrees with the formula", () => {
    const { src, errors } = breakSource("| 83 | 751 | Pass |", "| 83 | 750 | Pass |");
    expect(errors).toContainEqual({
      line: lineOf(src, "| 83 | 750 | Pass |"),
      message: "Score conversion: 83 points should scale to 751, table says 750",
    });
  });

  it("an unclosed code fence is reported at its opening line", () => {
    const lines = source.split("\n");
    const open = lineOf(source, "```text", lineOf(source, "## PBQ 2.")); // PBQ 2's scan block
    const close = lineOf(source, "```", open); // its closing fence
    lines.splice(close - 1, 1);
    const result = parseExam(lines.join("\n"));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toEqual([
        {
          line: open,
          message: `code fence is not closed before the next fence on line ${lineOf(source, "```text", close) - 1}`,
        },
      ]);
  });

  it("a missing part heading", () => {
    const result = parseExam(source.replace("# Part 4: Retake PBQs (version B)", "## Retake"));
    expect(result.ok).toBe(false);
    if (!result.ok)
      expect(result.errors).toContainEqual({
        line: null,
        message: 'missing "# Part 4: …" heading',
      });
  });

  it("reports several problems at once", () => {
    const src = source
      .replace("| 6 | **C** |", "| 6 | **F** |")
      .replace("**443 / ALLOW**", "**8443 / ALLOW**");
    const result = parseExam(src);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});

describe("markdown helpers", () => {
  it("ignores # lines inside fences when splitting parts", () => {
    const issues = new Issues();
    const lines = scanLines(
      "# Part 1: A\ntext\n```bash\n# Part 2: not a heading\n```\n# Part 2: B\n",
      issues,
    );
    const { sections } = splitSections(lines, 1);
    expect(sections.map((s) => [s.title, s.heading.no])).toEqual([
      ["Part 1: A", 1],
      ["Part 2: B", 6],
    ]);
    expect(issues.list).toEqual([]);
  });

  it("reports an unclosed fence at its opening line", () => {
    const issues = new Issues();
    scanLines("a\n```text\nb\n", issues);
    expect(issues.list).toEqual([{ line: 2, message: "code fence is never closed" }]);
  });

  it("splits table rows but not pipes inside code spans", () => {
    expect(tableCells("| `sort | uniq -c` | count |")).toEqual(["`sort | uniq -c`", "count"]);
    expect(tableCells("| a \\| b | c |")).toEqual(["a | b", "c"]);
    expect(tableCells("not a row")).toBeNull();
  });
});

describe("SE-1: the app never imports the parser, keys or seed", () => {
  it("no file under app/ references scripts/ or content/", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|vue|js|mjs)$/.test(name)) {
          const text = readFileSync(path, "utf8");
          if (/from\s+["'][^"']*(scripts\/|content\/|parse-exam|sy0-701\.json)/.test(text))
            offenders.push(path);
        }
      }
    };
    walk("app");
    expect(offenders).toEqual([]);
  });
});
