// T-206: attempts.saveResponse (LLD §7.2; EX-7, EX-11, SE-3, SE-4). Uses the
// real seed so every PBQ template and both PBQ sets are covered.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { SAVE_GRACE_MS } from "../../../convex/attempts";
import { ANSWER_STRING_MAX } from "../../../convex/lib/answers";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { AnswerValue } from "../../../shared/content";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "a".repeat(64);
const seed = seedJson as SeedExam;

const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

type Ctx = {
  t: T;
  versionId: Id<"examVersions">;
  attemptId: Id<"attempts">;
  /** Question ids by display number ("1", "B2", "20", …). */
  q: (displayNumber: string) => Id<"questions">;
};

async function setupAttempt(mode: "standard" | "retake" = "standard"): Promise<Ctx> {
  const t = setup();
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  const { attemptId } = await t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken: token(),
    mode,
    ipHash: IP_HASH,
  });
  const rows = await t.run(async (ctx) => {
    const all = await ctx.db.query("questions").collect();
    return all.filter((r) => r.versionId === versionId);
  });
  const byNumber = new Map(rows.map((r) => [r.displayNumber, r._id]));
  const q = (n: string) => {
    const id = byNumber.get(n);
    if (!id) throw new Error(`no question ${n}`);
    return id;
  };
  return { t, versionId, attemptId, q };
}

type SaveArgs = {
  questionId: Id<"questions">;
  value?: AnswerValue;
  flagged?: boolean;
  clientUpdatedAt?: number;
  anonToken?: string;
};

function save(c: Ctx, a: SaveArgs) {
  return c.t.mutation(api.attempts.saveResponse, {
    attemptId: c.attemptId,
    anonToken: a.anonToken ?? token(),
    questionId: a.questionId,
    ...(a.value !== undefined ? { value: a.value } : {}),
    flagged: a.flagged ?? false,
    ...(a.clientUpdatedAt !== undefined ? { clientUpdatedAt: a.clientUpdatedAt } : {}),
  });
}

async function rows(c: Ctx): Promise<Doc<"responses">[]> {
  return await c.t.run((ctx) => ctx.db.query("responses").collect());
}

async function state(c: Ctx) {
  return await c.t.query(api.attempts.getState, { attemptId: c.attemptId, anonToken: token() });
}

const mcq = (...optionIds: string[]): AnswerValue => ({ kind: "mcq", optionIds });
const pbq = (parts: Record<string, string | string[]>): AnswerValue => ({ kind: "pbq", parts });
const fw = (rules: { port: string | null; action: string | null }[]): AnswerValue => ({
  kind: "firewall",
  rules,
});
const blankRules = () => Array.from({ length: 4 }, () => ({ port: null, action: null }));

describe("attempts.saveResponse (T-206)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("upsert", () => {
    it("saves an answer, then updates the same row (D9)", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(NOW + 1_000);
      const first = await save(c, { questionId: c.q("6"), value: mcq("A") });
      expect(first).toEqual({ ok: true, savedAt: NOW + 1_000, applied: true });

      vi.setSystemTime(NOW + 5_000);
      const second = await save(c, { questionId: c.q("6"), value: mcq("C") });
      expect(second).toEqual({ ok: true, savedAt: NOW + 5_000, applied: true });

      const all = await rows(c);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({
        attemptId: c.attemptId,
        questionId: c.q("6"),
        value: mcq("C"),
        flagged: false,
        updatedAt: NOW + 5_000,
      });
      expect(all[0]!.earned).toBeUndefined();
      expect(all[0]!.partResults).toBeUndefined();

      const s = await state(c);
      expect(s.responses).toEqual([
        { questionId: c.q("6"), value: mcq("C"), flagged: false, updatedAt: NOW + 5_000 },
      ]);
    });

    it("saves a flag with no answer, and toggles it off keeping the answer", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(NOW + 1_000);
      await save(c, { questionId: c.q("7"), flagged: true });
      expect((await state(c)).responses).toEqual([
        { questionId: c.q("7"), flagged: true, updatedAt: NOW + 1_000 },
      ]);

      vi.setSystemTime(NOW + 2_000);
      await save(c, { questionId: c.q("7"), value: mcq("B"), flagged: true });
      vi.setSystemTime(NOW + 3_000);
      await save(c, { questionId: c.q("7"), value: mcq("B"), flagged: false });
      expect((await state(c)).responses).toEqual([
        { questionId: c.q("7"), value: mcq("B"), flagged: false, updatedAt: NOW + 3_000 },
      ]);
    });

    it("clears an answer (omitted or blank value) and keeps the row", async () => {
      const c = await setupAttempt();
      await save(c, { questionId: c.q("6"), value: mcq("A") });
      await save(c, { questionId: c.q("6") });
      let all = await rows(c);
      expect(all).toHaveLength(1);
      expect(all[0]!.value).toBeUndefined();
      expect(all[0]!.flagged).toBe(false);

      await save(c, { questionId: c.q("8"), value: mcq("A"), flagged: true });
      await save(c, { questionId: c.q("8"), value: mcq(), flagged: true });
      all = await rows(c);
      expect(all.find((r) => r.questionId === c.q("8"))!.value).toBeUndefined();

      // getState still parses (no value on cleared rows).
      const s = await state(c);
      expect(s.responses.every((r) => r.value === undefined)).toBe(true);
    });

    it("writes no row for an unanswered, unflagged question", async () => {
      const c = await setupAttempt();
      const res = await save(c, { questionId: c.q("6") });
      expect(res.ok).toBe(true);
      await save(c, { questionId: c.q("1"), value: pbq({ "1a": "", "1b": "" }) });
      await save(c, { questionId: c.q("5"), value: fw(blankRules()) });
      expect(await rows(c)).toHaveLength(0);
    });

    it("is idempotent: the same save twice leaves one identical row", async () => {
      const c = await setupAttempt();
      const args = { questionId: c.q("6"), value: mcq("D"), clientUpdatedAt: NOW + 1_000 };
      vi.setSystemTime(NOW + 2_000);
      const a = await save(c, args);
      const b = await save(c, args);
      expect(a.applied).toBe(true);
      expect(b.applied).toBe(true);
      const all = await rows(c);
      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ value: mcq("D"), updatedAt: NOW + 1_000 });
    });
  });

  describe("out-of-order retries (last write wins by clientUpdatedAt)", () => {
    it("an older retry arriving late does not overwrite a newer save", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(NOW + 10_000);
      await save(c, { questionId: c.q("6"), value: mcq("B"), clientUpdatedAt: NOW + 9_000 });
      const late = await save(c, {
        questionId: c.q("6"),
        value: mcq("A"),
        flagged: true,
        clientUpdatedAt: NOW + 4_000,
      });
      expect(late).toEqual({ ok: true, savedAt: NOW + 10_000, applied: false });
      expect(await rows(c)).toEqual([
        expect.objectContaining({ value: mcq("B"), flagged: false, updatedAt: NOW + 9_000 }),
      ]);
    });

    it("an older clear doesn't wipe a newer answer", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(NOW + 10_000);
      await save(c, { questionId: c.q("6"), value: mcq("B"), clientUpdatedAt: NOW + 9_000 });
      await save(c, { questionId: c.q("6"), clientUpdatedAt: NOW + 8_000 });
      expect((await rows(c))[0]!.value).toEqual(mcq("B"));
    });

    it("a newer clear still beats an older answer after the row is cleared", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(NOW + 10_000);
      await save(c, { questionId: c.q("6"), value: mcq("B"), clientUpdatedAt: NOW + 5_000 });
      await save(c, { questionId: c.q("6"), clientUpdatedAt: NOW + 9_000 });
      const late = await save(c, {
        questionId: c.q("6"),
        value: mcq("B"),
        clientUpdatedAt: NOW + 5_000,
      });
      expect(late.applied).toBe(false);
      expect((await rows(c))[0]!.value).toBeUndefined();
    });

    it("clamps clientUpdatedAt to [startedAt, now]", async () => {
      const c = await setupAttempt();
      vi.setSystemTime(NOW + 1_000);
      await save(c, { questionId: c.q("6"), value: mcq("A"), clientUpdatedAt: NOW + 3_600_000 });
      expect((await rows(c))[0]!.updatedAt).toBe(NOW + 1_000);

      // A client clock far in the future can't lock the row: a later save with
      // a sane time still wins once the server clock passes it.
      vi.setSystemTime(NOW + 2_000);
      const next = await save(c, {
        questionId: c.q("6"),
        value: mcq("C"),
        clientUpdatedAt: NOW + 2_000,
      });
      expect(next.applied).toBe(true);

      await save(c, { questionId: c.q("7"), value: mcq("A"), clientUpdatedAt: 0 });
      const { startedAt } = await state(c);
      expect((await rows(c)).find((r) => r.questionId === c.q("7"))!.updatedAt).toBe(startedAt);
    });

    it("rejects a non-finite clientUpdatedAt", async () => {
      const c = await setupAttempt();
      for (const bad of [Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(
          await codeOf(save(c, { questionId: c.q("6"), value: mcq("A"), clientUpdatedAt: bad })),
        ).toBe("VALIDATION_FAILED");
      }
    });
  });

  describe("access and timing", () => {
    it("another token gets NOT_FOUND, as does a missing attempt (SE-3)", async () => {
      const c = await setupAttempt();
      expect(
        await codeOf(save(c, { questionId: c.q("6"), value: mcq("A"), anonToken: token(1) })),
      ).toBe("NOT_FOUND");
      expect(await codeOf(save(c, { questionId: c.q("6"), anonToken: "short" }))).toBe("BAD_TOKEN");
      await c.t.run((ctx) => ctx.db.delete("attempts", c.attemptId));
      expect(await codeOf(save(c, { questionId: c.q("6"), value: mcq("A") }))).toBe("NOT_FOUND");
    });

    it("accepts saves up to deadline + 30 s and refuses after (SE-4)", async () => {
      const c = await setupAttempt();
      const { deadline } = await state(c);
      expect(SAVE_GRACE_MS).toBe(30_000);

      vi.setSystemTime(deadline + SAVE_GRACE_MS);
      expect((await save(c, { questionId: c.q("6"), value: mcq("A") })).applied).toBe(true);

      vi.setSystemTime(deadline + SAVE_GRACE_MS + 1);
      expect(await codeOf(save(c, { questionId: c.q("6"), value: mcq("B") }))).toBe(
        "ATTEMPT_CLOSED",
      );
      expect((await rows(c))[0]!.value).toEqual(mcq("A"));
    });

    it("refuses saves once the attempt is submitted or expired", async () => {
      for (const status of ["submitted", "expired"] as const) {
        const c = await setupAttempt();
        await c.t.run((ctx) => ctx.db.patch("attempts", c.attemptId, { status }));
        expect(await codeOf(save(c, { questionId: c.q("6"), value: mcq("A") }))).toBe(
          "ATTEMPT_CLOSED",
        );
        expect(await rows(c)).toHaveLength(0);
      }
    });

    it("refuses the other PBQ set (PB-4) and questions from another version", async () => {
      const standard = await setupAttempt();
      expect(await codeOf(save(standard, { questionId: standard.q("B2"), flagged: true }))).toBe(
        "NOT_FOUND",
      );

      const retake = await setupAttempt("retake");
      expect(await codeOf(save(retake, { questionId: retake.q("2"), flagged: true }))).toBe(
        "NOT_FOUND",
      );
      expect(
        (await save(retake, { questionId: retake.q("B2"), value: pbq({ B2c: "22" }) })).applied,
      ).toBe(true);
      expect((await save(retake, { questionId: retake.q("6"), value: mcq("A") })).applied).toBe(
        true,
      );

      // A question from another version of the same exam.
      const otherQ = await standard.t.run(async (ctx) => {
        const v = await ctx.db.get("examVersions", standard.versionId);
        const otherVersion = await ctx.db.insert("examVersions", {
          examId: v!.examId,
          label: "Draft",
          versionNo: 2,
          status: "draft",
          totalPoints: 1,
          updatedAt: 0,
        });
        const q = await ctx.db.get("questions", standard.q("6"));
        const { _id, _creationTime, ...rest } = q!;
        return await ctx.db.insert("questions", { ...rest, versionId: otherVersion });
      });
      expect(await codeOf(save(standard, { questionId: otherQ, value: mcq("A") }))).toBe(
        "NOT_FOUND",
      );
      expect(await rows(standard)).toHaveLength(0);
    });
  });

  describe("value shape", () => {
    const long = "x".repeat(ANSWER_STRING_MAX + 1);
    const ok = "x".repeat(ANSWER_STRING_MAX);

    it("MCQ: accepts up to chooseCount distinct known option ids", async () => {
      const c = await setupAttempt();
      expect((await save(c, { questionId: c.q("20"), value: mcq("A", "E") })).applied).toBe(true);
      expect((await save(c, { questionId: c.q("6"), value: mcq("D") })).applied).toBe(true);
    });

    it.each<[string, string, AnswerValue]>([
      ["a third option on a Choose TWO", "20", mcq("A", "B", "C")],
      ["two options on a Choose ONE", "6", mcq("A", "B")],
      ["an unknown option id", "6", mcq("E")],
      ["a repeated option id", "20", mcq("A", "A")],
      ["a PBQ value on an MCQ", "6", pbq({ "1a": "x" })],
      ["a firewall value on an MCQ", "6", fw(blankRules())],
      ["an MCQ value on a PBQ", "1", mcq("A")],
      ["a firewall value on a parts PBQ", "2", fw(blankRules())],
      ["an unknown part id", "1", pbq({ "1z": "x" })],
      ["another question's part id", "1", pbq({ "2a": "22" })],
      ["free text over 200 characters", "1", pbq({ "1b": long })],
      ["a list for a text part", "1", pbq({ "1a": ["10.0.0.1"] })],
      ["a list for a port part", "2", pbq({ "2a": ["22"] })],
      ["a pick outside the choices", "3", pbq({ "3a": "evil.exe" })],
      ["a list for a pick part", "3", pbq({ "3a": ["agent-installer-v4.2.exe"] })],
      ["an unknown option on a PBQ MCQ part", "3", pbq({ "3b": "Z" })],
      ["a parts value on a firewall", "5", pbq({ "5a": "22" })],
      ["an MCQ value on a firewall", "5", mcq("A")],
      ["too few firewall rows", "5", fw(blankRules().slice(1))],
      ["too many firewall rows", "5", fw([...blankRules(), { port: null, action: null }])],
      [
        "a firewall port outside portChoices",
        "5",
        fw([{ port: "8080", action: "ALLOW" }, ...blankRules().slice(1)]),
      ],
      [
        "a firewall action outside actionChoices",
        "5",
        fw([{ port: "22", action: "DROP" }, ...blankRules().slice(1)]),
      ],
    ])("rejects %s", async (_name, n, value) => {
      const c = await setupAttempt();
      expect(await codeOf(save(c, { questionId: c.q(n), value }))).toBe("VALIDATION_FAILED");
      expect(await rows(c)).toHaveLength(0);
    });

    it("rejects portPair problems (retake B2)", async () => {
      const c = await setupAttempt("retake");
      for (const value of [
        pbq({ B2a: "22" }),
        pbq({ B2a: ["22", "80", "443"] }),
        pbq({ B2a: [long, "80"] }),
        pbq({ B2c: ["22", "80"] }),
      ]) {
        expect(await codeOf(save(c, { questionId: c.q("B2"), value }))).toBe("VALIDATION_FAILED");
      }
      expect(
        (await save(c, { questionId: c.q("B2"), value: pbq({ B2a: ["22", "80"], B2b: ["443"] }) }))
          .applied,
      ).toBe(true);
    });

    it("rejects values that fail the argument validator", async () => {
      const c = await setupAttempt();
      const bad = [
        { kind: "mcq" },
        { kind: "mcq", optionIds: [1] },
        { kind: "essay", text: "x" },
        { kind: "pbq", parts: { "1a": 5 } },
        { kind: "firewall", rules: [{ port: 22, action: "ALLOW" }] },
        { kind: "mcq", optionIds: ["A"], extra: true },
      ];
      for (const value of bad) {
        await expect(
          c.t.mutation(api.attempts.saveResponse, {
            attemptId: c.attemptId,
            anonToken: token(),
            questionId: c.q("6"),
            value: value as unknown as AnswerValue,
            flagged: false,
          }),
        ).rejects.toThrow();
      }
      expect(await rows(c)).toHaveLength(0);
    });

    it("accepts a full valid answer for every standard PBQ template", async () => {
      const c = await setupAttempt();
      const values: [string, AnswerValue][] = [
        ["1", pbq({ "1a": "203.0.113.5", "1b": ok, "1c": "42", "1d": "" })],
        ["2", pbq({ "2a": "22", "2b": "", "2c": "3389" })],
        ["3", pbq({ "3a": "vpn-client-3.1.msi", "3b": "A", "3c": "" })],
        ["4", pbq({ "4a": "/etc/ssh/sshd_config", "4b": "600", "4c": "644", "4d": "x" })],
        [
          "5",
          fw([
            { port: "22", action: "ALLOW" },
            { port: null, action: "DENY" },
            { port: "Any", action: null },
            { port: null, action: null },
          ]),
        ],
      ];
      for (const [n, value] of values) {
        expect((await save(c, { questionId: c.q(n), value })).applied).toBe(true);
      }
      const s = await state(c);
      expect(s.responses).toHaveLength(5);
      for (const [n, value] of values) {
        expect(s.responses.find((r) => r.questionId === c.q(n))!.value).toEqual(value);
      }
    });
  });

  it("never reads answer keys or writes marks", async () => {
    const c = await setupAttempt();
    // Removing every key must not change what a save does.
    await c.t.run(async (ctx) => {
      for (const k of await ctx.db.query("answerKeys").collect())
        await ctx.db.delete("answerKeys", k._id);
    });
    expect((await save(c, { questionId: c.q("6"), value: mcq("A") })).applied).toBe(true);
    const [row] = await rows(c);
    expect(row!.earned).toBeUndefined();
    expect(row!.partResults).toBeUndefined();
  });
});
