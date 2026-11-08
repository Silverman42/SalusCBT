// Parts 1 and 4 (PBQ sets A and B), the Part 6 PBQ solutions, and the
// template builders that turn both into a validated payload + key (LLD §6.1).

import type {
  FirewallAction,
  FirewallRuleRow,
  McqPart,
  PbqKey,
  PbqPayload,
  PbqTemplate,
  PickPart,
  PortPart,
  TextPart,
} from "../../shared/content";
import { validatePayload, validatePbqKey } from "../../shared/validate";
import {
  boldSpans,
  isProse,
  isTableSeparator,
  splitSections,
  stripBold,
  tableCells,
  type Issues,
  type Line,
} from "./markdown";

// ---------------------------------------------------------------------------
// Question side (Parts 1 and 4)
// ---------------------------------------------------------------------------

export type RawPart = {
  id: string; // "1a", "B1d"
  prompt: string;
  scored: boolean;
  line: number;
  options: { id: string; text: string; line: number }[];
};

export type RawPbq = {
  id: string; // "1", "B1"
  set: "A" | "B";
  number: number; // 1..5; set B shares its twin's template and domain
  title: string;
  points: number; // from the heading "(k points)"
  line: number;
  intro: string;
  fences: { line: number; lang: string; text: string }[];
  parts: RawPart[];
  requirements: string[];
  choices?: { ports: string[]; actions: string[]; line: number };
  table: { cells: string[]; line: number }[];
};

/** Set A and set B use the same five templates, in this order. */
export const TEMPLATE_BY_NUMBER: Record<number, PbqTemplate> = {
  1: "sshLog",
  2: "nmap",
  3: "hashCheck",
  4: "permissions",
  5: "firewall",
};

const PRACTICE = /^\(Practice, not scored\)\s*/i;

/** Parse the body of `# Part 1` (set A) or `# Part 4` (set B). */
export function parsePbqPart(body: Line[], set: "A" | "B", issues: Issues): RawPbq[] {
  const prefix = set === "B" ? "B" : "";
  const { sections } = splitSections(body, 2);
  const pbqs: RawPbq[] = [];
  for (const section of sections) {
    const m = /^PBQ (B?)(\d+)\. (.+?) \((\d+) points?\)$/.exec(section.title);
    if (!m) {
      issues.add(
        section.heading.no,
        `expected "## PBQ ${prefix}n. <title> (k points)", got "## ${section.title}"`,
      );
      continue;
    }
    if (m[1] !== prefix) {
      issues.add(section.heading.no, `PBQ ${m[1]}${m[2]} is in the wrong part for set ${set}`);
      continue;
    }
    pbqs.push(parsePbqBody(section.body, set, m, section.heading.no, issues));
  }
  pbqs.forEach((p, i) => {
    if (p.number !== i + 1)
      issues.add(p.line, `PBQ ${p.id}: expected PBQ ${prefix}${i + 1} at this position`);
  });
  return pbqs;
}

function parsePbqBody(
  body: Line[],
  set: "A" | "B",
  m: RegExpExecArray,
  headingLine: number,
  issues: Issues,
): RawPbq {
  const id = `${m[1]}${m[2]}`;
  const pbq: RawPbq = {
    id,
    set,
    number: Number(m[2]),
    title: m[3]!,
    points: Number(m[4]),
    line: headingLine,
    intro: "",
    fences: [],
    parts: [],
    requirements: [],
    table: [],
  };
  const introParas: string[][] = [];
  let fence: { line: number; lang: string; lines: string[] } | null = null;
  let tableHeaderSeen = false;
  const where = `PBQ ${id}`;

  for (const line of body) {
    if (line.fence === "open") {
      fence = { line: line.no, lang: line.lang ?? "", lines: [] };
      continue;
    }
    if (line.fence === "close") {
      if (fence)
        pbq.fences.push({ line: fence.line, lang: fence.lang, text: fence.lines.join("\n") });
      fence = null;
      continue;
    }
    if (line.inFence) {
      fence?.lines.push(line.text);
      continue;
    }
    const text = line.text.trim();
    if (text === "" || text === "---") {
      if (introParas.at(-1)?.length) introParas.push([]);
      continue;
    }

    const part = /^\*\*(B?\d+[a-z])\.\*\*\s+(.+)$/.exec(text);
    if (part) {
      const partId = part[1]!;
      const expected = `${id}${String.fromCharCode(97 + pbq.parts.length)}`;
      if (partId !== expected)
        issues.add(line.no, `${where}: part "${partId}" should be "${expected}"`);
      let prompt = part[2]!.trim();
      const scored = !PRACTICE.test(prompt);
      prompt = prompt.replace(PRACTICE, "");
      pbq.parts.push({ id: partId, prompt, scored, line: line.no, options: [] });
      continue;
    }

    const option = /^- ([A-Z])\.\s+(.+)$/.exec(text);
    if (option) {
      const owner = pbq.parts.at(-1);
      if (!owner) issues.add(line.no, `${where}: option line before any part prompt`);
      else owner.options.push({ id: option[1]!, text: option[2]!.trim(), line: line.no });
      continue;
    }

    const req = /^(\d+)\.\s+(.+)$/.exec(text);
    if (req) {
      if (Number(req[1]) !== pbq.requirements.length + 1)
        issues.add(line.no, `${where}: requirement ${req[1]} is out of order`);
      pbq.requirements.push(req[2]!.trim());
      continue;
    }

    const choices = /^Port choices:\s*(.+?)\.\s*Action choices:\s*(.+?)\.?$/.exec(text);
    if (choices) {
      pbq.choices = {
        ports: splitList(choices[1]!),
        actions: splitList(choices[2]!),
        line: line.no,
      };
      continue;
    }
    if (/^(Port|Action) choices:/i.test(text)) {
      issues.add(line.no, `${where}: expected "Port choices: …. Action choices: …."`);
      continue;
    }

    const cells = tableCells(text);
    if (cells) {
      if (!tableHeaderSeen) tableHeaderSeen = true;
      else if (!isTableSeparator(cells)) pbq.table.push({ cells, line: line.no });
      continue;
    }

    const started =
      pbq.parts.length > 0 || pbq.fences.length > 0 || pbq.requirements.length > 0 || fence;
    if (started) {
      issues.add(line.no, `${where}: unexpected text "${text.slice(0, 60)}"`);
      continue;
    }
    if (introParas.length === 0) introParas.push([]);
    introParas.at(-1)!.push(text);
  }

  pbq.intro = introParas
    .filter((p) => p.length > 0)
    .map((p) => p.join(" "))
    .join("\n\n");
  if (!pbq.intro) issues.add(headingLine, `${where}: has no introduction text`);
  return pbq;
}

const splitList = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

// ---------------------------------------------------------------------------
// Solution side (Part 6)
// ---------------------------------------------------------------------------

export type RawSolution = {
  id: string; // "1", "B2"
  line: number;
  bullets: { text: string; line: number }[];
  explanation: string;
};

/**
 * Parse a Part 6 solutions section (`## Part 1 PBQ solutions` or
 * `## Part 4 retake solutions (version B)`). Each PBQ starts with a bold line
 * `**PBQ n. …**` or `**PBQ Bn (…):**`, then answer bullets, then explanation.
 */
export function parseSolutions(body: Line[], issues: Issues): RawSolution[] {
  const out: RawSolution[] = [];
  let current: (RawSolution & { paras: string[][] }) | null = null;
  const finish = () => {
    if (!current) return;
    current.explanation = current.paras
      .filter((p) => p.length > 0)
      .map((p) => p.join(" "))
      .join("\n\n");
    const { paras: _paras, ...solution } = current;
    out.push(solution);
  };
  for (const line of body) {
    if (!isProse(line)) continue;
    const text = line.text.trim();
    if (text === "") {
      if (current?.paras.at(-1)?.length) current.paras.push([]);
      continue;
    }
    const head = /^\*\*PBQ (B?\d+)\b.*\*\*$/.exec(text);
    if (head) {
      finish();
      current = { id: head[1]!, line: line.no, bullets: [], explanation: "", paras: [[]] };
      continue;
    }
    // A lead-in such as "Version B PBQ 2 and PBQ 5 use different scenarios:".
    if (text.endsWith(":")) continue;
    if (!current) {
      issues.add(line.no, `PBQ solutions: text before the first "**PBQ n. …**" heading`);
      continue;
    }
    const bullet = /^- (.+)$/.exec(text);
    if (bullet) {
      if (current.paras.some((p) => p.length > 0))
        issues.add(line.no, `PBQ ${current.id} solution: answer bullet after the explanation`);
      current.bullets.push({ text: bullet[1]!.trim(), line: line.no });
      continue;
    }
    current.paras.at(-1)!.push(text);
  }
  finish();
  return out;
}

// ---------------------------------------------------------------------------
// Builders: question + solution → payload + key
// ---------------------------------------------------------------------------

export type BuiltPbq = { template: PbqTemplate; payload: PbqPayload; key: PbqKey; points: number };

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const PORT = /^(any|\d{1,5})$/i;

/** Fixed kinds for the free-text templates, by scored-part position. */
const TEXT_KINDS: Partial<Record<PbqTemplate, TextPart["kind"][]>> = {
  sshLog: ["ip", "text", "integer"],
  permissions: ["path", "octal", "octal", "directive"],
};

type Ctx = { pbq: RawPbq; solution: RawSolution; issues: Issues; where: string };

export function buildPbq(pbq: RawPbq, solution: RawSolution, issues: Issues): BuiltPbq | null {
  const template = TEMPLATE_BY_NUMBER[pbq.number];
  const where = `PBQ ${pbq.id}`;
  if (!template) {
    issues.add(pbq.line, `${where}: no template for PBQ number ${pbq.number}`);
    return null;
  }
  const ctx: Ctx = { pbq, solution, issues, where };
  const before = issues.count;
  const built =
    template === "firewall"
      ? buildFirewall(ctx)
      : template === "nmap"
        ? buildNmap(ctx)
        : template === "hashCheck"
          ? buildHashCheck(ctx)
          : buildText(ctx, template);
  if (!built || issues.count > before) return null;

  const payloadCheck = validatePayload(template, built.payload);
  if (!payloadCheck.ok) {
    for (const e of payloadCheck.errors)
      issues.add(pbq.line, `${where} payload ${e.path}: ${e.message}`);
    return null;
  }
  const keyCheck = validatePbqKey(payloadCheck.value, built.key);
  if (!keyCheck.ok) {
    for (const e of keyCheck.errors)
      issues.add(solution.line, `${where} key ${e.path}: ${e.message}`);
    return null;
  }
  if (built.points !== pbq.points)
    issues.add(
      pbq.line,
      `${where}: heading says ${pbq.points} points, found ${built.points} scored`,
    );
  return { template, ...built };
}

function needFences(ctx: Ctx, n: number): boolean {
  if (ctx.pbq.fences.length === n) return true;
  ctx.issues.add(
    ctx.pbq.line,
    `${ctx.where}: expected ${n} text block(s), found ${ctx.pbq.fences.length}`,
  );
  return false;
}

function noExtras(ctx: Ctx, allow: { table?: boolean; requirements?: boolean; options?: boolean }) {
  const { pbq, issues, where } = ctx;
  if (!allow.table && pbq.table.length > 0)
    issues.add(pbq.table[0]!.line, `${where}: unexpected table`);
  if (!allow.requirements && pbq.requirements.length > 0)
    issues.add(pbq.line, `${where}: unexpected numbered requirements`);
  if (!allow.table && pbq.choices)
    issues.add(pbq.choices.line, `${where}: unexpected choices line`);
  if (!allow.options)
    for (const p of pbq.parts)
      if (p.options.length > 0)
        issues.add(p.options[0]!.line, `${where}: part ${p.id} has options`);
}

/**
 * Pair answer bullets with parts. A bullet may name its part (`B2a: …`,
 * `Practice 1d: …`); otherwise scored bullets map to scored parts in order.
 */
function pairBullets(ctx: Ctx) {
  const { pbq, solution, issues, where } = ctx;
  const scored = pbq.parts.filter((p) => p.scored);
  const practice = new Map<string, string>();
  const answers = new Map<string, { text: string; line: number }>();
  let i = 0;
  for (const b of solution.bullets) {
    const prac = /^Practice (B?\d+[a-z]):\s*(.+)$/.exec(b.text);
    if (prac) {
      const part = pbq.parts.find((p) => p.id === prac[1]);
      if (!part || part.scored) issues.add(b.line, `${where}: "${prac[1]}" is not a practice part`);
      else practice.set(part.id, prac[2]!.trim().replace(/^`(.*)`$/, "$1"));
      continue;
    }
    const part = scored[i++];
    if (!part) {
      issues.add(b.line, `${where}: more answer bullets than scored parts (${scored.length})`);
      continue;
    }
    const label = /^(B?\d+[a-z]):\s*/.exec(b.text);
    if (label && label[1] !== part.id)
      issues.add(b.line, `${where}: bullet for "${label[1]}" where "${part.id}" was expected`);
    answers.set(part.id, { text: label ? b.text.slice(label[0].length) : b.text, line: b.line });
  }
  for (const p of scored)
    if (!answers.has(p.id)) issues.add(solution.line, `${where}: no answer for part ${p.id}`);
  for (const p of pbq.parts)
    if (!p.scored && !practice.has(p.id))
      issues.add(solution.line, `${where}: no model answer for practice part ${p.id}`);
  return { scored, practice, answers };
}

/** The first `**bold**` span of a bullet, or an issue. */
function firstBold(ctx: Ctx, partId: string, a: { text: string; line: number }): string | null {
  const bold = boldSpans(a.text)[0];
  if (bold === undefined)
    ctx.issues.add(a.line, `${ctx.where} ${partId}: answer must be in **bold**`);
  return bold ?? null;
}

function normaliseText(
  ctx: Ctx,
  kind: TextPart["kind"],
  partId: string,
  a: { text: string; line: number },
): string | null {
  const raw = firstBold(ctx, partId, a);
  if (raw === null) return null;
  const bad = (what: string) => {
    ctx.issues.add(a.line, `${ctx.where} ${partId}: "${raw}" is not ${what}`);
    return null;
  };
  switch (kind) {
    case "octal": {
      const token = raw.split(/\s+/)[0]!; // "640  (chmod 640 /etc/shadow)" → "640"
      return /^0?[0-7]{3}$/.test(token) ? token.replace(/^0(?=\d{3}$)/, "") : bad("an octal mode");
    }
    case "integer":
      return /^\d+$/.test(raw) ? raw : bad("an integer");
    case "ip":
      return IPV4.test(raw) ? raw : bad("an IPv4 address");
    case "path":
      return raw.startsWith("/") ? raw : bad("an absolute path");
    case "directive":
      return /^[A-Za-z]+$/.test(raw) ? raw : bad("a directive name");
    case "text":
      return raw;
  }
}

function buildText(
  ctx: Ctx,
  template: "sshLog" | "permissions",
): Omit<BuiltPbq, "template"> | null {
  const { pbq, issues, where } = ctx;
  noExtras(ctx, {});
  if (!needFences(ctx, 1)) return null;
  const kinds = TEXT_KINDS[template]!;
  const { scored, practice, answers } = pairBullets(ctx);
  if (scored.length !== kinds.length) {
    issues.add(pbq.line, `${where}: expected ${kinds.length} scored parts, found ${scored.length}`);
    return null;
  }
  const kindOf = new Map(scored.map((p, i) => [p.id, kinds[i]!]));
  const parts: TextPart[] = pbq.parts.map((p) => ({
    id: p.id,
    prompt: p.prompt,
    kind: kindOf.get(p.id) ?? "text",
    scored: p.scored,
  }));
  const keyParts: Record<string, string> = {};
  for (const p of scored) {
    const a = answers.get(p.id);
    const value = a && normaliseText(ctx, kindOf.get(p.id)!, p.id, a);
    if (value) keyParts[p.id] = value;
  }
  const text = pbq.fences[0]!.text;
  let payload: PbqPayload;
  if (template === "sshLog") {
    payload = { template, intro: pbq.intro, log: text, parts };
  } else {
    // One block: `ls` listings, then `cat …sshd_config` and its output.
    const lines = text.split("\n");
    const at = lines.findIndex((l) => /\$ cat \S*sshd_config\s*$/.test(l));
    if (at <= 0) {
      issues.add(pbq.fences[0]!.line, `${where}: no "$ cat …sshd_config" line in the text block`);
      return null;
    }
    payload = {
      template,
      intro: pbq.intro,
      listings: lines.slice(0, at).join("\n").trimEnd(),
      sshdConfig: lines.slice(at).join("\n"),
      parts,
    };
  }
  const key: PbqKey = practice.size
    ? { parts: keyParts, practice: Object.fromEntries(practice) }
    : { parts: keyParts };
  return { payload, key, points: scored.length };
}

function buildNmap(ctx: Ctx): Omit<BuiltPbq, "template"> | null {
  const { pbq, issues, where } = ctx;
  noExtras(ctx, {});
  if (!needFences(ctx, 1)) return null;
  const { scored, answers } = pairBullets(ctx);
  if (scored.length !== pbq.parts.length)
    issues.add(pbq.line, `${where}: nmap PBQs have no practice parts`);
  const parts: PortPart[] = [];
  const keyParts: Record<string, string | string[]> = {};
  for (const p of scored) {
    const a = answers.get(p.id);
    const bolds = a ? boldSpans(a.text) : [];
    // B2a/B2b name two ports (cleartext, then secure) → portPair.
    const kind = bolds.length >= 2 ? "portPair" : "port";
    parts.push({ id: p.id, prompt: p.prompt, kind });
    if (!a) continue;
    if (bolds.length === 0 || bolds.length > 2) {
      issues.add(a.line, `${where} ${p.id}: expected one or two **port** values`);
      continue;
    }
    const bad = bolds.find((b) => !PORT.test(b));
    if (bad) issues.add(a.line, `${where} ${p.id}: "${bad}" is not a port`);
    else keyParts[p.id] = kind === "portPair" ? bolds : bolds[0]!;
  }
  return {
    payload: { template: "nmap", intro: pbq.intro, scan: pbq.fences[0]!.text, parts },
    key: { parts: keyParts },
    points: scored.length,
  };
}

function buildHashCheck(ctx: Ctx): Omit<BuiltPbq, "template"> | null {
  const { pbq, issues, where } = ctx;
  noExtras(ctx, { options: true });
  if (!needFences(ctx, 1)) return null;
  // One block: `cat vendor_hashes.txt` output, a blank line, then `sha256sum` output.
  const fence = pbq.fences[0]!;
  const split = fence.text.split(/\n\s*\n/);
  if (split.length !== 2) {
    issues.add(
      fence.line,
      `${where}: expected vendor hashes and sha256sum output separated by one blank line`,
    );
    return null;
  }
  const [vendorHashes, computed] = split as [string, string];
  const files = [...vendorHashes.matchAll(/^[0-9a-f]{64}\s+(\S+)$/gm)].map((m) => m[1]!);
  if (files.length === 0) issues.add(fence.line, `${where}: no "<sha256>  <file>" lines found`);

  const { scored, answers } = pairBullets(ctx);
  if (scored.length !== pbq.parts.length)
    issues.add(pbq.line, `${where}: hash-check PBQs have no practice parts`);
  const parts: (PickPart | McqPart)[] = [];
  const keyParts: Record<string, string> = {};
  for (const p of scored) {
    const a = answers.get(p.id);
    const bold = a && firstBold(ctx, p.id, a);
    if (p.options.length > 0) {
      const options = p.options.map((o) => ({ id: o.id, text: o.text }));
      parts.push({ id: p.id, prompt: p.prompt, kind: "mcq", options });
      if (!bold) continue;
      // "B. Quarantine it, …" → "B"; the text must match the option.
      const m = /^([A-Z])\.\s+(.+)$/.exec(bold);
      const opt = m && options.find((o) => o.id === m[1]);
      if (!m) issues.add(a.line, `${where} ${p.id}: answer must start with "X. "`);
      else if (!opt) issues.add(a.line, `${where} ${p.id}: option ${m[1]} does not exist`);
      else if (opt.text !== m[2]!.trim())
        issues.add(a.line, `${where} ${p.id}: answer text does not match option ${m[1]}`);
      else keyParts[p.id] = m[1]!;
    } else {
      parts.push({ id: p.id, prompt: p.prompt, kind: "pick", choices: files });
      if (bold) keyParts[p.id] = bold;
    }
  }
  return {
    payload: { template: "hashCheck", intro: pbq.intro, vendorHashes, computed, parts },
    key: { parts: keyParts },
    points: scored.length,
  };
}

function buildFirewall(ctx: Ctx): Omit<BuiltPbq, "template"> | null {
  const { pbq, solution, issues, where } = ctx;
  noExtras(ctx, { table: true, requirements: true });
  if (pbq.parts.length > 0) issues.add(pbq.parts[0]!.line, `${where}: firewall PBQs have no parts`);
  if (!needFences(ctx, 1)) return null;
  if (!pbq.choices) {
    issues.add(pbq.line, `${where}: missing "Port choices: …. Action choices: …." line`);
    return null;
  }
  const rules: FirewallRuleRow[] = [];
  for (const row of pbq.table) {
    const [n, source, destination, port, protocol, action, ...extra] = row.cells;
    if (extra.length > 0 || action === undefined) {
      issues.add(
        row.line,
        `${where}: rule rows need 6 cells (# | Source | Destination | Port | Protocol | Action)`,
      );
      continue;
    }
    if (Number(n) !== rules.length + 1)
      issues.add(row.line, `${where}: rule "${n}" is out of order`);
    if (protocol !== "TCP" && protocol !== "UDP")
      issues.add(row.line, `${where}: protocol "${protocol}" must be TCP or UDP`);
    if (!/^_+$/.test(port!) || !/^_+$/.test(action))
      issues.add(row.line, `${where}: Port and Action must be blanks (______)`);
    rules.push({ source: source!, destination: destination!, protocol: protocol as "TCP" | "UDP" });
  }
  const actions = pbq.choices.actions.filter(
    (a): a is FirewallAction => a === "ALLOW" || a === "DENY",
  );
  if (actions.length !== pbq.choices.actions.length)
    issues.add(pbq.choices.line, `${where}: action choices must be ALLOW or DENY`);

  const keyRules: { port: string; action: FirewallAction }[] = [];
  for (const b of solution.bullets) {
    const m = /^Rule (\d+)\b[^:]*:\s*(.+)$/.exec(b.text);
    if (!m) {
      issues.add(b.line, `${where}: expected "- Rule n (…): **port / ACTION**"`);
      continue;
    }
    if (Number(m[1]) !== keyRules.length + 1)
      issues.add(b.line, `${where}: rule ${m[1]} is out of order`);
    const bold = boldSpans(m[2]!)[0] ?? "";
    const pa = /^(\S+)\s*\/\s*(ALLOW|DENY)$/.exec(bold); // "443 / ALLOW"
    if (!pa) {
      issues.add(b.line, `${where} rule ${m[1]}: "${bold}" must look like **443 / ALLOW**`);
      continue;
    }
    keyRules.push({ port: pa[1]!, action: pa[2] as FirewallAction });
  }
  return {
    payload: {
      template: "firewall",
      intro: pbq.intro,
      requirements: pbq.requirements,
      diagram: pbq.fences[0]!.text,
      rules,
      portChoices: pbq.choices.ports,
      actionChoices: actions,
    },
    key: { rules: keyRules },
    points: rules.length,
  };
}

/** Explanation text for a PBQ key: the prose, or the bullets when there is none (B2). */
export function solutionExplanation(solution: RawSolution): string {
  return solution.explanation || solution.bullets.map((b) => stripBold(b.text)).join("\n");
}
