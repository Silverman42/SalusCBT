// T-301 (Stage 3 gate): all 10 PBQs mark correctly against the Part 6 solutions.
//
// Answers are rebuilt from the human-readable source (Part 1 / Part 4 exhibits
// and the Part 6 proctor pack), not copied from the answer-key objects, so each
// test exercises the whole chain: source → parser → committed seed → marking.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnswerValue, PayloadOf, PbqPart } from "../../shared/content";
import type { SeedAnswerKey, SeedExam, SeedPbq } from "../../scripts/lib/types";
import {
  scorePaper,
  scoreQuestion,
  type MarkKey,
  type MarkQuestion,
} from "../../convex/marking/score";

const source = readFileSync("content/source/secplus-701-mock-exam.md", "utf8");
const seed = JSON.parse(readFileSync("content/seed/sy0-701.json", "utf8")) as SeedExam;

// ---------------------------------------------------------------------------
// Source helpers (deliberately independent of scripts/lib).

/** Text from the line matching `start` up to (not including) the next line matching `end`. */
function between(text: string, start: RegExp, end: RegExp): string {
  const lines = text.split("\n");
  const from = lines.findIndex((l) => start.test(l));
  if (from < 0) throw new Error(`No line matches ${String(start)}`);
  const to = lines.findIndex((l, i) => i > from && end.test(l));
  return lines.slice(from, to < 0 ? undefined : to).join("\n");
}

/** The first fenced code block in `text`. */
function codeBlock(text: string): string {
  const m = /```\w*\n([\s\S]*?)\n```/.exec(text);
  if (!m) throw new Error("No code block");
  return m[1]!;
}

const part6A = between(source, /^## Part 1 PBQ solutions/, /^## Part 2 /);
const part6B = between(source, /^## Part 4 retake solutions/, /^## Part 5 /);

/** The Part 6 solution block for one PBQ (`**PBQ 1. …**` or `**PBQ B2 (…)**`). */
function solutionBlock(n: string): string {
  const part6 = n.startsWith("B") ? part6B : part6A;
  return between(part6, new RegExp(`^\\*\\*PBQ ${n}[. ]`), /^\*\*PBQ |^Version B /);
}

/** `- Label: **answer**` bullets of a solution block, in order (practice bullets excluded). */
function boldBullets(block: string): { label: string; answer: string }[] {
  return [...block.matchAll(/^- (.+?): \*\*(.+?)\*\*\s*$/gm)].map((m) => ({
    label: m[1]!,
    answer: m[2]!,
  }));
}

/** `- Practice 1d: \`command\`` → the practice answer. */
function practiceAnswer(block: string, id: string): string {
  const m = new RegExp(`^- Practice ${id}: \`(.+)\`\\s*$`, "m").exec(block);
  if (!m) throw new Error(`No practice answer for ${id}`);
  return m[1]!;
}

/** The Part 1 / Part 4 question section for one PBQ (`## PBQ 1.` / `## PBQ B1.`). */
function questionSection(n: string): string {
  return between(source, new RegExp(`^## PBQ ${n}\\. `), /^## |^---$/);
}

/** What a student would type for a bolded solution like `640  (chmod 640 /etc/shadow)`. */
const typed = (answer: string) => answer.split(/\s{2,}\(/)[0]!.trim();

// ---------------------------------------------------------------------------
// Seed helpers.

const pbqs = seed.questions.filter((q): q is SeedPbq => q.kind === "pbq");
const keys = new Map<string, SeedAnswerKey>(seed.answerKeys.map((k) => [k.displayNumber, k]));

function pbq(n: string): { q: SeedPbq; key: MarkKey } {
  const q = pbqs.find((p) => p.displayNumber === n);
  const key = keys.get(n);
  if (!q || !key) throw new Error(`PBQ ${n} missing from the seed`);
  return { q, key };
}

const parts = (q: SeedPbq): PbqPart[] => ("parts" in q.payload ? q.payload.parts : []);
const scoredParts = (q: SeedPbq) => parts(q).filter((p) => !("scored" in p) || p.scored);

const answer = (partAnswers: Record<string, string | string[]>): AnswerValue => ({
  kind: "pbq",
  parts: partAnswers,
});
const rules = (...r: [string | null, string | null][]): AnswerValue => ({
  kind: "firewall",
  rules: r.map(([port, action]) => ({ port, action })),
});

const score = (n: string, value: AnswerValue | null) => {
  const { q, key } = pbq(n);
  return scoreQuestion(q, key, value);
};

/** Build the student's answer to a non-firewall PBQ from its Part 6 bullets. */
function solutionAnswer(n: string): Record<string, string | string[]> {
  const { q } = pbq(n);
  const scored = scoredParts(q);
  const block = solutionBlock(n);
  const out: Record<string, string | string[]> = {};

  if (q.template === "nmap" && n.startsWith("B")) {
    // `- B2a: **110** is cleartext POP3; use **995** (POP3S).`
    for (const m of block.matchAll(/^- (B2[a-z]): (.+)$/gm)) {
      const id = m[1]!;
      const ports = [...m[2]!.matchAll(/\*\*(\d+)\*\*/g)].map((p) => p[1]!);
      const part = scored.find((p) => p.id === id);
      if (!part) throw new Error(`${id} not in payload`);
      out[id] = part.kind === "portPair" ? ports : ports[0]!;
    }
  } else {
    const bullets = boldBullets(block);
    expect(bullets).toHaveLength(scored.length);
    scored.forEach((part, i) => {
      const text = typed(bullets[i]!.answer);
      if (part.kind === "mcq") {
        // `B. Quarantine it, …`: the letter, and the text must match the payload option.
        const m = /^([A-F])\. (.+)$/.exec(text);
        if (!m) throw new Error(`${part.id}: not an option: ${text}`);
        expect(part.options.find((o) => o.id === m[1])?.text).toBe(m[2]);
        out[part.id] = m[1]!;
      } else {
        if (part.kind === "pick") expect(part.choices).toContain(text);
        out[part.id] = text;
      }
    });
  }
  expect(Object.keys(out).sort()).toEqual(scored.map((p) => p.id).sort());
  return out;
}

/** Firewall rules from `- Rule 1 (Any to 10.1.1.10): **443 / ALLOW**`, checked against the payload rows. */
function solutionRules(n: string): [string, string][] {
  const { q } = pbq(n);
  const payload = q.payload as PayloadOf<"firewall">;
  const found = [
    ...solutionBlock(n).matchAll(/^- Rule (\d+) \((.+?) to (.+?)\): \*\*(\S+) \/ (\S+)\*\*/gm),
  ];
  expect(found).toHaveLength(payload.rules.length);
  return found.map((m, i) => {
    expect(Number(m[1])).toBe(i + 1);
    expect(m[2]).toBe(payload.rules[i]!.source);
    expect(m[3]).toBe(payload.rules[i]!.destination);
    expect(payload.portChoices).toContain(m[4]);
    expect(payload.actionChoices).toContain(m[5]);
    return [m[4]!, m[5]!];
  });
}

/** Points shown in the `## PBQ n. Title (k points)` heading. */
function headingPoints(n: string): number {
  const m = new RegExp(`^## PBQ ${n}\\. .+ \\((\\d+) points\\)$`, "m").exec(source);
  if (!m) throw new Error(`No heading for PBQ ${n}`);
  return Number(m[1]);
}

/** Points for PBQ n in the Part 6 domain table (`PBQ 3 (3 pts)`); B PBQs replace their A twin. */
function domainTablePoints(n: string): { domain: string; points: number } {
  const table = between(source, /^### Domain breakdown/, /^### Score conversion/);
  const a = n.replace(/^B/, "");
  for (const row of table.split("\n")) {
    const m = new RegExp(`PBQ ${a} \\((\\d+) pts\\)`).exec(row);
    const domain = /^\| (\d\.0) /.exec(row)?.[1];
    if (m && domain) return { domain, points: Number(m[1]) };
  }
  throw new Error(`PBQ ${a} not in the domain table`);
}

// ---------------------------------------------------------------------------
// Exhibit helpers: rederive the answers from the logs / listings the student sees.

type LogLine = { failed: boolean; text: string; ip?: string };

function authLog(n: string): LogLine[] {
  return codeBlock(questionSection(n))
    .split("\n")
    .filter((l) => / sshd\[\d+\]: /.test(l))
    .map((text) => {
      const failed = text.includes("Failed password");
      const fields = text.trim().split(/\s+/);
      // awk '{print $(NF-3)}' on a "Failed password … from IP port N ssh2" line
      return { failed, text, ip: failed ? fields[fields.length - 4] : undefined };
    });
}

function failuresByIp(log: LogLine[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const l of log) if (l.ip) counts.set(l.ip, (counts.get(l.ip) ?? 0) + 1);
  return [...counts].sort((x, y) => y[1] - x[1]);
}

function accepted(log: LogLine[]): { user: string; ip: string }[] {
  return log.flatMap((l) => {
    const m = /Accepted \S+ for (\S+) from (\S+)/.exec(l.text);
    return m ? [{ user: m[1]!, ip: m[2]! }] : [];
  });
}

function hashes(n: string): { vendor: Map<string, string>; computed: Map<string, string> } {
  const [vendor, computed] = codeBlock(questionSection(n))
    .split(/^.*\$ sha256sum .*$/m)
    .map(
      (chunk) =>
        new Map(
          [...chunk.matchAll(/^([0-9a-f]{64}) {2}(\S+)$/gm)].map((m) => [m[2]!, m[1]!] as const),
        ),
    );
  return { vendor: vendor!, computed: computed! };
}

// ---------------------------------------------------------------------------

const SSH = ["1", "B1"] as const;
const NMAP_A = "2";
const NMAP_B = "B2";
const HASH = ["3", "B3"] as const;
const PERMS = ["4", "B4"] as const;
const ALL = ["1", "2", "3", "4", "5", "B1", "B2", "B3", "B4", "B5"] as const;

const isFirewall = (n: string) => pbq(n).q.template === "firewall";
const fullSolution = (n: string): AnswerValue =>
  isFirewall(n) ? rules(...solutionRules(n)) : answer(solutionAnswer(n));

describe("every PBQ: points and the Part 6 solution", () => {
  it("the seed has exactly the 10 PBQs 1–5 and B1–B5", () => {
    expect(pbqs.map((p) => p.displayNumber).sort()).toEqual([...ALL].sort());
  });

  describe.each(ALL)("PBQ %s", (n) => {
    it("max equals the heading points, the domain-table points and q.points", () => {
      const { q } = pbq(n);
      const table = domainTablePoints(n);
      const r = scoreQuestion(q, pbq(n).key, null);
      expect(r).toMatchObject({ earned: 0, max: q.points });
      expect(q.points).toBe(headingPoints(n));
      expect(q.points).toBe(table.points);
      expect(q.domain).toBe(table.domain);
    });

    it("the Part 6 solution scores full marks, every part true", () => {
      const r = score(n, fullSolution(n));
      expect(r.earned).toBe(pbq(n).q.points);
      expect(r.max).toBe(pbq(n).q.points);
      expect(r.parts).toEqual(Array<boolean>(r.max).fill(true));
    });

    it("a blank, empty or wrong-shaped answer scores 0 of max", () => {
      const { q } = pbq(n);
      for (const v of [
        null,
        answer({}),
        rules(),
        { kind: "mcq", optionIds: ["B"] } satisfies AnswerValue,
      ]) {
        expect(score(n, v)).toMatchObject({ earned: 0, max: q.points });
      }
      // The right content in the wrong envelope never scores.
      const wrongEnvelope: AnswerValue = isFirewall(n)
        ? answer({ "1": "443" })
        : rules(["22", "ALLOW"], ["22", "ALLOW"], ["22", "ALLOW"], ["22", "ALLOW"]);
      expect(score(n, wrongEnvelope).earned).toBe(0);
    });
  });
});

describe.each(SSH)("PBQ %s · SSH brute-force log", (n) => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((s) => `${n}${s}`) as [
    string,
    string,
    string,
    string,
  ];
  const log = authLog(n);
  const ranked = failuresByIp(log);
  const [attackerIp, failures] = ranked[0]!;

  it("the Part 6 solution agrees with the log the student sees", () => {
    const sol = solutionAnswer(n);
    expect(sol[a]).toBe(attackerIp);
    expect(Number(sol[c])).toBe(failures);
    expect(accepted(log)).toContainEqual({ user: sol[b], ip: attackerIp });
  });

  it("accepts normaliser variants (whitespace, case, leading zeros, thousands form)", () => {
    const sol = solutionAnswer(n) as Record<string, string>;
    const zeroPadded = sol[a]!.split(".")
      .map((o) => o.padStart(3, "0"))
      .join(".");
    for (const v of [
      { [a]: ` ${sol[a]} `, [b]: sol[b]!.toUpperCase(), [c]: ` ${sol[c]}\t` },
      { [a]: zeroPadded, [b]: `  ${sol[b]!.toUpperCase()}`, [c]: `0${sol[c]}` },
    ]) {
      expect(score(n, answer(v)).earned).toBe(3);
    }
  });

  it("the `grep IP | wc -l` over-count loses exactly 1c", () => {
    const overCount = log.filter((l) => l.text.includes(attackerIp)).length;
    expect(overCount).toBeGreaterThan(failures); // Invalid user + Accepted lines also match
    const r = score(n, answer({ ...solutionAnswer(n), [c]: String(overCount) }));
    expect(r).toMatchObject({ earned: 2, parts: [true, true, false] });
  });

  it("counting every Failed password line (all sources) loses exactly 1c", () => {
    const all = log.filter((l) => l.failed).length;
    expect(all).toBeGreaterThan(failures);
    expect(score(n, answer({ ...solutionAnswer(n), [c]: String(all) })).earned).toBe(2);
  });

  it("decoy sources (the scanner, the user mistyping a password) lose exactly 1a", () => {
    expect(ranked.length).toBeGreaterThanOrEqual(3);
    for (const [ip] of ranked.slice(1)) {
      const r = score(n, answer({ ...solutionAnswer(n), [a]: ip }));
      expect(r).toMatchObject({ earned: 2, parts: [false, true, true] });
    }
  });

  it("decoy accounts (legit logins, root, invalid users) lose exactly 1b", () => {
    const sol = solutionAnswer(n);
    const decoys = new Set(accepted(log).map((x) => x.user));
    decoys.add("root");
    decoys.add("ubuntu");
    decoys.delete(sol[b] as string);
    expect(decoys.size).toBeGreaterThanOrEqual(3);
    for (const user of decoys) {
      const r = score(n, answer({ ...sol, [b]: user }));
      expect(r).toMatchObject({ earned: 2, parts: [true, false, true] });
    }
  });

  it("invalid IPs never match", () => {
    for (const bad of [`${attackerIp}.1`, attackerIp.replace(/^\d+/, "256"), "", "   "]) {
      expect(score(n, answer({ ...solutionAnswer(n), [a]: bad })).earned).toBe(2);
    }
  });

  it("the practice part never adds points", () => {
    const practice = practiceAnswer(solutionBlock(n), d);
    const sol = solutionAnswer(n);
    expect(score(n, answer({ ...sol, [d]: practice }))).toMatchObject({ earned: 3, max: 3 });
    expect(score(n, answer({ [d]: practice }))).toMatchObject({ earned: 0, max: 3 });
    expect(score(n, answer({ ...sol, [a]: "1.2.3.4", [d]: practice })).earned).toBe(2);
    expect(score(n, answer({ ...sol, [d]: "rm -rf /" })).earned).toBe(3);
  });

  it("extra, unknown part ids are ignored", () => {
    expect(score(n, answer({ ...solutionAnswer(n), [`${n}z`]: "x" })).earned).toBe(3);
  });
});

describe(`PBQ ${NMAP_A} · nmap file server`, () => {
  const n = NMAP_A;

  it("the solution ports are open in the scan", () => {
    const scan = codeBlock(questionSection(n));
    for (const p of Object.values(solutionAnswer(n))) expect(scan).toMatch(`\n${String(p)}/tcp`);
  });

  it("accepts whitespace and leading-zero variants", () => {
    expect(score(n, answer({ "2a": " 23", "2b": "022 ", "2c": "021" })).earned).toBe(3);
  });

  it("swapping telnet and SSH loses both 2a and 2b", () => {
    expect(score(n, answer({ "2a": "22", "2b": "23", "2c": "21" }))).toMatchObject({
      earned: 1,
      parts: [false, false, true],
    });
  });

  it.each([
    ["2a", "21", [false, true, true]], // FTP is not the shell
    ["2b", "3306", [true, false, true]],
    ["2c", "22", [true, true, false]], // SFTP runs on 22, but 2c asks for the cleartext port
    ["2c", "445", [true, true, false]],
    ["2a", "0", [false, true, true]],
    ["2a", "65536", [false, true, true]],
  ])("%s = %s loses exactly that part", (id, port, expected) => {
    const r = score(n, answer({ ...solutionAnswer(n), [id]: port }));
    expect(r).toMatchObject({ earned: 2, parts: expected });
  });
});

describe(`PBQ ${NMAP_B} · nmap mail server (port pairs)`, () => {
  const n = NMAP_B;

  it("the solution matches the scan: cleartext ports open; 993 open, 995 not yet", () => {
    const scan = codeBlock(questionSection(n));
    const sol = solutionAnswer(n);
    expect(sol).toEqual({ B2a: ["110", "995"], B2b: ["143", "993"], B2c: "389" });
    for (const p of ["110", "143", "389", "993"]) expect(scan).toMatch(`\n${p}/tcp`);
    expect(scan).not.toMatch("\n995/tcp");
  });

  it("accepts whitespace and leading-zero variants inside the pair", () => {
    const v = answer({ B2a: [" 110", "0995"], B2b: ["143 ", " 993 "], B2c: "0389" });
    expect(score(n, v).earned).toBe(3);
  });

  it("port order in a pair matters (cleartext first, secure second)", () => {
    const sol = solutionAnswer(n);
    expect(score(n, answer({ ...sol, B2a: ["995", "110"] }))).toMatchObject({
      earned: 2,
      parts: [false, true, true],
    });
    expect(score(n, answer({ ...sol, B2b: ["993", "143"] }))).toMatchObject({
      earned: 2,
      parts: [true, false, true],
    });
  });

  it.each([
    ["B2a", ["110"]], // half a pair
    ["B2a", ["110", "995", "993"]],
    ["B2a", ["110", "993"]], // IMAPS, not POP3S
    ["B2b", ["110", "995"]], // 995 is not open yet
    ["B2b", ["143", "636"]],
    ["B2c", "636"], // closing LDAPS is backwards
    ["B2c", ["389", "636"]], // a pair where one port is asked
  ] as [string, string | string[]][])("%s = %j loses exactly that part", (id, value) => {
    expect(score(n, answer({ ...solutionAnswer(n), [id]: value })).earned).toBe(2);
  });
});

describe.each(HASH)("PBQ %s · installer integrity", (n) => {
  const [a, b, c] = ["a", "b", "c"].map((s) => `${n}${s}`) as [string, string, string];
  const { vendor, computed } = hashes(n);
  const failed = [...vendor.keys()].filter((f) => vendor.get(f) !== computed.get(f));

  it("exactly one file fails, it is the Part 6 answer, and it is a near-miss hash", () => {
    expect(vendor.size).toBe(4);
    expect(failed).toEqual([solutionAnswer(n)[a]]);
    const [want, got] = [vendor.get(failed[0]!)!, computed.get(failed[0]!)!];
    expect(got.slice(0, 5)).toBe(want.slice(0, 5));
    expect(got.slice(-5)).toBe(want.slice(-5));
  });

  it("picking any file that passed (e.g. after comparing only the first characters) loses exactly 3a", () => {
    const passed = [...vendor.keys()].filter((f) => !failed.includes(f));
    expect(passed).toHaveLength(3);
    for (const file of passed) {
      const r = score(n, answer({ ...solutionAnswer(n), [a]: file }));
      expect(r).toMatchObject({ earned: 2, parts: [false, true, true] });
    }
  });

  it("each wrong option on 3b / 3c loses exactly that part", () => {
    for (const [id, idx] of [
      [b, 1],
      [c, 2],
    ] as const) {
      for (const opt of ["A", "C", "D"]) {
        const r = score(n, answer({ ...solutionAnswer(n), [id]: opt }));
        expect(r.earned).toBe(2);
        expect(r.parts?.[idx]).toBe(false);
      }
    }
  });

  it("D. Non-repudiation (needs a signature, not a hash) is wrong for 3c", () => {
    expect(score(n, answer({ ...solutionAnswer(n), [c]: "D" })).earned).toBe(2);
  });

  it("pick and option ids are exact: no case folding, no partial filename", () => {
    const sol = solutionAnswer(n) as Record<string, string>;
    expect(score(n, answer({ ...sol, [a]: sol[a]!.toUpperCase() })).earned).toBe(2);
    expect(score(n, answer({ ...sol, [a]: sol[a]!.replace(/\.\w+$/, "") })).earned).toBe(2);
    expect(score(n, answer({ ...sol, [b]: "b" })).earned).toBe(2);
  });
});

describe.each(PERMS)("PBQ %s · permissions and SSH", (n) => {
  const [a, b, c, d] = ["a", "b", "c", "d"].map((s) => `${n}${s}`) as [
    string,
    string,
    string,
    string,
  ];
  const listing = codeBlock(questionSection(n));

  it("the solution file is the only /etc entry writable by others", () => {
    const etc = between(listing, /\$ ls -l \/etc$/, /^$/)
      .split("\n")
      .filter((l) => /^[-d]/.test(l));
    const worldWritable = etc.filter((l) => l[8] === "w").map((l) => l.split(/\s+/).pop());
    expect(worldWritable).toEqual(["shadow"]);
    expect(solutionAnswer(n)[a]).toBe("/etc/shadow");
    expect(listing).toMatch(/^PermitRootLogin yes$/m);
  });

  it("accepts LLD variants: `shadow` for /etc/shadow, 0640 / 0600, any-case directive", () => {
    for (const v of [
      { [a]: "shadow", [b]: "0640", [c]: "0600", [d]: "permitrootlogin" },
      { [a]: " /etc/shadow ", [b]: " 640", [c]: "600 ", [d]: "  PERMITROOTLOGIN " },
    ]) {
      expect(score(n, answer(v))).toMatchObject({ earned: 4, max: 4 });
    }
  });

  it("644 instead of 640 loses exactly 4b", () => {
    const r = score(n, answer({ ...solutionAnswer(n), [b]: "644" }));
    expect(r).toMatchObject({ earned: 3, parts: [true, false, true, true] });
  });

  it("leaving id_rsa at 644 (its current mode) loses exactly 4c", () => {
    expect(listing).toMatch(/^-rw-r--r-- .* id_rsa$/m);
    const r = score(n, answer({ ...solutionAnswer(n), [c]: "644" }));
    expect(r).toMatchObject({ earned: 3, parts: [true, true, false, true] });
  });

  it.each([
    [a, "/etc/passwd"],
    [a, "/etc/sudoers"],
    [a, "/ETC/SHADOW"], // paths are case-sensitive
    [a, "/home/deploy/.ssh/id_rsa"],
    [b, "777"],
    [b, "rw-r-----"], // symbolic form is not an octal mode
    [b, "00640"],
    [b, "648"],
    [c, "640"],
    [c, "700"],
    [d, "PasswordAuthentication"], // a good fix, but not the one asked for
    [d, "PermitEmptyPasswords"],
    [d, "Permit Root Login"],
  ])("%s = %s loses exactly that part", (id, value) => {
    const r = score(n, answer({ ...solutionAnswer(n), [id]: value }));
    expect(r.earned).toBe(3);
  });

  it("swapping 4b and 4c loses both", () => {
    const r = score(n, answer({ ...solutionAnswer(n), [b]: "600", [c]: "640" }));
    expect(r).toMatchObject({ earned: 2, parts: [true, false, false, true] });
  });
});

describe(`PBQ 5 · perimeter firewall (web)`, () => {
  const n = "5";

  it("the solution is 443/ALLOW, 22/ALLOW, 3306/ALLOW, Any/DENY", () => {
    expect(solutionRules(n)).toEqual([
      ["443", "ALLOW"],
      ["22", "ALLOW"],
      ["3306", "ALLOW"],
      ["Any", "DENY"],
    ]);
  });

  it("accepts `any` in any case and padded / zero-led ports", () => {
    const v = rules([" 443 ", "ALLOW"], ["022", "ALLOW"], ["3306", "ALLOW"], ["any", "DENY"]);
    expect(score(n, v).earned).toBe(4);
    expect(score(n, rules(...solutionRules(n).slice(0, 3), ["ANY", "DENY"])).earned).toBe(4);
  });

  it.each([
    [0, "80", "ALLOW"], // HTTP is not "HTTPS only"
    [0, "3389", "ALLOW"],
    [0, "443", "DENY"], // right port, wrong action
    [1, "23", "ALLOW"], // telnet is not SSH
    [1, "22", "DENY"],
    [2, "Any", "ALLOW"],
    [2, "3306", "DENY"],
    [3, "Any", "ALLOW"], // last rule must be the deny-all
    [3, "443", "DENY"],
    [3, null, "DENY"],
    [3, "Any", null],
  ] as [number, string | null, string | null][])(
    "rule %i = %s / %s loses exactly that rule",
    (i, port, action) => {
      const sol: [string | null, string | null][] = solutionRules(n);
      sol[i] = [port, action];
      const r = score(n, rules(...sol));
      expect(r.earned).toBe(3);
      expect(r.parts?.[i]).toBe(false);
    },
  );

  it("rule order matters: deny-all first loses rules 1 and 4", () => {
    const sol = solutionRules(n);
    const r = score(n, rules(sol[3]!, sol[1]!, sol[2]!, sol[0]!));
    expect(r).toMatchObject({ earned: 2, parts: [false, true, true, false] });
  });

  it("swapping rules 1 and 2 loses both", () => {
    const sol = solutionRules(n);
    expect(score(n, rules(sol[1]!, sol[0]!, sol[2]!, sol[3]!)).earned).toBe(2);
  });

  it("missing rows score 0; extra rows add nothing", () => {
    const sol = solutionRules(n);
    expect(score(n, rules(...sol.slice(0, 2)))).toMatchObject({ earned: 2, max: 4 });
    expect(score(n, rules(...sol, ["443", "ALLOW"]))).toMatchObject({ earned: 4, max: 4 });
  });

  it("actions are exact ids from the choice list (the UI only offers ALLOW / DENY)", () => {
    const sol: [string | null, string | null][] = solutionRules(n);
    sol[0] = ["443", "allow"];
    expect(score(n, rules(...sol)).earned).toBe(3);
  });
});

describe(`PBQ B5 · perimeter firewall (mail)`, () => {
  const n = "B5";

  it("the solution is 25/ALLOW, 993/ALLOW, 22/ALLOW, Any/DENY", () => {
    expect(solutionRules(n)).toEqual([
      ["25", "ALLOW"],
      ["993", "ALLOW"],
      ["22", "ALLOW"],
      ["Any", "DENY"],
    ]);
  });

  it.each([
    [1, "143", "ALLOW"], // cleartext IMAP fails requirement 2
    [1, "110", "ALLOW"],
    [0, "110", "ALLOW"],
    [2, "3389", "ALLOW"],
    [3, "Any", "ALLOW"],
    [1, "993", "DENY"],
  ] as [number, string, string][])(
    "rule %i = %s / %s loses exactly that rule",
    (i, port, action) => {
      const sol: [string, string][] = solutionRules(n);
      sol[i] = [port, action];
      const r = score(n, rules(...sol));
      expect(r.earned).toBe(3);
      expect(r.parts?.[i]).toBe(false);
    },
  );

  it("rules 1 and 2 share source and destination, but order still matters", () => {
    const sol = solutionRules(n);
    expect(score(n, rules(sol[1]!, sol[0]!, sol[2]!, sol[3]!))).toMatchObject({
      earned: 2,
      parts: [false, false, true, true],
    });
  });

  it("accepts `any` for the deny-all", () => {
    const sol = solutionRules(n);
    expect(score(n, rules(...sol.slice(0, 3), ["any", "DENY"])).earned).toBe(4);
  });
});

describe("whole papers with the Part 6 answers", () => {
  const exam = seed.exam;
  const asMark = (q: (typeof seed.questions)[number]) =>
    ({ ...q, _id: q.displayNumber }) as MarkQuestion & { _id: string };
  const keyMap = new Map<string, MarkKey>(seed.answerKeys.map((k) => [k.displayNumber, k]));
  const mcqAnswers = (): [string, AnswerValue][] =>
    seed.answerKeys
      .filter((k) => k.correct)
      .map((k) => [k.displayNumber, { kind: "mcq", optionIds: [...k.correct!] }]);

  it.each([
    ["pbqA", ["1", "2", "3", "4", "5"]],
    ["pbqB", ["B1", "B2", "B3", "B4", "B5"]],
  ] as const)("%s + MCQs: 102 points, 900 scaled, every domain full", (section, numbers) => {
    const questions = seed.questions
      .filter((q) => q.section === section || q.section === "mcq")
      .map(asMark);
    const values = new Map<string, AnswerValue>([
      ...mcqAnswers(),
      ...numbers.map((n) => [n, fullSolution(n)] as [string, AnswerValue]),
    ]);
    const { summary } = scorePaper(questions, keyMap, values, exam);
    expect(summary).toMatchObject({ points: 102, totalPoints: 102, scaled: 900, passed: true });
    expect(summary.domains.map((d) => [d.domain, d.points, d.max])).toEqual(
      seed.domains.map((d) => [d.domain, d.points, d.points]),
    );
  });

  it("PBQs only, everything else blank: the PBQ points (17) and no more", () => {
    const questions = seed.questions.filter((q) => q.section !== "pbqB").map(asMark);
    const values = new Map<string, AnswerValue>(
      ["1", "2", "3", "4", "5"].map((n) => [n, fullSolution(n)]),
    );
    const { summary } = scorePaper(questions, keyMap, values, exam);
    expect(summary.points).toBe(17);
    expect(summary.totalPoints).toBe(102);
  });
});
