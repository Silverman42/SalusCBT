/**
 * The student's paper (LLD §7.3, PRD EX-6, EX-10, PB-4, SE-1).
 *
 * Everything here works from the `questions` table only. Nothing in this file
 * reads `answerKeys`, and every student-visible field is copied explicitly, so
 * a field added to a question document later is not sent until it is listed
 * here.
 *
 * The option order is never stored. `paperOptions` and `paperPartOptions`
 * recompute it from the attempt's `shuffleSeed`, so the review (T-208) must
 * call the same two functions. Changing either reorders existing attempts.
 */
import { v, type Infer } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx } from "../_generated/server";
import type { PbqPayload, PortPart, TextPart } from "../../shared/content";
import { pbqPayloadValidator } from "../../shared/validate";
import { questionSeed, shuffled } from "./rng";

/** More questions than any section can hold; keeps the reads bounded. */
export const SECTION_QUESTION_LIMIT = 500;

type Mode = Doc<"attempts">["mode"];
type PbqSection = "pbqA" | "pbqB";

/** PB-4: a retake sits PBQ set B instead of set A. */
export function pbqSectionFor(mode: Mode): PbqSection {
  return mode === "retake" ? "pbqB" : "pbqA";
}

/** The sections an attempt sits: its PBQ set, then the MCQs (EX-6). */
export function sectionsFor(mode: Mode): [PbqSection, "mcq"] {
  return [pbqSectionFor(mode), "mcq"];
}

/**
 * The attempt's questions in paper order: the PBQ set for its mode, then the
 * MCQs, each section by `order` (the index order). Shared with save and submit
 * (T-206, T-207) so they agree on which questions belong to the attempt.
 */
export async function loadPaperQuestions(
  ctx: Pick<QueryCtx, "db">,
  attempt: Pick<Doc<"attempts">, "versionId" | "mode">,
): Promise<Doc<"questions">[]> {
  const out: Doc<"questions">[] = [];
  for (const section of sectionsFor(attempt.mode)) {
    const rows = await ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) =>
        q.eq("versionId", attempt.versionId).eq("section", section),
      )
      .take(SECTION_QUESTION_LIMIT);
    out.push(...rows);
  }
  return out;
}

type Option = { id: string; text: string };

/** EX-10: an MCQ's options in this attempt's display order (original ids kept). */
export function paperOptions(
  options: readonly Option[],
  shuffleSeed: number,
  questionId: Id<"questions">,
): Option[] {
  return shuffled(options, questionSeed(shuffleSeed, questionId)).map((o) => ({
    id: o.id,
    text: o.text,
  }));
}

/**
 * A PBQ MCQ part's options (e.g. 3b, 3c) in display order. Each part gets its
 * own seed (question id + part id): with one seed per question, two parts
 * with the same number of options would always share a permutation.
 */
export function paperPartOptions(
  options: readonly Option[],
  shuffleSeed: number,
  questionId: Id<"questions">,
  partId: string,
): Option[] {
  return shuffled(options, questionSeed(shuffleSeed, `${questionId}:${partId}`)).map((o) => ({
    id: o.id,
    text: o.text,
  }));
}

// ---------------------------------------------------------------------------
// Student-visible shapes
// ---------------------------------------------------------------------------

const optionValidator = v.object({ id: v.string(), text: v.string() });

export const paperMcqValidator = v.object({
  questionId: v.id("questions"),
  kind: v.literal("mcq"),
  section: v.literal("mcq"),
  displayNumber: v.string(),
  points: v.number(),
  stem: v.string(),
  chooseCount: v.number(),
  options: v.array(optionValidator),
});

export const paperPbqValidator = v.object({
  questionId: v.id("questions"),
  kind: v.literal("pbq"),
  section: v.union(v.literal("pbqA"), v.literal("pbqB")),
  displayNumber: v.string(),
  points: v.number(),
  stem: v.string(),
  payload: pbqPayloadValidator,
});

export const paperQuestionValidator = v.union(paperMcqValidator, paperPbqValidator);

export const paperValidator = v.object({
  attemptId: v.id("attempts"),
  mode: v.union(v.literal("standard"), v.literal("retake")),
  questions: v.array(paperQuestionValidator),
});

export type PaperQuestion = Infer<typeof paperQuestionValidator>;
export type Paper = Infer<typeof paperValidator>;

const textPart = (p: TextPart): TextPart => ({
  id: p.id,
  prompt: p.prompt,
  kind: p.kind,
  scored: p.scored,
});
const portPart = (p: PortPart): PortPart => ({ id: p.id, prompt: p.prompt, kind: p.kind });

/** A field-by-field copy of a PBQ payload, with MCQ parts in display order. */
function paperPayload(
  payload: PbqPayload,
  shuffleSeed: number,
  questionId: Id<"questions">,
): PbqPayload {
  switch (payload.template) {
    case "sshLog":
      return {
        template: "sshLog",
        intro: payload.intro,
        log: payload.log,
        parts: payload.parts.map(textPart),
      };
    case "nmap":
      return {
        template: "nmap",
        intro: payload.intro,
        scan: payload.scan,
        parts: payload.parts.map(portPart),
      };
    case "hashCheck":
      return {
        template: "hashCheck",
        intro: payload.intro,
        vendorHashes: payload.vendorHashes,
        computed: payload.computed,
        parts: payload.parts.map((p) =>
          p.kind === "mcq"
            ? {
                id: p.id,
                prompt: p.prompt,
                kind: "mcq" as const,
                options: paperPartOptions(p.options, shuffleSeed, questionId, p.id),
              }
            : { id: p.id, prompt: p.prompt, kind: "pick" as const, choices: [...p.choices] },
        ),
      };
    case "permissions":
      return {
        template: "permissions",
        intro: payload.intro,
        listings: payload.listings,
        sshdConfig: payload.sshdConfig,
        parts: payload.parts.map(textPart),
      };
    case "firewall":
      return {
        template: "firewall",
        intro: payload.intro,
        requirements: [...payload.requirements],
        diagram: payload.diagram,
        rules: payload.rules.map((r) => ({
          source: r.source,
          destination: r.destination,
          protocol: r.protocol,
        })),
        portChoices: [...payload.portChoices],
        actionChoices: [...payload.actionChoices],
      };
  }
}

/**
 * One question as the student sees it. Leaves out `versionId`, `order`,
 * `domain` (not needed to sit the exam; the result reports domains) and the
 * system fields. Throws on a malformed question rather than sending a guess.
 */
export function toPaperQuestion(q: Doc<"questions">, shuffleSeed: number): PaperQuestion {
  const common = {
    questionId: q._id,
    displayNumber: q.displayNumber,
    points: q.points,
    stem: q.stem,
  };
  if (q.kind === "mcq") {
    if (q.section !== "mcq" || !q.options || q.chooseCount === undefined) {
      throw new Error(`attempts.getPaper: MCQ ${q._id} is missing options or chooseCount.`);
    }
    return {
      ...common,
      kind: "mcq",
      section: "mcq",
      chooseCount: q.chooseCount,
      options: paperOptions(q.options, shuffleSeed, q._id),
    };
  }
  if (q.section === "mcq" || !q.payload) {
    throw new Error(`attempts.getPaper: PBQ ${q._id} is missing its payload or PBQ section.`);
  }
  return {
    ...common,
    kind: "pbq",
    section: q.section,
    payload: paperPayload(q.payload, shuffleSeed, q._id),
  };
}
