// T-205: attempts.getPaper and attempts.getState (LLD §7.3, §5.1; EX-6, EX-10,
// EX-11, SE-1, SE-3). Uses the real seed so the leak scan covers real keys.

import { ConvexError } from "convex/values";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { errorCodeOf } from "../../../convex/lib/errors";
import { paperOptions, paperPartOptions } from "../../../convex/lib/paper";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "a".repeat(64);
const seed = seedJson as SeedExam;

const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

async function errorOf(p: Promise<unknown>): Promise<unknown> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return err;
}

async function start(
  t: T,
  opts: { n?: number; mode?: "standard" | "retake"; shuffleSeed?: number } = {},
): Promise<Id<"attempts">> {
  const { attemptId } = await t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken: token(opts.n),
    mode: opts.mode ?? "standard",
    ipHash: IP_HASH,
  });
  if (opts.shuffleSeed !== undefined) {
    const shuffleSeed = opts.shuffleSeed;
    await t.run((ctx) => ctx.db.patch("attempts", attemptId, { shuffleSeed }));
  }
  return attemptId;
}

async function seeded(): Promise<{ t: T; versionId: Id<"examVersions"> }> {
  const t = setup();
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  return { t, versionId };
}

async function storedQuestions(t: T, versionId: Id<"examVersions">) {
  return await t.run(async (ctx) => {
    const rows = await ctx.db.query("questions").collect();
    return rows.filter((q) => q.versionId === versionId);
  });
}

/** Every object key and string leaf in a value, recursively. */
function walk(value: unknown, keys: Set<string>, strings: Set<string>): void {
  if (typeof value === "string") strings.add(value);
  else if (Array.isArray(value)) for (const item of value) walk(item, keys, strings);
  else if (value && typeof value === "object") {
    for (const [k, item] of Object.entries(value)) {
      keys.add(k);
      walk(item, keys, strings);
    }
  }
}

function stringsOf(value: unknown): string[] {
  const strings = new Set<string>();
  walk(value, new Set(), strings);
  return [...strings];
}

describe("attempts.getPaper / getState (T-205)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("getPaper", () => {
    it("returns PBQ set A first, then the MCQs in number order (EX-6)", async () => {
      const { t } = await seeded();
      const attemptId = await start(t);
      const paper = await t.query(api.attempts.getPaper, { attemptId, anonToken: token() });

      expect(paper.attemptId).toBe(attemptId);
      expect(paper.mode).toBe("standard");
      const expected = [
        ...seed.questions.filter((q) => q.section === "pbqA").sort((a, b) => a.order - b.order),
        ...seed.questions.filter((q) => q.section === "mcq").sort((a, b) => a.order - b.order),
      ].map((q) => q.displayNumber);
      expect(paper.questions.map((q) => q.displayNumber)).toEqual(expected);
      expect(paper.questions.slice(0, 5).map((q) => q.displayNumber)).toEqual([
        "1",
        "2",
        "3",
        "4",
        "5",
      ]);
      expect(paper.questions[5]!.displayNumber).toBe("6");
      expect(paper.questions).toHaveLength(90);
    });

    it("a retake sits PBQ set B instead of set A (PB-4)", async () => {
      const { t } = await seeded();
      const attemptId = await start(t, { mode: "retake" });
      const paper = await t.query(api.attempts.getPaper, { attemptId, anonToken: token() });
      expect(paper.mode).toBe("retake");
      expect(paper.questions.slice(0, 5).map((q) => q.displayNumber)).toEqual([
        "B1",
        "B2",
        "B3",
        "B4",
        "B5",
      ]);
      expect(
        paper.questions.filter((q) => q.kind === "pbq").every((q) => q.section === "pbqB"),
      ).toBe(true);
      expect(paper.questions.filter((q) => q.kind === "mcq")).toHaveLength(85);
    });

    it("keeps the same option order for the same attempt, with original ids (EX-10)", async () => {
      const { t, versionId } = await seeded();
      const attemptId = await start(t, { shuffleSeed: 12345 });
      const args = { attemptId, anonToken: token() };
      const first = await t.query(api.attempts.getPaper, args);
      const second = await t.query(api.attempts.getPaper, args);
      expect(second).toEqual(first);

      const stored = new Map((await storedQuestions(t, versionId)).map((q) => [q._id, q]));
      for (const q of first.questions) {
        const doc = stored.get(q.questionId)!;
        if (q.kind === "mcq") {
          // A permutation of the stored options, ids and texts unchanged...
          expect([...q.options].sort((a, b) => a.id.localeCompare(b.id))).toEqual(doc.options);
          // ...in the order review will recompute from the stored seed.
          expect(q.options).toEqual(paperOptions(doc.options!, 12345, doc._id));
          expect(q.chooseCount).toBe(doc.chooseCount);
        }
      }
      // With 85 MCQs, the shuffle visibly reorders some of them.
      const reordered = first.questions.filter(
        (q) =>
          q.kind === "mcq" &&
          q.options.map((o) => o.id).join() !== [...q.options.map((o) => o.id)].sort().join(),
      );
      expect(reordered.length).toBeGreaterThan(40);
    });

    it("gives different attempts different orders", async () => {
      const { t } = await seeded();
      const a = await start(t, { n: 1, shuffleSeed: 1 });
      const b = await start(t, { n: 2, shuffleSeed: 2 });
      const order = async (attemptId: Id<"attempts">, n: number) =>
        (await t.query(api.attempts.getPaper, { attemptId, anonToken: token(n) })).questions
          .map((q) => (q.kind === "mcq" ? q.options.map((o) => o.id).join("") : q.displayNumber))
          .join("|");
      expect(await order(a, 1)).not.toEqual(await order(b, 2));
    });

    it("shuffles PBQ MCQ parts (3b, 3c) with their own seed and keeps pick choices", async () => {
      const { t, versionId } = await seeded();
      const q3 = (await storedQuestions(t, versionId)).find((q) => q.displayNumber === "3")!;
      const storedParts = q3.payload!.template === "hashCheck" ? q3.payload!.parts : [];
      const mcqParts = storedParts.filter((p) => p.kind === "mcq");
      expect(mcqParts.map((p) => p.id)).toEqual(["3b", "3c"]);

      let shuffledSomewhere = false;
      for (let s = 1; s <= 8; s++) {
        const attemptId = await start(t, { n: s, shuffleSeed: s });
        const paper = await t.query(api.attempts.getPaper, { attemptId, anonToken: token(s) });
        const p3 = paper.questions.find((q) => q.displayNumber === "3")!;
        if (p3.kind !== "pbq" || p3.payload.template !== "hashCheck") throw new Error("not 3");
        for (const part of p3.payload.parts) {
          const original = storedParts.find((p) => p.id === part.id)!;
          if (part.kind === "mcq" && original.kind === "mcq") {
            expect(part.options).toEqual(paperPartOptions(original.options, s, q3._id, part.id));
            expect([...part.options].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
              [...original.options].sort((a, b) => a.id.localeCompare(b.id)),
            );
            if (part.options.map((o) => o.id).join() !== original.options.map((o) => o.id).join())
              shuffledSomewhere = true;
          } else {
            expect(part).toEqual(original);
          }
        }
      }
      expect(shuffledSomewhere).toBe(true);
    });

    it("returns no key, explanation or internal field (SE-1)", async () => {
      for (const mode of ["standard", "retake"] as const) {
        const { t, versionId } = await seeded();
        const attemptId = await start(t, { mode });
        const paper = await t.query(api.attempts.getPaper, { attemptId, anonToken: token() });

        // 1. Field names: only the student-visible shape, nothing key-shaped.
        const keys = new Set<string>();
        walk(paper, keys, new Set());
        for (const banned of [
          "correct",
          "explanation",
          "practice",
          "earned",
          "partResults",
          "answer",
          "answers",
          "key",
          "keys",
          "port",
          "action",
          "versionId",
          "order",
          "domain",
          "anonKey",
          "shuffleSeed",
          "_creationTime",
          "_id",
        ]) {
          expect(keys.has(banned), `field "${banned}" in the paper`).toBe(false);
        }
        for (const q of paper.questions) {
          expect(Object.keys(q).sort()).toEqual(
            q.kind === "mcq"
              ? [
                  "chooseCount",
                  "displayNumber",
                  "kind",
                  "options",
                  "points",
                  "questionId",
                  "section",
                  "stem",
                ]
              : ["displayNumber", "kind", "payload", "points", "questionId", "section", "stem"],
          );
          if (q.kind === "pbq" && q.payload.template === "firewall") {
            for (const row of q.payload.rules) {
              expect(Object.keys(row).sort()).toEqual(["destination", "protocol", "source"]);
            }
          }
        }

        // 2. Values: every string in the stored keys that isn't already part of
        // the question content (explanations, practice model answers, typed
        // answers such as "backup-tool-1.8.deb" are in a choice list, so those
        // are allowed) must not appear anywhere in the paper.
        const keyRows = await t.run(async (ctx) =>
          (await ctx.db.query("answerKeys").collect()).filter((k) => k.versionId === versionId),
        );
        expect(keyRows.length).toBeGreaterThan(90);
        const questionText = JSON.stringify(await storedQuestions(t, versionId));
        const paperText = JSON.stringify(paper);
        const keyOnly = keyRows
          .flatMap((k: Doc<"answerKeys">) => stringsOf({ e: k.explanation, p: k.parts }))
          .filter((s) => !questionText.includes(JSON.stringify(s).slice(1, -1)));
        // The scan must have real material to look for.
        expect(keyOnly.length).toBeGreaterThan(90);
        for (const s of keyOnly) {
          expect(paperText.includes(JSON.stringify(s).slice(1, -1)), `key value ${s}`).toBe(false);
        }
        for (const k of keyRows) {
          expect(paperText).not.toContain(JSON.stringify(k.explanation).slice(1, 40));
        }

        // 3. MCQ `correct` arrays: the paper's option sets are the stored ones,
        // so a correct id is present, but nothing marks it (checked in 1).
        for (const q of paper.questions) {
          if (q.kind === "mcq") expect(q.options.length).toBeGreaterThanOrEqual(2);
        }
      }
    });

    it("never reads answerKeys", async () => {
      const { t } = await seeded();
      const attemptId = await start(t);
      // With every key deleted, the paper is unchanged.
      const before = await t.query(api.attempts.getPaper, { attemptId, anonToken: token() });
      await t.run(async (ctx) => {
        for (const k of await ctx.db.query("answerKeys").collect())
          await ctx.db.delete("answerKeys", k._id);
      });
      const after = await t.query(api.attempts.getPaper, { attemptId, anonToken: token() });
      expect(after).toEqual(before);
    });
  });

  describe("getState", () => {
    it("returns status, timing and no responses for a new attempt", async () => {
      const { t } = await seeded();
      const {
        attemptId,
        deadline,
        serverNow: startedAt,
      } = await t.mutation(api.attempts.start, {
        serverSecret: SECRET,
        anonToken: token(),
        mode: "standard",
        ipHash: IP_HASH,
      });
      vi.advanceTimersByTime(5 * 60_000);
      const state = await t.query(api.attempts.getState, { attemptId, anonToken: token() });
      expect(state.status).toBe("in_progress");
      expect(state.startedAt).toBe(startedAt);
      expect(state.deadline).toBe(deadline);
      expect(state.serverNow - (NOW + 5 * 60_000)).toBeGreaterThanOrEqual(0);
      expect(state.serverNow - (NOW + 5 * 60_000)).toBeLessThan(1000);
      expect(state.responses).toEqual([]);
    });

    it("returns saved values and flags only, never marks", async () => {
      const { t, versionId } = await seeded();
      const attemptId = await start(t);
      const qs = await storedQuestions(t, versionId);
      const mcq = qs.find((q) => q.displayNumber === "6")!;
      const pbq = qs.find((q) => q.displayNumber === "1")!;
      const flaggedOnly = qs.find((q) => q.displayNumber === "7")!;
      await t.run(async (ctx) => {
        await ctx.db.insert("responses", {
          attemptId,
          questionId: mcq._id,
          value: { kind: "mcq", optionIds: ["C"] },
          flagged: false,
          updatedAt: NOW + 1,
          earned: 1,
        });
        await ctx.db.insert("responses", {
          attemptId,
          questionId: pbq._id,
          value: { kind: "pbq", parts: { "1a": "193.32.162.71" } },
          flagged: true,
          updatedAt: NOW + 2,
          earned: 1,
          partResults: [true, false, false],
        });
        await ctx.db.insert("responses", {
          attemptId,
          questionId: flaggedOnly._id,
          flagged: true,
          updatedAt: NOW + 3,
        });
      });
      // Another attempt's response is not included.
      const other = await start(t, { n: 1 });
      await t.run((ctx) =>
        ctx.db.insert("responses", {
          attemptId: other,
          questionId: mcq._id,
          value: { kind: "mcq", optionIds: ["A"] },
          flagged: false,
          updatedAt: NOW,
        }),
      );

      const state = await t.query(api.attempts.getState, { attemptId, anonToken: token() });
      const byId = new Map(state.responses.map((r) => [r.questionId, r]));
      expect(state.responses).toHaveLength(3);
      expect(byId.get(mcq._id)).toEqual({
        questionId: mcq._id,
        value: { kind: "mcq", optionIds: ["C"] },
        flagged: false,
        updatedAt: NOW + 1,
      });
      expect(byId.get(pbq._id)).toEqual({
        questionId: pbq._id,
        value: { kind: "pbq", parts: { "1a": "193.32.162.71" } },
        flagged: true,
        updatedAt: NOW + 2,
      });
      expect(byId.get(flaggedOnly._id)).toEqual({
        questionId: flaggedOnly._id,
        flagged: true,
        updatedAt: NOW + 3,
      });
      const json = JSON.stringify(state);
      for (const word of ["earned", "partResults", "correct", "explanation", "anonKey"]) {
        expect(json).not.toContain(word);
      }
    });
  });

  describe("ownership (SE-3)", () => {
    const fns = [
      ["getPaper", api.attempts.getPaper],
      ["getState", api.attempts.getState],
    ] as const;

    for (const [name, fn] of fns) {
      it(`${name}: another token and a missing attempt both give NOT_FOUND`, async () => {
        const { t } = await seeded();
        const attemptId = await start(t);
        const foreign = await errorOf(t.query(fn, { attemptId, anonToken: token(7) }));

        const gone = await start(t, { n: 1 });
        await t.run((ctx) => ctx.db.delete("attempts", gone));
        const missing = await errorOf(t.query(fn, { attemptId: gone, anonToken: token(1) }));

        expect(foreign).toBeInstanceOf(ConvexError);
        expect(errorCodeOf(foreign)).toBe("NOT_FOUND");
        expect(errorCodeOf(missing)).toBe("NOT_FOUND");
        // Indistinguishable to the caller.
        expect((foreign as ConvexError<string>).data).toEqual(
          (missing as ConvexError<string>).data,
        );
        expect((foreign as Error).message).toEqual((missing as Error).message);
      });

      it(`${name}: a malformed token gives BAD_TOKEN`, async () => {
        const { t } = await seeded();
        const attemptId = await start(t);
        for (const anonToken of ["", "short", `${token()}x`]) {
          expect(errorCodeOf(await errorOf(t.query(fn, { attemptId, anonToken })))).toBe(
            "BAD_TOKEN",
          );
        }
      });
    }
  });
});
