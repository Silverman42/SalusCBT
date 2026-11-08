/**
 * Seed import (LLD §6.3, PRD AR-1, ED-7, ED-4).
 *
 * `importExam` loads `content/seed/sy0-701.json` (built by
 * `scripts/parse-exam.ts`) as a new published default version. It is internal:
 * run it with `npm run seed:import` (wraps `npx convex run seed:importExam`).
 *
 * Idempotent per exam slug: the first run creates the exam and version 1; every
 * later run creates the next default version and points
 * `exams.defaultVersionId` at it. Nothing is overwritten, so attempts keep the
 * version they were sat on (ED-4).
 *
 * SE-1: answer keys go to `answerKeys` only. Question rows are built field by
 * field so nothing from a key can reach `questions`. `lab` and `labAnswers` are
 * accepted (they are part of `SeedExam`) but not stored yet: the terminal lab
 * (Stage 7) decides where they live.
 */
import { ConvexError, v, type Infer } from "convex/values";
import { internalMutation, internalQuery, type QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { writeAudit } from "./lib/audit";
import {
  pbqKeyValidator,
  pbqPayloadValidator,
  pbqTemplateValidator,
  validatePayload,
  validatePbqKey,
} from "../shared/validate";
import type { PbqPayload } from "../shared/content";
import type { SeedExam } from "../scripts/lib/types";

/** QA-5: the app makes no claim to be an official CompTIA exam. */
export const DEFAULT_EXAM_TITLE = "Security+ style practice exam (SY0-701)";

const domainValidator = v.union(
  v.literal("1.0"),
  v.literal("2.0"),
  v.literal("3.0"),
  v.literal("4.0"),
  v.literal("5.0"),
);

const seedMcqValidator = v.object({
  order: v.number(),
  section: v.literal("mcq"),
  displayNumber: v.string(),
  kind: v.literal("mcq"),
  domain: domainValidator,
  points: v.number(),
  stem: v.string(),
  options: v.array(v.object({ id: v.string(), text: v.string() })),
  chooseCount: v.number(),
});

const seedPbqValidator = v.object({
  order: v.number(),
  section: v.union(v.literal("pbqA"), v.literal("pbqB")),
  displayNumber: v.string(),
  kind: v.literal("pbq"),
  domain: domainValidator,
  points: v.number(),
  stem: v.string(),
  template: pbqTemplateValidator,
  payload: pbqPayloadValidator,
});

/** Mirrors `SeedExam` in `scripts/lib/types.ts` (checked below). */
export const seedExamValidator = v.object({
  exam: v.object({
    slug: v.string(),
    title: v.string(),
    timeLimitMin: v.number(),
    passScaled: v.number(),
    comfortScaled: v.number(),
    domainTarget: v.number(),
  }),
  scoring: v.object({
    scaleMin: v.number(),
    scaleMax: v.number(),
    totalPoints: v.number(),
    passPoints: v.number(),
    conversion: v.array(v.object({ points: v.number(), scaled: v.number(), passed: v.boolean() })),
  }),
  domains: v.array(
    v.object({ domain: domainValidator, name: v.string(), weight: v.number(), points: v.number() }),
  ),
  questions: v.array(v.union(seedMcqValidator, seedPbqValidator)),
  answerKeys: v.array(
    v.object({
      displayNumber: v.string(),
      correct: v.optional(v.array(v.string())),
      parts: v.optional(pbqKeyValidator),
      explanation: v.string(),
    }),
  ),
  oralQuestions: v.array(
    v.object({ order: v.number(), question: v.string(), modelAnswer: v.string() }),
  ),
  lab: v.object({
    intro: v.string(),
    steps: v.array(v.object({ title: v.string(), body: v.string() })),
    cheatSheet: v.array(v.object({ command: v.string(), description: v.string() })),
  }),
  labAnswers: v.array(v.string()),
});

export type SeedExamArg = Infer<typeof seedExamValidator>;
// Compile-time proof that every parser output is a valid argument.
type Assert<T extends true> = T;
export type _SeedMatchesParser = Assert<SeedExam extends SeedExamArg ? true : false>;

type SeedQuestion = SeedExamArg["questions"][number];
type SeedKey = SeedExamArg["answerKeys"][number];

/** Points a PBQ is worth: its scored parts (firewall: one per rule). */
function pbqPoints(payload: PbqPayload): number {
  if (payload.template === "firewall") return payload.rules.length;
  return payload.parts.filter((p) => !("scored" in p) || p.scored).length;
}

/** Points of the standard sitting: set A PBQs and the MCQs (set B is the retake). */
function standardPoints(questions: SeedQuestion[]) {
  return questions.filter((q) => q.section !== "pbqB");
}

/**
 * Every problem with the seed, as `where: message` strings. Shape is already
 * enforced by the argument validator; these are the content rules (LLD §6.2,
 * §10.2) that a validator cannot express.
 */
export function checkSeed(seed: SeedExamArg): string[] {
  const issues: string[] = [];
  const keys = new Map<string, SeedKey>();
  for (const k of seed.answerKeys) {
    if (keys.has(k.displayNumber)) issues.push(`key ${k.displayNumber}: duplicate answer key`);
    keys.set(k.displayNumber, k);
  }

  const numbers = new Set<string>();
  for (const q of seed.questions) {
    const where = `question ${q.displayNumber}`;
    if (numbers.has(q.displayNumber)) issues.push(`${where}: duplicate displayNumber`);
    numbers.add(q.displayNumber);
    const key = keys.get(q.displayNumber);
    if (!key) {
      issues.push(`${where}: no answer key`);
      continue;
    }
    if (key.explanation.trim() === "") issues.push(`${where}: key has no explanation`);

    if (q.kind === "mcq") {
      if (q.points !== 1) issues.push(`${where}: an MCQ is worth 1 point, not ${q.points}`);
      if (q.options.length < 2 || q.options.length > 6)
        issues.push(`${where}: has ${q.options.length} options, expected 2–6`);
      const ids = new Set(q.options.map((o) => o.id));
      if (ids.size !== q.options.length) issues.push(`${where}: duplicate option ids`);
      if (key.parts !== undefined) issues.push(`${where}: MCQ key must not have parts`);
      const correct = key.correct ?? [];
      if (q.chooseCount !== 1 && q.chooseCount !== 2)
        issues.push(`${where}: chooseCount must be 1 or 2`);
      if (correct.length !== q.chooseCount)
        issues.push(`${where}: chooses ${q.chooseCount}, key has ${correct.length} answers`);
      if (new Set(correct).size !== correct.length) issues.push(`${where}: key repeats an answer`);
      for (const id of correct)
        if (!ids.has(id)) issues.push(`${where}: key answer ${id} is not an option`);
      continue;
    }

    if (key.correct !== undefined) issues.push(`${where}: PBQ key must not have correct`);
    const payload = validatePayload(q.template, q.payload);
    if (!payload.ok) {
      for (const e of payload.errors) issues.push(`${where}: payload.${e.path}: ${e.message}`);
      continue;
    }
    if (key.parts === undefined) {
      issues.push(`${where}: PBQ key has no parts`);
      continue;
    }
    const pbqKey = validatePbqKey(payload.value, key.parts);
    if (!pbqKey.ok)
      for (const e of pbqKey.errors) issues.push(`${where}: key.${e.path}: ${e.message}`);
    const expected = pbqPoints(payload.value);
    if (q.points !== expected)
      issues.push(`${where}: worth ${q.points} points, has ${expected} scored parts`);
  }
  for (const n of keys.keys())
    if (!numbers.has(n)) issues.push(`key ${n}: no question with that displayNumber`);

  // Totals (ED-10): the standard sitting adds up to the stated total, set B
  // (if present) is worth the same as set A, and the domain table matches.
  const standard = standardPoints(seed.questions);
  const total = standard.reduce((sum, q) => sum + q.points, 0);
  if (total !== seed.scoring.totalPoints)
    issues.push(
      `scoring: questions add up to ${total}, totalPoints is ${seed.scoring.totalPoints}`,
    );
  const setPoints = (s: "pbqA" | "pbqB") =>
    seed.questions.filter((q) => q.section === s).reduce((sum, q) => sum + q.points, 0);
  if (seed.questions.some((q) => q.section === "pbqB") && setPoints("pbqB") !== setPoints("pbqA"))
    issues.push(`set B is worth ${setPoints("pbqB")} points, set A ${setPoints("pbqA")}`);
  for (const d of seed.domains) {
    const got = standard.filter((q) => q.domain === d.domain).reduce((s, q) => s + q.points, 0);
    if (got !== d.points)
      issues.push(`domain ${d.domain}: table says ${d.points} points, questions add up to ${got}`);
  }

  const orals = new Set<number>();
  for (const o of seed.oralQuestions) {
    if (orals.has(o.order)) issues.push(`oral question ${o.order}: duplicate order`);
    orals.add(o.order);
  }
  return issues;
}

const importResult = v.object({
  examId: v.id("exams"),
  versionId: v.id("examVersions"),
  versionNo: v.number(),
  totalPoints: v.number(),
  questions: v.number(),
  answerKeys: v.number(),
  oralQuestions: v.number(),
});

export const importExam = internalMutation({
  args: { seed: seedExamValidator },
  returns: importResult,
  handler: async (ctx, { seed }) => {
    const issues = checkSeed(seed);
    if (issues.length > 0) throw new ConvexError({ code: "VALIDATION_FAILED", issues });

    const now = Date.now();
    const existing = await ctx.db
      .query("exams")
      .withIndex("by_slug", (q) => q.eq("slug", seed.exam.slug))
      .unique();
    const examId =
      existing?._id ??
      (await ctx.db.insert("exams", {
        slug: seed.exam.slug,
        title: DEFAULT_EXAM_TITLE,
        timeLimitMin: seed.exam.timeLimitMin,
        passScaled: seed.exam.passScaled,
        comfortScaled: seed.exam.comfortScaled,
        domainTarget: seed.exam.domainTarget,
      }));

    // Highest default version so far (ownerId undefined = admin-managed).
    const latest = await ctx.db
      .query("examVersions")
      .withIndex("by_exam_owner", (q) => q.eq("examId", examId).eq("ownerId", undefined))
      .order("desc")
      .first();
    const versionNo = (latest?.versionNo ?? 0) + 1;
    const totalPoints = standardPoints(seed.questions).reduce((sum, q) => sum + q.points, 0);
    const versionId = await ctx.db.insert("examVersions", {
      examId,
      label: "Default",
      versionNo,
      status: "published",
      totalPoints,
      publishedAt: now,
      updatedAt: now,
    });

    const questionIds = new Map<string, Id<"questions">>();
    for (const q of seed.questions) {
      const common = {
        versionId,
        order: q.order,
        section: q.section,
        displayNumber: q.displayNumber,
        kind: q.kind,
        domain: q.domain,
        points: q.points,
        stem: q.stem,
      };
      const id =
        q.kind === "mcq"
          ? await ctx.db.insert("questions", {
              ...common,
              options: q.options.map((o) => ({ id: o.id, text: o.text })),
              chooseCount: q.chooseCount,
            })
          : await ctx.db.insert("questions", {
              ...common,
              template: q.template,
              payload: q.payload,
            });
      questionIds.set(q.displayNumber, id);
    }
    for (const k of seed.answerKeys) {
      await ctx.db.insert("answerKeys", {
        questionId: questionIds.get(k.displayNumber)!, // checkSeed: every key has a question
        versionId,
        explanation: k.explanation,
        ...(k.correct !== undefined ? { correct: k.correct } : {}),
        ...(k.parts !== undefined ? { parts: k.parts } : {}),
      });
    }
    for (const o of seed.oralQuestions) {
      await ctx.db.insert("oralQuestions", {
        versionId,
        order: o.order,
        question: o.question,
        modelAnswer: o.modelAnswer,
      });
    }

    const previous = existing?.defaultVersionId;
    await ctx.db.patch("exams", examId, { defaultVersionId: versionId });
    await writeAudit(ctx, {
      action: "version.published",
      target: versionId,
      meta: { source: "seed", slug: seed.exam.slug, versionNo, totalPoints },
    });
    await writeAudit(ctx, {
      action: "exam.default_changed",
      target: examId,
      meta: { source: "seed", from: previous ?? null, to: versionId },
    });

    return {
      examId,
      versionId,
      versionNo,
      totalPoints,
      questions: seed.questions.length,
      answerKeys: seed.answerKeys.length,
      oralQuestions: seed.oralQuestions.length,
    };
  },
});

/** Per-version tallies, for the Stage 1 gate check and the import tests. */
const tally = v.object({
  versionId: v.id("examVersions"),
  versionNo: v.number(),
  status: v.string(),
  totalPoints: v.number(),
  mcq: v.number(),
  pbqA: v.number(),
  pbqB: v.number(),
  chooseTwo: v.number(),
  answerKeys: v.number(),
  oralQuestions: v.number(),
  /** Standard sitting (set A + MCQs) points per domain. */
  domainPoints: v.array(v.object({ domain: v.string(), points: v.number() })),
});

/**
 * `npx convex run seed:summary '{"slug":"sy0-701"}'` — the exam's default
 * version id and a tally of every default version. Counts only; never returns
 * keys.
 */
export const summary = internalQuery({
  args: { slug: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      examId: v.id("exams"),
      title: v.string(),
      defaultVersionId: v.union(v.id("examVersions"), v.null()),
      versions: v.array(tally),
    }),
  ),
  handler: async (ctx, { slug }) => {
    const exam = await ctx.db
      .query("exams")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .unique();
    if (!exam) return null;
    const versions = await ctx.db
      .query("examVersions")
      .withIndex("by_exam_owner", (q) => q.eq("examId", exam._id).eq("ownerId", undefined))
      .take(50);
    const tallies = [];
    for (const version of versions) tallies.push(await tallyVersion(ctx, version));
    return {
      examId: exam._id,
      title: exam.title,
      defaultVersionId: exam.defaultVersionId ?? null,
      versions: tallies,
    };
  },
});

// A version holds ~100 questions; the bound leaves room for edited versions.
const MAX_ROWS = 1000;

async function tallyVersion(
  ctx: Pick<QueryCtx, "db">,
  version: Doc<"examVersions">,
): Promise<Infer<typeof tally>> {
  const questions = await ctx.db
    .query("questions")
    .withIndex("by_version_section_order", (q) => q.eq("versionId", version._id))
    .take(MAX_ROWS);
  const keys = await ctx.db
    .query("answerKeys")
    .withIndex("by_version", (q) => q.eq("versionId", version._id))
    .take(MAX_ROWS);
  const orals = await ctx.db
    .query("oralQuestions")
    .withIndex("by_version", (q) => q.eq("versionId", version._id))
    .take(MAX_ROWS);
  const count = (section: Doc<"questions">["section"]) =>
    questions.filter((q) => q.section === section).length;
  const byDomain = new Map<string, number>();
  for (const q of questions)
    if (q.section !== "pbqB") byDomain.set(q.domain, (byDomain.get(q.domain) ?? 0) + q.points);
  const domainPoints = [...byDomain]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([domain, points]) => ({ domain, points }));
  return {
    versionId: version._id,
    versionNo: version.versionNo,
    status: version.status,
    totalPoints: version.totalPoints,
    mcq: count("mcq"),
    pbqA: count("pbqA"),
    pbqB: count("pbqB"),
    chooseTwo: questions.filter((q) => q.chooseCount === 2).length,
    answerKeys: keys.length,
    oralQuestions: orals.length,
    domainPoints,
  };
}
