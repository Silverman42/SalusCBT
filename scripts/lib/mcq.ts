// Part 2 (multiple-choice questions) and the Part 6 MCQ key table.

import { isProse, readTable, type Issues, type Line } from "./markdown";
import type { Domain } from "./types";

export type RawMcq = {
  number: number;
  line: number;
  stem: string;
  chooseCount: number;
  options: { id: string; text: string; line: number }[];
};

export type RawMcqKey = {
  number: number;
  line: number;
  correct: string[];
  domain: Domain;
  explanation: string;
};

const CHOOSE_WORDS: Record<string, number> = { TWO: 2, THREE: 3 };

/** Parse the body of `# Part 2`. */
export function parseMcqs(body: Line[], issues: Issues): RawMcq[] {
  const mcqs: RawMcq[] = [];
  let current: RawMcq | null = null;
  for (const line of body) {
    if (!isProse(line)) {
      if (line.fence === "open")
        issues.add(line.no, "code blocks are not supported in multiple-choice questions");
      continue;
    }
    const text = line.text.trim();
    if (text === "" || text === "---") continue;

    const start = /^\*\*(\d+)\.\*\*\s+(.+)$/.exec(text);
    if (start) {
      let stem = start[2]!.trim();
      let chooseCount = 1;
      const choose = /^\*\*\(Choose (\w+)\)\*\*\s+/.exec(stem);
      if (choose) {
        const n = CHOOSE_WORDS[choose[1]!.toUpperCase()];
        if (!n) issues.add(line.no, `Q${start[1]}: unsupported "(Choose ${choose[1]})" marker`);
        chooseCount = n ?? 1;
        stem = stem.slice(choose[0].length);
      } else if (/\(Choose \w+\)/i.test(stem)) {
        issues.add(line.no, `Q${start[1]}: "(Choose …)" must be bold and lead the question`);
      }
      current = { number: Number(start[1]), line: line.no, stem, chooseCount, options: [] };
      mcqs.push(current);
      continue;
    }

    const option = /^- ([A-Z])\.\s+(.+)$/.exec(text);
    if (option) {
      if (!current) {
        issues.add(line.no, "option line before the first question");
        continue;
      }
      current.options.push({ id: option[1]!, text: option[2]!.trim(), line: line.no });
      continue;
    }

    if (current && current.options.length === 0) {
      // A stem that runs over several lines or paragraphs.
      current.stem += "\n" + text;
      continue;
    }
    issues.add(
      line.no,
      current
        ? `Q${current.number}: unexpected text after the options: "${text.slice(0, 60)}"`
        : `unexpected text before the first question: "${text.slice(0, 60)}"`,
    );
  }

  for (const q of mcqs) {
    const where = `Q${q.number}`;
    if (q.options.length < 4 || q.options.length > 6)
      issues.add(q.line, `${where}: has ${q.options.length} options, expected 4–6`);
    q.options.forEach((o, i) => {
      const want = String.fromCharCode(65 + i);
      if (o.id !== want) issues.add(o.line, `${where}: option "${o.id}" should be "${want}"`);
    });
    if (q.chooseCount >= q.options.length)
      issues.add(q.line, `${where}: chooses ${q.chooseCount} of ${q.options.length} options`);
  }
  return mcqs;
}

/** MCQs must be numbered `first`, `first + 1`, … with no gaps or repeats. */
export function checkMcqNumbering(mcqs: RawMcq[], first: number, issues: Issues): void {
  const seen = new Set<number>();
  mcqs.forEach((q, i) => {
    const where = `Q${q.number}`;
    if (q.number !== first + i) issues.add(q.line, `${where}: expected question ${first + i} here`);
    if (seen.has(q.number)) issues.add(q.line, `${where}: duplicate question number`);
    seen.add(q.number);
  });
}

/** Parse the `## Part 2 multiple-choice key` table. */
export function parseMcqKey(body: Line[], issues: Issues, sectionLine: number): RawMcqKey[] {
  const table = readTable(body);
  if (!table) {
    issues.add(sectionLine, "MCQ key: no table found");
    return [];
  }
  const keys: RawMcqKey[] = [];
  for (const row of table.rows) {
    const [q, answer, domain, why, ...extra] = row.cells;
    const num = /^\d+$/.test(q ?? "") ? Number(q) : NaN;
    const letters = /^\*\*([A-Z](?:\s*,\s*[A-Z])*)\*\*$/.exec(answer ?? "");
    const dom = /^([1-5])\.0$/.exec(domain ?? "");
    if (extra.length > 0 || !why) {
      issues.add(row.line, `MCQ key: expected 4 cells (Q | Answer | Domain | Why)`);
      continue;
    }
    if (Number.isNaN(num)) {
      issues.add(row.line, `MCQ key: "${q}" is not a question number`);
      continue;
    }
    if (!letters) {
      issues.add(row.line, `MCQ key Q${num}: answer "${answer}" must look like **A** or **A, B**`);
      continue;
    }
    if (!dom) {
      issues.add(row.line, `MCQ key Q${num}: domain "${domain}" must be 1.0–5.0`);
      continue;
    }
    keys.push({
      number: num,
      line: row.line,
      correct: letters[1]!.split(",").map((s) => s.trim()),
      domain: `${dom[1]}.0` as Domain,
      explanation: why,
    });
  }
  return keys;
}
