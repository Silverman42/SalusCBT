// Markdown exam → SeedExam (LLD §6). Pure: takes the source text, returns the
// seed object or every problem found, each with a source line number.

import {
  Issues,
  isProse,
  paragraphs,
  readTable,
  scanLines,
  splitSections,
  stripBold,
  joinLines,
  type Line,
  type Section,
} from "./markdown";
import { parseMcqKey, parseMcqs, type RawMcq, type RawMcqKey } from "./mcq";
import {
  buildPbq,
  parsePbqPart,
  parseSolutions,
  solutionExplanation,
  type RawPbq,
  type RawSolution,
} from "./pbq";
import type { Domain, ParseResult, SeedAnswerKey, SeedExam, SeedMcq, SeedPbq } from "./types";

/** Parts the parser reads. Part 3 (the paper answer sheet) is optional and ignored. */
const REQUIRED_PARTS = [1, 2, 4, 5, 6];
const KNOWN_PARTS = new Set([1, 2, 3, 4, 5, 6]);

export function parseExam(source: string): ParseResult {
  const issues = new Issues();
  const lines = scanLines(source, issues);

  // --- Top-level split: header, then `# Part N: …` outside fences. --------
  const { preamble, sections: top } = splitSections(lines, 1);
  const titleLine = top[0]; // `# CompTIA Security+ (SY0-701) Mock Exam`
  const parts = new Map<number, Section>();
  const header: Line[] = [...preamble];
  top.forEach((section, i) => {
    const m = /^Part (\d+): (.+)$/.exec(section.title);
    if (i === 0 && !m) {
      header.push(...section.body);
      return;
    }
    if (!m) {
      issues.add(section.heading.no, `unexpected top-level heading "# ${section.title}"`);
      return;
    }
    const n = Number(m[1]);
    if (!KNOWN_PARTS.has(n)) issues.add(section.heading.no, `unknown "# Part ${n}"`);
    else if (parts.has(n)) issues.add(section.heading.no, `duplicate "# Part ${n}"`);
    else parts.set(n, section);
  });
  if (!titleLine || /^Part \d+:/.test(titleLine.title)) {
    issues.add(1, `the file must start with "# <exam title>"`);
  }
  const order = [...parts.keys()];
  for (const n of REQUIRED_PARTS)
    if (!parts.has(n)) issues.add(null, `missing "# Part ${n}: …" heading`);
  if (order.some((n, i) => i > 0 && n < order[i - 1]!))
    issues.add(null, `parts are out of order: ${order.join(", ")}`);
  if (issues.count > 0 || !titleLine) return { ok: false, errors: issues.list };

  const head = parseHeader(titleLine.title, header, issues);

  // --- Question parts. ------------------------------------------------------
  const pbqA = parsePbqPart(parts.get(1)!.body, "A", issues);
  const mcqs = parseMcqs(parts.get(2)!.body, issues);
  const pbqB = parsePbqPart(parts.get(4)!.body, "B", issues);
  const lab = parseLab(parts.get(5)!.body, issues, parts.get(5)!.heading.no);

  // --- Part 6: proctor pack. -----------------------------------------------
  const p6 = parts.get(6)!;
  const p6sections = splitSections(p6.body, 2).sections;
  const find = (prefix: string) => {
    const s = p6sections.find((x) => x.title.startsWith(prefix));
    if (!s) issues.add(p6.heading.no, `Part 6: missing "## ${prefix}…" section`);
    return s;
  };
  const solA = find("Part 1 PBQ solutions");
  const keySec = find("Part 2 multiple-choice key");
  const scoring = find("Scoring");
  const solB = find("Part 4 retake solutions");
  const labAns = find("Part 5 hands-on lab answers");
  const oralSec = find("Oral questions");
  if (!solA || !keySec || !scoring || !solB || !labAns || !oralSec)
    return { ok: false, errors: issues.list };

  const solutions = [...parseSolutions(solA.body, issues), ...parseSolutions(solB.body, issues)];
  const mcqKeys = parseMcqKey(keySec.body, issues, keySec.heading.no);
  const scoringSubs = splitSections(scoring.body, 3).sections;
  const domainSec = scoringSubs.find((s) => s.title === "Domain breakdown");
  const convSec = scoringSubs.find((s) => s.title === "Score conversion");
  if (!domainSec) issues.add(scoring.heading.no, `Scoring: missing "### Domain breakdown"`);
  if (!convSec) issues.add(scoring.heading.no, `Scoring: missing "### Score conversion"`);
  if (!domainSec || !convSec || !head) return { ok: false, errors: issues.list };

  const domainTable = parseDomainTable(domainSec, issues);
  const conversion = parseConversion(convSec, head, issues);
  const oralQuestions = parseOral(oralSec.body, issues, oralSec.heading.no);
  const labAnswers = labAns.body
    .filter((l) => isProse(l) && l.text.startsWith("- "))
    .map((l) => l.text.slice(2).trim());

  // --- Assemble and cross-check. -------------------------------------------
  const questions: (SeedPbq | SeedMcq)[] = [];
  const answerKeys: SeedAnswerKey[] = [];

  const domainOfPbq = new Map(domainTable.pbqs.map((p) => [p.number, p]));
  const solutionById = indexSolutions(solutions, issues);
  const assemblePbqs = (set: RawPbq[], section: "pbqA" | "pbqB") => {
    set.forEach((pbq, i) => {
      const solution = solutionById.get(pbq.id);
      if (!solution) {
        issues.add(pbq.line, `PBQ ${pbq.id}: no solution in Part 6`);
        return;
      }
      solutionById.delete(pbq.id);
      const built = buildPbq(pbq, solution, issues);
      const dom = domainOfPbq.get(pbq.number);
      if (!dom) {
        if (pbq.set === "A")
          issues.add(pbq.line, `PBQ ${pbq.id}: not in the domain breakdown table`);
        return;
      }
      if (!built) return;
      if (pbq.set === "A" && dom.points !== built.points)
        issues.add(
          dom.line,
          `domain table lists PBQ ${pbq.number} as ${dom.points} pts, it has ${built.points}`,
        );
      questions.push({
        order: i + 1,
        section,
        displayNumber: pbq.id,
        kind: "pbq",
        domain: dom.domain, // set B uses its set A twin's domain
        points: built.points,
        stem: pbq.title,
        template: built.template,
        payload: built.payload,
      });
      answerKeys.push({
        displayNumber: pbq.id,
        parts: built.key,
        explanation: solutionExplanation(solution),
      });
    });
  };
  assemblePbqs(pbqA, "pbqA");
  assemblePbqs(pbqB, "pbqB");
  for (const s of solutionById.values())
    issues.add(s.line, `PBQ ${s.id} solution has no matching question`);

  if (head) {
    if (pbqA.length !== head.pbqCount)
      issues.add(head.line, `header says ${head.pbqCount} PBQs, Part 1 has ${pbqA.length}`);
    if (pbqB.length !== pbqA.length)
      issues.add(
        parts.get(4)!.heading.no,
        `set B has ${pbqB.length} PBQs, set A has ${pbqA.length}`,
      );
    if (mcqs.length !== head.mcqCount)
      issues.add(head.line, `header says ${head.mcqCount} MCQs, Part 2 has ${mcqs.length}`);
  }
  const firstMcq = (head?.pbqCount ?? 0) + 1;
  assembleMcqs(mcqs, mcqKeys, firstMcq, domainTable.mcqDomain, questions, answerKeys, issues);
  checkDomainTotals(questions, domainTable, head, issues);

  if (oralQuestions.length !== 10)
    issues.add(oralSec.heading.no, `expected 10 oral questions, found ${oralQuestions.length}`);

  if (issues.count > 0) return { ok: false, errors: issues.list };

  const exam: SeedExam = {
    exam: {
      slug: head.slug,
      title: head.title,
      timeLimitMin: head.timeLimitMin,
      passScaled: head.passScaled,
      comfortScaled: conversion.comfortScaled,
      domainTarget: domainTable.target,
    },
    scoring: {
      scaleMin: head.scaleMin,
      scaleMax: head.scaleMax,
      totalPoints: head.totalPoints,
      passPoints: head.passPoints,
      conversion: conversion.rows,
    },
    domains: domainTable.rows.map(({ domain, name, weight, points }) => ({
      domain,
      name,
      weight,
      points,
    })),
    questions,
    answerKeys,
    oralQuestions,
    lab,
    labAnswers,
  };
  return { ok: true, exam };
}

// ---------------------------------------------------------------------------
// Header
// ---------------------------------------------------------------------------

type Header = {
  line: number;
  title: string;
  slug: string;
  timeLimitMin: number;
  questionCount: number;
  pbqCount: number;
  mcqCount: number;
  passScaled: number;
  scaleMin: number;
  scaleMax: number;
  passPoints: number;
  totalPoints: number;
};

function parseHeader(title: string, lines: Line[], issues: Issues): Header | null {
  const find = (re: RegExp, label: string) => {
    for (const l of lines) {
      const m = isProse(l) ? re.exec(l.text.trim()) : null;
      if (m) return { m, line: l.no };
    }
    issues.add(1, `header: missing or malformed "${label}" line`);
    return null;
  };
  const time = find(/^\*\*Time allowed:\*\*\s*(\d+) minutes\b/, "**Time allowed:** N minutes");
  const qs = find(
    /^\*\*Questions:\*\*\s*(\d+) \((\d+) performance-based, (\d+) multiple choice\)/,
    "**Questions:** N (P performance-based, M multiple choice)",
  );
  const pass = find(
    /^\*\*Passing score:\*\*\s*(\d+) on a (\d+) to (\d+) scale \((\d+) of (\d+) points\b/,
    "**Passing score:** S on a MIN to MAX scale (P of T points …)",
  );
  const slug = /\(([A-Z0-9]+-[A-Z0-9]+)\)/i.exec(title)?.[1]?.toLowerCase();
  if (!slug) issues.add(1, `header: title needs the exam code in parentheses, e.g. "(SY0-701)"`);
  if (!time || !qs || !pass || !slug) return null;
  const [questionCount, pbqCount, mcqCount] = [1, 2, 3].map((i) => Number(qs.m[i]));
  if (pbqCount! + mcqCount! !== questionCount)
    issues.add(qs.line, `header: ${pbqCount} + ${mcqCount} does not equal ${questionCount}`);
  return {
    line: qs.line,
    title,
    slug,
    timeLimitMin: Number(time.m[1]),
    questionCount: questionCount!,
    pbqCount: pbqCount!,
    mcqCount: mcqCount!,
    passScaled: Number(pass.m[1]),
    scaleMin: Number(pass.m[2]),
    scaleMax: Number(pass.m[3]),
    passPoints: Number(pass.m[4]),
    totalPoints: Number(pass.m[5]),
  };
}

// ---------------------------------------------------------------------------
// Part 6 tables
// ---------------------------------------------------------------------------

type DomainTable = {
  target: number;
  rows: { domain: Domain; name: string; weight: number; points: number; line: number }[];
  pbqs: { number: number; points: number; domain: Domain; line: number }[];
  mcqDomain: Map<number, { domain: Domain; line: number }>;
  total: { points: number; line: number } | null;
};

function parseDomainTable(section: Section, issues: Issues): DomainTable {
  const out: DomainTable = { target: 0, rows: [], pbqs: [], mcqDomain: new Map(), total: null };
  const aim = paragraphs(section.body)
    .map((p) => /Aim for (\d+)% or more/.exec(p.text))
    .find(Boolean);
  if (aim) out.target = Number(aim[1]) / 100;
  else issues.add(section.heading.no, `Domain breakdown: missing "Aim for N% or more" target`);

  const table = readTable(section.body);
  if (!table) {
    issues.add(section.heading.no, "Domain breakdown: no table found");
    return out;
  }
  for (const row of table.rows) {
    const [label = "", weightCell = "", list = "", pointsCell = ""] = row.cells;
    if (stripBold(label) === "Total") {
      out.total = { points: Number(stripBold(pointsCell)), line: row.line };
      continue;
    }
    const m = /^([1-5]\.0) (.+)$/.exec(label);
    const weight = /^(\d+)%$/.exec(weightCell);
    if (!m || !weight || !/^\d+$/.test(pointsCell)) {
      issues.add(row.line, `Domain breakdown: cannot read row "${label}"`);
      continue;
    }
    const domain = m[1] as Domain;
    out.rows.push({
      domain,
      name: m[2]!.trim(),
      weight: Number(weight[1]) / 100,
      points: Number(pointsCell),
      line: row.line,
    });
    let rest = list;
    for (const p of list.matchAll(/PBQ (\d+) \((\d+) pts?\)/g)) {
      const number = Number(p[1]);
      if (out.pbqs.some((x) => x.number === number))
        issues.add(row.line, `Domain breakdown: PBQ ${number} is listed twice`);
      out.pbqs.push({ number, points: Number(p[2]), domain, line: row.line });
      rest = rest.replace(p[0], "");
    }
    for (const token of rest
      .split(/[;,]/)
      .map((t) => t.trim())
      .filter(Boolean)) {
      if (!/^\d+$/.test(token)) {
        issues.add(row.line, `Domain breakdown: cannot read "${token}" in ${domain}`);
        continue;
      }
      const q = Number(token);
      if (out.mcqDomain.has(q)) issues.add(row.line, `Domain breakdown: Q${q} is listed twice`);
      out.mcqDomain.set(q, { domain, line: row.line });
    }
  }
  if (!out.total) issues.add(section.heading.no, "Domain breakdown: missing **Total** row");
  return out;
}

function parseConversion(section: Section, head: Header, issues: Issues) {
  const rows: { points: number; scaled: number; passed: boolean }[] = [];
  const table = readTable(section.body);
  if (!table) issues.add(section.heading.no, "Score conversion: no table found");
  for (const row of table?.rows ?? []) {
    const [p = "", s = "", r = ""] = row.cells;
    if (!/^\d+$/.test(p) || !/^\d+$/.test(s)) {
      issues.add(row.line, `Score conversion: cannot read row "${row.cells.join(" | ")}"`);
      continue;
    }
    const points = Number(p);
    const scaled = Number(s);
    const passed = /^pass$/i.test(r);
    const want = Math.round(
      head.scaleMin + ((head.scaleMax - head.scaleMin) * points) / head.totalPoints,
    );
    if (scaled !== want)
      issues.add(
        row.line,
        `Score conversion: ${points} points should scale to ${want}, table says ${scaled}`,
      );
    if (passed !== scaled >= head.passScaled)
      issues.add(
        row.line,
        `Score conversion: result "${r}" disagrees with pass mark ${head.passScaled}`,
      );
    rows.push({ points, scaled, passed });
  }
  const comfort = paragraphs(section.body)
    .map((x) => /score of (\d+) or higher/.exec(x.text))
    .find(Boolean);
  if (!comfort)
    issues.add(section.heading.no, `Score conversion: missing "A score of N or higher" line`);
  return { rows, comfortScaled: comfort ? Number(comfort[1]) : 0 };
}

function parseOral(body: Line[], issues: Issues, sectionLine: number) {
  const out: { order: number; question: string; modelAnswer: string; line: number }[] = [];
  let answering: (typeof out)[number] | null = null;
  for (const line of body) {
    if (!isProse(line)) continue;
    const text = line.text.trim();
    if (text === "") {
      answering = null;
      continue;
    }
    const q = /^\*\*(\d+)\.\s+(.+?)\*\*$/.exec(text);
    if (q) {
      const order = Number(q[1]);
      if (order !== out.length + 1) issues.add(line.no, `oral question ${order} is out of order`);
      answering = { order, question: q[2]!.trim(), modelAnswer: "", line: line.no };
      out.push(answering);
      continue;
    }
    const a = /^Model answer:\s*(.+)$/.exec(text);
    if (a && answering && !answering.modelAnswer) {
      answering.modelAnswer = a[1]!.trim();
    } else if (answering?.modelAnswer) {
      answering.modelAnswer += " " + text; // continuation line
    } else if (out.length > 0) {
      issues.add(line.no, `oral questions: unexpected text "${text.slice(0, 60)}"`);
    }
  }
  for (const o of out)
    if (!o.modelAnswer) issues.add(o.line, `oral question ${o.order}: missing "Model answer: …"`);
  if (out.length === 0) issues.add(sectionLine, "oral questions: none found");
  return out.map(({ order, question, modelAnswer }) => ({ order, question, modelAnswer }));
}

// ---------------------------------------------------------------------------
// Part 5 lab
// ---------------------------------------------------------------------------

function parseLab(body: Line[], issues: Issues, partLine: number): SeedExam["lab"] {
  const { preamble, sections } = splitSections(body, 2);
  const lab: SeedExam["lab"] = { intro: joinLines(trimBlank(preamble)), steps: [], cheatSheet: [] };
  for (const s of sections) {
    if (s.title === "Command cheat sheet") {
      for (const row of readTable(s.body)?.rows ?? []) {
        const [command, description] = row.cells;
        if (!command || !description || row.cells.length !== 2) {
          issues.add(row.line, "cheat sheet: rows need 2 cells (Command | What it does)");
          continue;
        }
        lab.cheatSheet.push({ command: command.replace(/^`(.*)`$/, "$1"), description });
      }
      continue;
    }
    lab.steps.push({ title: s.title, body: joinLines(trimBlank(s.body)) });
  }
  if (lab.steps.length === 0) issues.add(partLine, "Part 5: no lab steps found");
  if (lab.cheatSheet.length === 0) issues.add(partLine, `Part 5: missing "## Command cheat sheet"`);
  return lab;
}

/** Drop leading/trailing blank lines and a trailing `---` rule. */
function trimBlank(lines: Line[]): Line[] {
  const keep = (l: Line) => !(isProse(l) && (l.text.trim() === "" || l.text.trim() === "---"));
  let start = 0;
  let end = lines.length;
  while (start < end && !keep(lines[start]!)) start++;
  while (end > start && !keep(lines[end - 1]!)) end--;
  return lines.slice(start, end);
}

// ---------------------------------------------------------------------------
// Cross-checks
// ---------------------------------------------------------------------------

function indexSolutions(solutions: RawSolution[], issues: Issues): Map<string, RawSolution> {
  const map = new Map<string, RawSolution>();
  for (const s of solutions) {
    if (map.has(s.id)) issues.add(s.line, `PBQ ${s.id}: duplicate solution`);
    else map.set(s.id, s);
  }
  return map;
}

function assembleMcqs(
  mcqs: RawMcq[],
  keys: RawMcqKey[],
  first: number,
  tableDomain: DomainTable["mcqDomain"],
  questions: (SeedPbq | SeedMcq)[],
  answerKeys: SeedAnswerKey[],
  issues: Issues,
) {
  const keyByNumber = new Map<number, RawMcqKey>();
  for (const k of keys) {
    if (keyByNumber.has(k.number)) issues.add(k.line, `MCQ key: Q${k.number} has two rows`);
    else keyByNumber.set(k.number, k);
  }
  const seen = new Set<number>();
  mcqs.forEach((q, i) => {
    const where = `Q${q.number}`;
    if (q.number !== first + i) issues.add(q.line, `${where}: expected question ${first + i} here`);
    if (seen.has(q.number)) issues.add(q.line, `${where}: duplicate question number`);
    seen.add(q.number);
    const key = keyByNumber.get(q.number);
    if (!key) {
      issues.add(q.line, `${where}: no row in the Part 6 key`);
      return;
    }
    keyByNumber.delete(q.number);
    if (key.correct.length !== q.chooseCount)
      issues.add(
        key.line,
        q.chooseCount === 1
          ? `${where}: key has ${key.correct.length} answers but the question (line ${q.line}) is not marked "(Choose …)"`
          : `${where}: question (line ${q.line}) says Choose ${q.chooseCount}, key has ${key.correct.length}`,
      );
    if (new Set(key.correct).size !== key.correct.length)
      issues.add(key.line, `${where}: key repeats an answer`);
    for (const letter of key.correct)
      if (!q.options.some((o) => o.id === letter))
        issues.add(key.line, `${where}: key answer ${letter} is not one of the options`);
    const listed = tableDomain.get(q.number);
    if (!listed) issues.add(key.line, `${where}: not listed in the domain breakdown table`);
    else if (listed.domain !== key.domain)
      issues.add(
        key.line,
        `${where}: key says domain ${key.domain}, domain table (line ${listed.line}) says ${listed.domain}`,
      );
    questions.push({
      order: i + 1,
      section: "mcq",
      displayNumber: String(q.number),
      kind: "mcq",
      domain: key.domain,
      points: 1,
      stem: q.stem,
      options: q.options.map((o) => ({ id: o.id, text: o.text })),
      chooseCount: q.chooseCount,
    });
    answerKeys.push({
      displayNumber: String(q.number),
      correct: key.correct,
      explanation: key.explanation,
    });
  });
  for (const k of keyByNumber.values()) issues.add(k.line, `MCQ key: Q${k.number} has no question`);
  for (const [n, d] of tableDomain)
    if (!seen.has(n)) issues.add(d.line, `Domain breakdown: Q${n} is not a question`);
}

/** Points per domain for the standard sitting (set A + MCQs) must match the Part 6 table. */
function checkDomainTotals(
  questions: (SeedPbq | SeedMcq)[],
  table: DomainTable,
  head: Header | null,
  issues: Issues,
) {
  const standard = questions.filter((q) => q.section !== "pbqB");
  const got = new Map<Domain, number>();
  for (const q of standard) got.set(q.domain, (got.get(q.domain) ?? 0) + q.points);
  let sum = 0;
  for (const row of table.rows) {
    sum += row.points;
    const actual = got.get(row.domain) ?? 0;
    if (actual !== row.points)
      issues.add(
        row.line,
        `domain ${row.domain}: table says ${row.points} points, questions add up to ${actual}`,
      );
  }
  const total = standard.reduce((s, q) => s + q.points, 0);
  if (table.total && table.total.points !== sum)
    issues.add(
      table.total.line,
      `domain table Total is ${table.total.points}, rows add up to ${sum}`,
    );
  if (head && head.totalPoints !== total)
    issues.add(head.line, `header says ${head.totalPoints} points, questions add up to ${total}`);
  const pbqB = questions.filter((q) => q.section === "pbqB").reduce((s, q) => s + q.points, 0);
  const pbqA = questions.filter((q) => q.section === "pbqA").reduce((s, q) => s + q.points, 0);
  if (pbqB !== pbqA) issues.add(null, `set B PBQs are worth ${pbqB} points, set A ${pbqA}`);
}
