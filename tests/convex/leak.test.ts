// T-209: answer-key leak test over every public function (SE-1; LLD §17 leak
// row; PRD success metric "zero answer keys returned to a student before
// submission"). Uses the real seed.
//
// 1. Every public function exported from `convex/` is discovered from the
//    modules themselves and must be classified below: a new public function
//    that isn't listed (or a listed one that is gone) fails the build.
// 2. Staff-only functions refuse an anonymous caller (every student is
//    anonymous), a signed-in user without a profile, and admin-only ones a
//    tutor.
// 3. Every student-facing function is called through a whole sitting and each
//    response (and error) is deep-scanned for key fields and key values. Run
//    twice: on the real keys, and on keys rewritten to canary strings so that
//    short values (option ids, ports) can be found too.
// 4. A static check: only allow-listed declarations read `answerKeys`.

import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../convex/_generated/api";
import type { Doc, Id } from "../../convex/_generated/dataModel";
import { errorCodeOf } from "../../convex/lib/errors";
import type { PaperQuestion } from "../../convex/lib/paper";
import type { AnswerValue } from "../../shared/content";
import type { SeedExam } from "../../scripts/lib/types";
import seedJson from "../../content/seed/sy0-701.json";
import { seedAuthSession, seedSignedIn, setup, type T } from "./lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const IP_HASH = "c".repeat(64);
const seed = seedJson as SeedExam;

const token = (n = 0) => `tok${String(n).padStart(40, "0")}`;

// ---------------------------------------------------------------------------
// Discovery and classification
// ---------------------------------------------------------------------------

type Kind = "query" | "mutation" | "action" | "httpAction" | "router";

// `*.config.ts` (app and auth config) register no functions, and the component
// configs they import don't load outside the Convex bundler.
const convexModules = import.meta.glob<Record<string, unknown>>(
  ["../../convex/**/*.ts", "!../../convex/_generated/**", "!../../convex/**/*.config.ts"],
  { eager: true },
);

/** `"module:export"` → kind, for every public function and HTTP router in `convex/`. */
function discoverPublic(): Map<string, Kind> {
  const found = new Map<string, Kind>();
  for (const [path, exports] of Object.entries(convexModules)) {
    const module = path.replace(/^\.\.\/\.\.\/convex\//, "").replace(/\.ts$/, "");
    for (const [name, value] of Object.entries(exports)) {
      if ((typeof value !== "function" && typeof value !== "object") || value === null) continue;
      const f = value as Record<string, unknown>;
      const id = `${module}:${name}`;
      if (f.isRouter === true) found.set(id, "router");
      else if (f.isHttp === true) found.set(id, "httpAction");
      else if (f.isPublic === true) {
        const kind = f.isQuery ? "query" : f.isMutation ? "mutation" : f.isAction ? "action" : null;
        if (!kind) throw new Error(`${id}: public but neither query, mutation nor action`);
        found.set(id, kind);
      }
    }
  }
  return found;
}

/**
 * Student-reachable (anonymous) functions. Each must return no key material,
 * except `review:getReview` for the owner of a submitted attempt (EX-17) and
 * `shareLinks:view` for a live link the owner made (CL-9).
 * The scan below must call every one of them.
 */
const STUDENT_FACING = [
  "attempts:start", // Nuxt route only (server secret), but on the student's behalf
  "attempts:getPaper",
  "attempts:getState",
  "attempts:saveResponse",
  "attempts:submit",
  "review:getResult",
  "review:getReview",
  "review:myAttempts",
  "classes:lookupCode",
  "invitations:peek", // public invite page; no exam content
  "invitations:accept",
  "profiles:me", // null for an anonymous caller
  "shareLinks:create", // owner token, submitted only
  "shareLinks:revoke", // owner token
  "shareLinks:forAttempt", // owner token; the link id only
  "shareLinks:view", // public; keys only through a live link (CL-9)
] as const;

type Ids = {
  profileId: Id<"profiles">;
  versionId: Id<"examVersions">;
  classId: Id<"classes">;
  invitationId: Id<"invitations">;
  questionId: Id<"questions">;
  attemptId: Id<"attempts">;
};

/** Staff-only functions: the least role they need, and arguments that pass validation. */
const STAFF_ONLY: Record<
  string,
  { role: "tutor" | "admin"; args: (ids: Ids) => Record<string, unknown> }
> = {
  "admin:tutors": { role: "admin", args: () => ({}) },
  "admin:removeTutor": { role: "admin", args: (i) => ({ profileId: i.profileId }) },
  "admin:restoreTutor": { role: "admin", args: (i) => ({ profileId: i.profileId }) },
  "admin:audit": {
    role: "admin",
    args: () => ({ paginationOpts: { numItems: 10, cursor: null } }),
  },
  "admin:deleteAttempts": { role: "admin", args: () => ({ attemptIds: [] }) },
  "invitations:create": { role: "admin", args: () => ({ email: "new@example.com" }) },
  "invitations:list": { role: "admin", args: () => ({}) },
  "invitations:resend": { role: "admin", args: (i) => ({ invitationId: i.invitationId }) },
  "invitations:cancel": { role: "admin", args: (i) => ({ invitationId: i.invitationId }) },
  "classes:create": { role: "tutor", args: (i) => ({ name: "C", versionId: i.versionId }) },
  "classes:update": { role: "tutor", args: (i) => ({ classId: i.classId, name: "C2" }) },
  "classes:mine": { role: "tutor", args: () => ({}) },
  "classes:attempts": { role: "tutor", args: (i) => ({ classId: i.classId }) },
  "classes:stats": { role: "tutor", args: (i) => ({ classId: i.classId }) },
  "classes:attemptResult": { role: "tutor", args: (i) => ({ attemptId: i.attemptId }) },
  "classes:attemptReview": { role: "tutor", args: (i) => ({ attemptId: i.attemptId }) }, // keys, by design (CL-7)
  "classes:exportCsv": { role: "tutor", args: (i) => ({ classId: i.classId }) },
  "classes:deleteAttempts": { role: "tutor", args: (i) => ({ attemptIds: [i.attemptId] }) },
  "editor:myVersions": { role: "tutor", args: () => ({}) },
  "editor:createDraft": {
    role: "tutor",
    args: (i) => ({ fromVersionId: i.versionId, label: "D" }),
  },
  "editor:getDraft": { role: "tutor", args: (i) => ({ versionId: i.versionId }) },
  "editor:saveQuestion": {
    role: "tutor",
    args: (i) => ({
      versionId: i.versionId,
      question: {
        kind: "mcq",
        section: "mcq",
        domain: "1.0",
        stem: "S",
        options: [],
        chooseCount: 1,
      },
      key: { explanation: "" },
    }),
  },
  "editor:deleteQuestion": {
    role: "tutor",
    args: (i) => ({ versionId: i.versionId, questionId: i.questionId }),
  },
  "editor:reorder": {
    role: "tutor",
    args: (i) => ({ versionId: i.versionId, section: "mcq", questionIds: [] }),
  },
  "editor:validate": { role: "tutor", args: (i) => ({ versionId: i.versionId }) }, // issue text may quote keys (author only)
  "editor:publish": { role: "tutor", args: (i) => ({ versionId: i.versionId }) },
};

/** Better Auth's routes (`/api/auth/*`): no exam data; covered by the auth tests. */
const HTTP = ["http:default"] as const;

// ---------------------------------------------------------------------------
// Calling a function by name
// ---------------------------------------------------------------------------

type Caller = Pick<T, "query" | "mutation" | "action">;
type Outcome = { ok: true; value: unknown } | { ok: false; error: unknown };

async function callByName(
  caller: Caller,
  kinds: Map<string, Kind>,
  name: string,
  args: Record<string, unknown>,
): Promise<Outcome> {
  const kind = kinds.get(name);
  try {
    let value: unknown;
    if (kind === "query") value = await caller.query(makeFunctionReference<"query">(name), args);
    else if (kind === "mutation") {
      value = await caller.mutation(makeFunctionReference<"mutation">(name), args);
    } else if (kind === "action") {
      value = await caller.action(makeFunctionReference<"action">(name), args);
    } else throw new Error(`${name}: not a public query, mutation or action (${kind})`);
    return { ok: true, value };
  } catch (error) {
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// The leak detector
// ---------------------------------------------------------------------------

/** Field names that only key data (or marks, before review) use. */
const FORBIDDEN_FIELDS = new Set([
  "correct",
  "correctAnswer",
  "explanation",
  "practice",
  "practiceAnswer",
  "answerKeys",
  "key",
  "keys",
  "modelAnswer",
  "labAnswers",
  "earned",
  "partResults",
]);

/** Prefix of every value in the canary run's keys. */
const CANARY = "LEAKCANARY";

/** Everything a student is meant to see: values found here are not evidence of a leak. */
const VISIBLE = JSON.stringify([seed.exam, seed.questions, seed.domains]);

/** Escaped as it would appear inside a JSON string. */
const asJson = (s: string) => JSON.stringify(s).slice(1, -1);

/**
 * Key material from the seed that a student never sees in question content:
 * explanations (and their opening words), practice answers, PBQ part and
 * firewall key values, lab answers and oral model answers. Values shorter
 * than 4 characters (option ids, ports, counts) match by accident anywhere;
 * the canary run covers them.
 */
const SECRET_VALUES: string[] = (() => {
  const out = new Set<string>();
  const add = (s: string) => {
    if (s.length >= 4 && !VISIBLE.includes(asJson(s))) out.add(s);
  };
  for (const k of seed.answerKeys) {
    add(k.explanation);
    add(k.explanation.slice(0, 40));
    const p = k.parts;
    if (p && "rules" in p) for (const r of p.rules) add(`${r.port}","action":"${r.action}`);
    if (p && "parts" in p) {
      for (const v of Object.values(p.parts)) for (const s of [v].flat()) add(s);
      for (const s of Object.values(p.practice ?? {})) add(s);
    }
  }
  for (const s of seed.labAnswers) add(s);
  for (const o of seed.oralQuestions) add(o.modelAnswer);
  return [...out];
})();

/** Paths and reasons for every piece of key material in `value`. Empty means clean. */
function findLeaks(value: unknown): string[] {
  const leaks: string[] = [];
  const walk = (v: unknown, path: string) => {
    if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${path}[${i}]`));
    else if (v !== null && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        if (FORBIDDEN_FIELDS.has(k)) leaks.push(`field ${path}.${k}`);
        walk(x, `${path}.${k}`);
      }
    }
  };
  walk(value, "$");
  const json = JSON.stringify(value) ?? "";
  if (json.includes(CANARY)) leaks.push("canary key value");
  for (const s of SECRET_VALUES) {
    if (json.includes(asJson(s))) leaks.push(`key value ${JSON.stringify(s.slice(0, 40))}`);
  }
  return leaks;
}

/** A response or a thrown error as plain data, so error messages are scanned too. */
function asData(o: Outcome): unknown {
  if (o.ok) return o.value;
  const e = o.error as { message?: unknown; data?: unknown };
  return { error: { message: String(e?.message ?? e), data: e?.data ?? null } };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

async function importSeed(t: T): Promise<Id<"examVersions">> {
  const { versionId } = await t.mutation(internal.seed.importExam, { seed });
  return versionId;
}

/** Rewrite every stored key so each value carries the canary (keeps the shapes valid). */
async function canaryKeys(t: T) {
  await t.run(async (ctx) => {
    const keys = await ctx.db.query("answerKeys").collect();
    for (const [i, k] of keys.entries()) {
      const tag = (s: string) => `${CANARY}-${i}-${s}`;
      const patch: Partial<Doc<"answerKeys">> = { explanation: tag("explanation") };
      if (k.correct) patch.correct = k.correct.map(tag);
      const p = k.parts;
      if (p && "rules" in p) {
        patch.parts = {
          rules: p.rules.map((r, j) => ({ port: tag(`port${j}`), action: r.action })),
        };
      } else if (p) {
        patch.parts = {
          parts: Object.fromEntries(
            Object.entries(p.parts).map(([id, v]) => [
              id,
              Array.isArray(v) ? v.map((_, j) => tag(`${id}.${j}`)) : tag(id),
            ]),
          ),
          ...(p.practice
            ? {
                practice: Object.fromEntries(Object.keys(p.practice).map((id) => [id, tag(id)])),
              }
            : {}),
        };
      }
      await ctx.db.patch("answerKeys", k._id, patch);
    }
  });
}

/**
 * An answer that fits the question but is neither right nor a key value: a
 * wrong option, "zz" in free-text parts, blank picks, unset firewall cells.
 */
function neutralAnswer(q: PaperQuestion): AnswerValue | undefined {
  const key = seed.answerKeys.find((k) => k.displayNumber === q.displayNumber);
  if (q.kind === "mcq") {
    const wrong = q.options.find((o) => !(key?.correct ?? []).includes(o.id));
    return wrong ? { kind: "mcq", optionIds: [wrong.id] } : undefined;
  }
  const payload = q.payload;
  if (payload.template === "firewall") {
    return { kind: "firewall", rules: payload.rules.map(() => ({ port: null, action: null })) };
  }
  return {
    kind: "pbq",
    parts: Object.fromEntries(
      payload.parts.map((p) => [
        p.id,
        p.kind === "portPair" ? ["zz"] : p.kind === "pick" || p.kind === "mcq" ? "" : "zz",
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("answer-key leak test (T-209, SE-1)", () => {
  const kinds = discoverPublic();

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe("classification", () => {
    it("every public function in convex/ is classified, and every classified one exists", () => {
      const classified = [...STUDENT_FACING, ...Object.keys(STAFF_ONLY), ...HTTP];
      expect(new Set(classified).size).toBe(classified.length); // no double listing
      expect([...kinds.keys()].sort()).toEqual([...classified].sort());
    });

    it("discovery sees the modules (a broken glob would pass the check above vacuously)", () => {
      expect(kinds.get("attempts:getPaper")).toBe("query");
      expect(kinds.get("attempts:saveResponse")).toBe("mutation");
      expect(kinds.get("invitations:accept")).toBe("action");
      expect(kinds.get("http:default")).toBe("router");
      expect(kinds.has("attempts:autoSubmit")).toBe(false); // internal
      expect(kinds.has("seed:importExam")).toBe(false); // internal
    });

    it("the detector flags key fields, key values and canaries, and passes clean data", () => {
      expect(findLeaks({ a: [{ correct: ["A"] }] })).toEqual(["field $.a[0].correct"]);
      expect(findLeaks({ explanation: "x" })).toEqual(["field $.explanation"]);
      expect(findLeaks({ note: seed.answerKeys[0]!.explanation })).not.toEqual([]);
      expect(findLeaks({ note: `${CANARY}-1-x` })).toEqual(["canary key value"]);
      expect(findLeaks({ questions: seed.questions, parts: { "1a": "zz" } })).toEqual([]);
      expect(SECRET_VALUES.length).toBeGreaterThan(seed.answerKeys.length);
    });
  });

  describe("staff-only functions refuse students", () => {
    async function staffFixture() {
      const t = setup();
      const versionId = await importSeed(t);
      const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
      const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
      const { classId } = await tutor.as.mutation(api.classes.create, { name: "K", versionId });
      const invitationId = await t.run((ctx) =>
        ctx.db.insert("invitations", {
          email: "inv@example.com",
          tokenHash: "d".repeat(64),
          invitedBy: admin.profileId,
          expiresAt: NOW + 86_400_000,
          status: "pending",
          createdAt: NOW,
        }),
      );
      const questionId = await t.run(async (ctx) => (await ctx.db.query("questions").first())!._id);
      const attemptId = await t.run((ctx) =>
        ctx.db.insert("attempts", {
          anonKey: "e".repeat(64),
          displayName: "Sam",
          classId,
          versionId,
          mode: "standard",
          status: "in_progress",
          startedAt: NOW,
          deadline: NOW + 90 * 60_000,
          shuffleSeed: 1,
        }),
      );
      const ids: Ids = {
        profileId: tutor.profileId,
        versionId,
        classId,
        invitationId,
        questionId,
        attemptId,
      };
      return { t, ids, tutor };
    }

    it("an anonymous caller (every student) gets UNAUTHENTICATED", async () => {
      const { t, ids } = await staffFixture();
      for (const [name, spec] of Object.entries(STAFF_ONLY)) {
        const out = await callByName(t, kinds, name, spec.args(ids));
        expect(out.ok, name).toBe(false);
        if (!out.ok) expect(errorCodeOf(out.error), name).toBe("UNAUTHENTICATED");
        expect(findLeaks(asData(out)), name).toEqual([]);
      }
    });

    it("a signed-in user without a profile gets FORBIDDEN", async () => {
      const { t, ids } = await staffFixture();
      const { userId, sessionId } = await seedAuthSession(t, "nobody@example.com");
      const as = t.withIdentity({ subject: userId, sessionId });
      for (const [name, spec] of Object.entries(STAFF_ONLY)) {
        const out = await callByName(as, kinds, name, spec.args(ids));
        expect(out.ok, name).toBe(false);
        if (!out.ok) expect(errorCodeOf(out.error), name).toBe("FORBIDDEN");
      }
    });

    it("another tutor can't read a class attempt's review or result (NOT_FOUND)", async () => {
      const { t, ids } = await staffFixture();
      const other = await seedSignedIn(t, { label: "other", role: "tutor" });
      await t.run((ctx) => ctx.db.patch("attempts", ids.attemptId, { status: "submitted" }));
      for (const name of [
        "classes:attemptReview",
        "classes:attemptResult",
        "classes:stats",
        "classes:exportCsv",
        "classes:deleteAttempts",
      ]) {
        const out = await callByName(other.as, kinds, name, STAFF_ONLY[name]!.args(ids));
        expect(out.ok, name).toBe(false);
        if (!out.ok) expect(errorCodeOf(out.error), name).toBe("NOT_FOUND");
      }
    });

    it("a tutor gets FORBIDDEN from admin-only functions", async () => {
      const { ids, tutor } = await staffFixture();
      const adminOnly = Object.entries(STAFF_ONLY).filter(([, s]) => s.role === "admin");
      expect(adminOnly.length).toBeGreaterThan(0);
      for (const [name, spec] of adminOnly) {
        const out = await callByName(tutor.as, kinds, name, spec.args(ids));
        expect(out.ok, name).toBe(false);
        if (!out.ok) expect(errorCodeOf(out.error), name).toBe("FORBIDDEN");
      }
    });
  });

  describe.each([
    { label: "real keys", canary: false },
    { label: "canary keys", canary: true },
  ])("student-facing functions return no key material ($label)", ({ canary }) => {
    it("scans every response of a whole sitting, before and after submission", async () => {
      const t = setup();
      const versionId = await importSeed(t);
      if (canary) await canaryKeys(t);
      const tutor = await seedSignedIn(t, { label: "tutor", role: "tutor" });
      const { code } = await tutor.as.mutation(api.classes.create, {
        name: "Leak class",
        versionId,
      });

      const called = new Set<string>();
      /** Call a student function anonymously and scan what comes back (or the error). */
      async function call(name: string, phase: string, args: Record<string, unknown>) {
        called.add(name);
        const out = await callByName(t, kinds, name, args);
        expect(findLeaks(asData(out)), `${name} (${phase})`).toEqual([]);
        return out;
      }
      async function value(name: string, phase: string, args: Record<string, unknown>) {
        const out = await call(name, phase, args);
        if (!out.ok) throw out.error;
        return out.value;
      }
      async function refused(name: string, phase: string, args: Record<string, unknown>) {
        const out = await call(name, phase, args);
        expect(out.ok, `${name} (${phase}) should refuse`).toBe(false);
        return out.ok ? null : errorCodeOf(out.error);
      }

      // Public, account-free lookups.
      expect(await value("classes:lookupCode", "start screen", { code })).toMatchObject({
        open: true,
      });
      await value("invitations:peek", "invite page", { token: "x".repeat(43) });
      expect(await refused("invitations:accept", "invite page", { token: "x".repeat(43) })).toBe(
        "NOT_FOUND",
      );
      expect(await value("profiles:me", "anonymous", {})).toBeNull();

      // Two attempts: a class attempt (set A) and a retake (set B), each its own token.
      const startArgs = (n: number, extra: Record<string, unknown>) => ({
        serverSecret: SECRET,
        anonToken: token(n),
        ipHash: IP_HASH,
        ...extra,
      });
      const started = (await value(
        "attempts:start",
        "start",
        startArgs(0, { mode: "standard", classCode: code, displayName: "Sam" }),
      )) as { attemptId: Id<"attempts"> };
      const retake = (await value("attempts:start", "start", startArgs(1, { mode: "retake" }))) as {
        attemptId: Id<"attempts">;
      };
      const own = { attemptId: started.attemptId, anonToken: token(0) };
      const ownRetake = { attemptId: retake.attemptId, anonToken: token(1) };

      // In progress: paper, state, every save, then state again.
      const paper = (await value("attempts:getPaper", "in progress", own)) as {
        questions: PaperQuestion[];
      };
      await value("attempts:getPaper", "in progress (retake)", ownRetake);
      await value("attempts:getState", "in progress, nothing saved", own);
      for (const [i, q] of paper.questions.entries()) {
        const answer = neutralAnswer(q);
        await value("attempts:saveResponse", "in progress", {
          ...own,
          questionId: q.questionId,
          ...(answer ? { value: answer } : {}),
          flagged: i % 7 === 0,
        });
      }
      await value("attempts:getState", "in progress, all saved", own);
      await value("attempts:getState", "in progress (retake)", ownRetake);
      await value("review:myAttempts", "in progress", {
        anonToken: token(0),
        paginationOpts: { numItems: 10, cursor: null },
      });

      // Results and review are refused until submission (SE-1); so is sharing.
      expect(await refused("shareLinks:create", "in progress", own)).toBe("NOT_FOUND");
      expect(await value("shareLinks:forAttempt", "in progress", own)).toBeNull();
      expect(await refused("review:getResult", "in progress", own)).toBe("NOT_FOUND");
      expect(await refused("review:getReview", "in progress", own)).toBe("NOT_FOUND");
      expect(await refused("review:getReview", "in progress (retake)", ownRetake)).toBe(
        "NOT_FOUND",
      );

      // Submission and everything after it, except the owner's review.
      vi.setSystemTime(NOW + 30 * 60_000);
      await value("attempts:submit", "submit", own);
      await value("attempts:submit", "submit again", own);
      expect(
        await refused("attempts:saveResponse", "after submit", {
          ...own,
          questionId: paper.questions[0]!.questionId,
          flagged: true,
        }),
      ).toBe("ATTEMPT_CLOSED");
      await value("review:getResult", "submitted", own);
      await value("attempts:getState", "submitted", own);
      await value("attempts:getPaper", "submitted", own);
      await value("review:myAttempts", "submitted", {
        anonToken: token(0),
        paginationOpts: { numItems: 10, cursor: null },
      });

      // Someone else's submitted attempt looks missing; so does a bad token.
      const foreign = { attemptId: started.attemptId, anonToken: token(1) };
      expect(await refused("review:getReview", "non-owner", foreign)).toBe("NOT_FOUND");
      expect(await refused("review:getResult", "non-owner", foreign)).toBe("NOT_FOUND");
      expect(await refused("attempts:getPaper", "non-owner", foreign)).toBe("NOT_FOUND");
      expect(await refused("attempts:getState", "non-owner", foreign)).toBe("NOT_FOUND");
      expect(await refused("attempts:submit", "non-owner", foreign)).toBe("NOT_FOUND");
      expect(await refused("review:getReview", "bad token", { ...own, anonToken: "short" })).toBe(
        "BAD_TOKEN",
      );

      // Share links: only the owner shares; unknown and revoked links look the same.
      expect(await refused("shareLinks:create", "non-owner", foreign)).toBe("NOT_FOUND");
      const { publicId } = (await value("shareLinks:create", "submitted", own)) as {
        publicId: string;
      };
      await value("shareLinks:forAttempt", "submitted", own);
      expect(
        await refused("shareLinks:revoke", "non-owner", { publicId, anonToken: token(1) }),
      ).toBe("NOT_FOUND");
      const unknownView = await value("shareLinks:view", "unknown link", {
        publicId: "A".repeat(22),
      });
      expect(unknownView).toBeNull();

      // The second exception: a live share link carries the review, keys included.
      const live = await callByName(t, kinds, "shareLinks:view", { publicId });
      expect(live.ok && live.value).not.toBeNull();
      expect(findLeaks(asData(live))).toContain(
        canary ? "canary key value" : "field $.review[0].explanation",
      );
      await value("shareLinks:revoke", "revoke", { publicId, anonToken: token(0) });
      expect(await value("shareLinks:view", "revoked link", { publicId })).toEqual(unknownView);
      expect(await value("shareLinks:forAttempt", "revoked", own)).toBeNull();

      // The one legitimate exception: the owner's review after submission. It
      // must carry the keys, which also proves the detector sees this run's keys.
      const review = await callByName(t, kinds, "review:getReview", own);
      called.add("review:getReview");
      expect(review.ok).toBe(true);
      const found = findLeaks(asData(review));
      expect(found).toContain(canary ? "canary key value" : "field $[0].explanation");
      if (!canary) expect(found.some((f) => f.startsWith("key value"))).toBe(true);

      // Self-check: the scan reached every student-facing function.
      expect([...called].sort()).toEqual([...STUDENT_FACING].sort());
    });
  });

  describe("static: who reads answerKeys", () => {
    const sources = import.meta.glob<string>(
      ["../../convex/**/*.ts", "!../../convex/_generated/**"],
      { query: "?raw", import: "default", eager: true },
    );
    const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    const fileOf = (path: string) => path.replace(/^\.\.\/\.\.\/convex\//, "");

    /** The top-level declaration that contains `index` in `src`. */
    function enclosing(src: string, index: number): string {
      const decl = /^(?:export\s+)?(?:async\s+)?(?:function\s+(\w+)|const\s+(\w+)\s*=)/gm;
      let name = "<module>";
      for (const m of src.matchAll(decl)) {
        if (m.index > index) break;
        name = m[1] ?? m[2] ?? name;
      }
      return name;
    }

    /** Every `file#declaration` in which `pattern` occurs (outside comments). */
    function sites(pattern: RegExp): string[] {
      const out = new Set<string>();
      for (const [path, raw] of Object.entries(sources)) {
        const src = strip(raw);
        for (const m of src.matchAll(pattern))
          out.add(`${fileOf(path)}#${enclosing(src, m.index)}`);
      }
      return [...out].sort();
    }

    /** A database read or write of the table, or its document validator. */
    const KEY_ACCESS = /\b(?:query|get|insert|patch|replace|delete|doc)\(\s*["'`]answerKeys["'`]/g;

    it("only allow-listed declarations touch the answerKeys table", () => {
      expect(sites(KEY_ACCESS)).toEqual(
        [
          "attempts.ts#finalise", // marking at submit; returns totals only
          "editor.ts#answerKeyDoc", // getDraft's return validator (author only)
          "editor.ts#createDraft", // copies keys into a new draft (tutor)
          "editor.ts#deleteQuestion", // tutor, own draft
          "editor.ts#keysOf", // saveQuestion / deleteQuestion helper
          "editor.ts#readContent", // createDraft / getDraft helper
          "editor.ts#saveQuestion", // tutor, own draft
          "lib/review.ts#buildReview", // review.getReview, submitted + owner only
          "seed.ts#importExam", // internal
          "seed.ts#tallyVersion", // seed.summary (internal)
        ].sort(),
      );
    });

    it("the helpers that read keys are only called from guarded or internal code", () => {
      expect(sites(/\bbuildReview\(/g)).toEqual([
        "classes.ts#attemptReview", // tutor, own class only (CL-7)
        "lib/review.ts#buildReview",
        "review.ts#getReview",
        "shareLinks.ts#view", // live link only (CL-9)
      ]);
      expect(sites(/\bfinalise\(/g)).toEqual(
        [
          "attempts.ts#autoSubmit",
          "attempts.ts#finalise",
          "attempts.ts#submit",
          "attempts.ts#sweepOpenAttempts",
        ].sort(),
      );
      expect(sites(/\breadContent\(/g)).toEqual(
        [
          "editor.ts#createDraft",
          "editor.ts#getDraft",
          "editor.ts#publish",
          "editor.ts#readContent",
          "editor.ts#validate",
        ].sort(),
      );
      expect(sites(/\bkeysOf\(/g)).toEqual(
        ["editor.ts#deleteQuestion", "editor.ts#keysOf", "editor.ts#saveQuestion"].sort(),
      );
      expect(sites(/\btallyVersion\(/g)).toEqual(["seed.ts#summary", "seed.ts#tallyVersion"]);
      expect(sites(/\banswerKeyDoc\b/g)).toEqual(["editor.ts#answerKeyDoc", "editor.ts#getDraft"]);
    });
  });
});
