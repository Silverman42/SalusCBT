// T-510: the Stage 5 isolation gate ("tutors can't see each other's
// classes"; PRD SE-2, SE-3). One table drives every tutor-facing function in
// `classes`, `editor` and `content` against tutor A's records, as tutor B
// (refused with NOT_FOUND, or A's records absent from a list, and nothing
// written), as A (works) and as the admin (works, except editing another
// tutor's draft, which ED-5 refuses with VALIDATION_FAILED). A coverage check
// fails when a function is added to those modules without a row here.
//
// Signed-out, profile-less and removed callers are covered for every function
// in tests/convex/auth/access.test.ts; per-function details in the T-501 to
// T-503 and T-6xx tests.

import { makeFunctionReference } from "convex/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedSignedIn, setup, type T } from "../lib/fixtures";

const seed = seedJson as SeedExam;
const NOW = new Date("2026-11-08T10:00:00Z").getTime();
const SECRET = "test-server-secret-0123456789abcdef";
const token = (n: number) => `tok${String(n).padStart(40, "0")}`;
const ipHash = (n: number) => n.toString(16).padStart(64, "0");

type Kind = "query" | "mutation" | "action";
type Caller = Pick<T, "query" | "mutation" | "action">;

/** Public by design, so not in the matrix (`lookupCode` is the start screen's). */
const PUBLIC_IN_TUTOR_MODULES = ["classes:lookupCode"];

type Registered = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
};

/** Public functions of the tutor-facing modules (`classes`, `editor`, `content`), by path. */
function tutorFunctions(): Map<string, Kind> {
  const modules = import.meta.glob<Record<string, unknown>>(
    ["../../../convex/classes.ts", "../../../convex/editor.ts", "../../../convex/content.ts"],
    { eager: true },
  );
  const found = new Map<string, Kind>();
  for (const [file, exports] of Object.entries(modules)) {
    const module = file.replace(/^.*\/convex\//, "").replace(/\.ts$/, "");
    for (const [name, value] of Object.entries(exports)) {
      const fn = value as Registered | null;
      if (!fn || (typeof fn !== "object" && typeof fn !== "function") || !fn.isPublic) continue;
      const kind: Kind | null = fn.isQuery
        ? "query"
        : fn.isMutation
          ? "mutation"
          : fn.isAction
            ? "action"
            : null;
      const path = `${module}:${name}`;
      if (kind && !PUBLIC_IN_TUTOR_MODULES.includes(path)) found.set(path, kind);
    }
  }
  return found;
}

async function call(caller: Caller, kind: Kind, path: string, args: Record<string, unknown>) {
  if (kind === "query") return await caller.query(makeFunctionReference<"query">(path), args);
  if (kind === "mutation") {
    return await caller.mutation(makeFunctionReference<"mutation">(path), args);
  }
  return await caller.action(makeFunctionReference<"action">(path), args);
}

async function refusal(p: Promise<unknown>): Promise<string> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to be refused").not.toBeNull();
  return errorCodeOf(err) ?? String(err);
}

/** A student sits a blank paper in a class and submits it. */
async function sit(t: T, n: number, classCode: string, displayName: string) {
  const anonToken = token(n);
  const { attemptId } = await t.mutation(api.attempts.start, {
    serverSecret: SECRET,
    anonToken,
    mode: "standard",
    ipHash: ipHash(n),
    classCode,
    displayName,
  });
  await t.mutation(api.attempts.submit, { attemptId, anonToken });
  return { attemptId, anonToken };
}

type World = Awaited<ReturnType<typeof world>>;

/**
 * Tutor A: an own published version, an own draft, a class on the own version
 * with Ann's submitted attempt. Tutor B: a class on the default version with
 * Ben's submitted attempt. And the admin.
 */
async function world() {
  const t = setup();
  const { versionId: defaultId } = await t.mutation(internal.seed.importExam, { seed });
  const a = await seedSignedIn(t, { label: "tutor-a", role: "tutor" });
  const b = await seedSignedIn(t, { label: "tutor-b", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });

  const ownA = (
    await a.as.mutation(api.editor.createDraft, { fromVersionId: defaultId, label: "A's own" })
  ).versionId;
  await a.as.mutation(api.editor.publish, { versionId: ownA });
  const draftA = (
    await a.as.mutation(api.editor.createDraft, { fromVersionId: ownA, label: "A's draft" })
  ).versionId;

  const classA = await a.as.mutation(api.classes.create, { name: "A's class", versionId: ownA });
  const classB = await b.as.mutation(api.classes.create, {
    name: "B's class",
    versionId: defaultId,
  });
  const ann = await sit(t, 1, classA.code, "Ann");
  const ben = await sit(t, 2, classB.code, "Ben");

  const draftQuestions = await t.run((ctx) =>
    ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) => q.eq("versionId", draftA))
      .collect(),
  );
  const mcqIds = draftQuestions.filter((q) => q.section === "mcq").map((q) => q._id);
  const pbqId = draftQuestions.find((q) => q.section === "pbqA" && q.template !== undefined)!._id;

  return { t, a, b, admin, defaultId, ownA, draftA, classA, classB, ann, ben, mcqIds, pbqId };
}

/** Every table a refused call must leave alone. */
const snapshot = (t: T) =>
  t.run(async (ctx) => ({
    classes: await ctx.db.query("classes").collect(),
    attempts: await ctx.db.query("attempts").collect(),
    responses: await ctx.db.query("responses").collect(),
    shareLinks: await ctx.db.query("shareLinks").collect(),
    examVersions: await ctx.db.query("examVersions").collect(),
    questions: await ctx.db.query("questions").collect(),
    answerKeys: await ctx.db.query("answerKeys").collect(),
    oralQuestions: await ctx.db.query("oralQuestions").collect(),
    auditLog: await ctx.db.query("auditLog").collect(),
  }));

const mcqInput = {
  question: {
    kind: "mcq" as const,
    section: "mcq" as const,
    domain: "2.0" as const,
    stem: "Which control is detective?",
    options: [
      { id: "A", text: "Firewall" },
      { id: "B", text: "IDS" },
      { id: "C", text: "Lock" },
      { id: "D", text: "Policy" },
    ],
    chooseCount: 1,
  },
  key: { correct: ["B"], explanation: "An IDS detects intrusions." },
};

/** What a caller should get: refused with a code, or a result that passes `check`. */
type Expect = string | ((result: unknown, w: World) => void);

type Row = {
  path: string;
  label?: string;
  args: (w: World) => Record<string, unknown>;
  /** Tutor B's outcome on A's records (default NOT_FOUND). */
  asB?: Expect;
  asA: Expect;
  asAdmin: Expect;
};

type Summary = { classId?: string; versionId?: string };
const ids = (r: unknown, key: keyof Summary) => (r as Summary[]).map((x) => x[key]);
const ok = () => {};

/** ED-5: nobody but its owner edits a tutor's draft, the admin included. */
const ADMIN_ON_TUTOR_DRAFT = "VALIDATION_FAILED";

const ROWS: Row[] = [
  // classes
  {
    path: "classes:create",
    label: "classes:create on A's own version",
    args: (w) => ({ name: "Borrowed", versionId: w.ownA }),
    asA: ok,
    asAdmin: ok,
  },
  {
    path: "classes:update",
    args: (w) => ({ classId: w.classA.classId, name: "Renamed", status: "closed" }),
    asA: ok,
    asAdmin: ok,
  },
  {
    path: "classes:update",
    label: "classes:update moving B's own class onto A's version",
    args: (w) => ({ classId: w.classB.classId, versionId: w.ownA }),
    // Only B's call is the point here; A doesn't own B's class.
    asA: "NOT_FOUND",
    asAdmin: ok,
  },
  {
    path: "classes:mine",
    args: () => ({}),
    asB: (r, w) => expect(ids(r, "classId")).toEqual([w.classB.classId]),
    asA: (r, w) => expect(ids(r, "classId")).toEqual([w.classA.classId]),
    asAdmin: (r, w) =>
      expect(ids(r, "classId").sort()).toEqual([w.classA.classId, w.classB.classId].sort()),
  },
  {
    path: "classes:attempts",
    args: (w) => ({ classId: w.classA.classId }),
    asA: (r, w) =>
      expect(r).toEqual([
        expect.objectContaining({ attemptId: w.ann.attemptId, status: "submitted", scaled: 100 }),
      ]),
    asAdmin: (r) => expect(r).toHaveLength(1),
  },
  {
    path: "classes:stats",
    args: (w) => ({ classId: w.classA.classId }),
    asA: (r) => expect(r).toMatchObject({ attemptCount: 1, submittedCount: 1 }),
    asAdmin: (r) => expect(r).toMatchObject({ submittedCount: 1 }),
  },
  {
    path: "classes:attemptResult",
    args: (w) => ({ attemptId: w.ann.attemptId }),
    asA: (r) => expect(r).toMatchObject({ displayName: "Ann", className: "A's class" }),
    asAdmin: (r) => expect(r).toMatchObject({ displayName: "Ann" }),
  },
  {
    path: "classes:attemptReview",
    args: (w) => ({ attemptId: w.ann.attemptId }),
    asA: (r) => expect(r).toHaveLength(90),
    asAdmin: (r) => expect(r).toHaveLength(90),
  },
  {
    path: "classes:exportCsv",
    args: (w) => ({ classId: w.classA.classId }),
    asA: (r) => expect(r).toContain("Ann"),
    asAdmin: (r) => expect(r).toContain("Ann"),
  },
  {
    path: "classes:deleteAttempts",
    args: (w) => ({ attemptIds: [w.ann.attemptId] }),
    asA: (r) => expect(r).toEqual({ deleted: 1 }),
    asAdmin: (r) => expect(r).toEqual({ deleted: 1 }),
  },
  {
    path: "classes:deleteAttempts",
    label: "classes:deleteAttempts with B's own attempt and A's together",
    args: (w) => ({ attemptIds: [w.ben.attemptId, w.ann.attemptId] }),
    asA: "NOT_FOUND",
    asAdmin: (r) => expect(r).toEqual({ deleted: 2 }),
  },

  // editor
  {
    path: "editor:myVersions",
    args: () => ({}),
    asB: (r, w) => expect(ids(r, "versionId")).toEqual([w.defaultId]),
    asA: (r, w) =>
      expect(ids(r, "versionId").sort()).toEqual([w.defaultId, w.ownA, w.draftA].sort()),
    asAdmin: (r, w) =>
      expect(ids(r, "versionId")).toEqual(expect.arrayContaining([w.ownA, w.draftA])),
  },
  {
    path: "editor:createDraft",
    args: (w) => ({ fromVersionId: w.ownA, label: "Copy" }),
    asA: ok,
    asAdmin: ok,
  },
  {
    path: "editor:getDraft",
    args: (w) => ({ versionId: w.draftA }),
    asA: (r) => expect((r as { questions: unknown[] }).questions).toHaveLength(95),
    asAdmin: ok,
  },
  {
    path: "editor:getDraft",
    label: "editor:getDraft on A's published version (keys)",
    args: (w) => ({ versionId: w.ownA }),
    asA: ok,
    asAdmin: ok,
  },
  {
    path: "editor:validate",
    args: (w) => ({ versionId: w.ownA }),
    asA: (r) =>
      expect((r as { severity: string }[]).filter((i) => i.severity === "error")).toEqual([]),
    asAdmin: ok,
  },
  {
    path: "editor:saveQuestion",
    args: (w) => ({ versionId: w.draftA, ...mcqInput }),
    asA: ok,
    asAdmin: ADMIN_ON_TUTOR_DRAFT,
  },
  {
    path: "editor:deleteQuestion",
    args: (w) => ({ versionId: w.draftA, questionId: w.mcqIds[0] }),
    asA: ok,
    asAdmin: ADMIN_ON_TUTOR_DRAFT,
  },
  {
    path: "editor:reorder",
    args: (w) => ({ versionId: w.draftA, section: "mcq", questionIds: [...w.mcqIds].reverse() }),
    asA: ok,
    asAdmin: ADMIN_ON_TUTOR_DRAFT,
  },
  {
    path: "editor:generate",
    args: (w) => ({ versionId: w.draftA, questionId: w.pbqId, seed: 7 }),
    asA: ok,
    asAdmin: ADMIN_ON_TUTOR_DRAFT,
  },
  {
    path: "editor:publish",
    args: (w) => ({ versionId: w.draftA }),
    asA: ok,
    asAdmin: ADMIN_ON_TUTOR_DRAFT,
  },
  {
    path: "editor:previewAttempt",
    args: (w) => ({ versionId: w.ownA }),
    asA: ok,
    asAdmin: ok,
  },

  // content
  {
    path: "content:oralQuestions",
    args: (w) => ({ versionId: w.ownA }),
    asA: (r) => expect(r).toMatchObject({ isDefault: false, questions: expect.any(Array) }),
    asAdmin: ok,
  },
  {
    path: "content:oralQuestions",
    label: "content:oralQuestions on A's draft",
    args: (w) => ({ versionId: w.draftA }),
    asA: ok,
    asAdmin: ok,
  },
];

const titleOf = (row: Row) => row.label ?? row.path;

async function expectOutcome(
  w: World,
  caller: Caller,
  kind: Kind,
  row: Row,
  expected: Expect,
  who: string,
) {
  const args = row.args(w);
  if (typeof expected === "string") {
    const before = await snapshot(w.t);
    expect(await refusal(call(caller, kind, row.path, args)), `${titleOf(row)} as ${who}`).toBe(
      expected,
    );
    expect(await snapshot(w.t), `${titleOf(row)} as ${who} wrote nothing`).toEqual(before);
  } else {
    expected(await call(caller, kind, row.path, args), w);
  }
}

describe("class isolation matrix (T-510, SE-2)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("SERVER_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("has a row for every tutor-facing function", () => {
    const found = tutorFunctions();
    expect(found.size).toBeGreaterThan(15);
    expect([...new Set(ROWS.map((r) => r.path))].sort()).toEqual([...found.keys()].sort());
  });

  const kinds = tutorFunctions();

  describe.each(ROWS.map((row) => [titleOf(row), row] as const))("%s", (_title, row) => {
    it("tutor B is refused (or sees none of A's records) and nothing changes", async () => {
      const w = await world();
      await expectOutcome(w, w.b.as, kinds.get(row.path)!, row, row.asB ?? "NOT_FOUND", "B");
    });

    it("tutor A gets the expected result", async () => {
      const w = await world();
      await expectOutcome(w, w.a.as, kinds.get(row.path)!, row, row.asA, "A");
    });

    it("the admin gets the expected result", async () => {
      const w = await world();
      await expectOutcome(w, w.admin.as, kinds.get(row.path)!, row, row.asAdmin, "admin");
    });
  });

  it("isolation runs both ways: A can't read B's class or attempt", async () => {
    const w = await world();
    const byClass = { classId: w.classB.classId };
    const byAttempt = { attemptId: w.ben.attemptId };
    for (const [kind, path, args] of [
      ["query", "classes:attempts", byClass],
      ["query", "classes:stats", byClass],
      ["action", "classes:exportCsv", byClass],
      ["query", "classes:attemptResult", byAttempt],
      ["query", "classes:attemptReview", byAttempt],
      ["mutation", "classes:update", { ...byClass, name: "Mine now" }],
    ] as const) {
      expect(await refusal(call(w.a.as, kind, path, args)), path).toBe("NOT_FOUND");
    }
  });

  it("A's oral questions for the default version stay readable to B (shared content)", async () => {
    const w = await world();
    const set = await w.b.as.query(api.content.oralQuestions, { versionId: w.defaultId });
    expect(set).toMatchObject({ versionId: w.defaultId, isDefault: true });
  });

  it("the public class lookup reveals only name and open status", async () => {
    const w = await world();
    expect(await w.t.query(api.classes.lookupCode, { code: w.classA.code })).toEqual({
      name: "A's class",
      open: true,
    });
  });

  it("a share link of A's student reveals nothing about the class or its tutor", async () => {
    const w = await world();
    const { publicId } = await w.t.mutation(api.shareLinks.create, w.ann);
    const anonymous = await w.t.query(api.shareLinks.view, { publicId });
    expect(anonymous).not.toBeNull();
    // Any signed-in caller (tutor B here) gets exactly what an anonymous one does.
    expect(await w.b.as.query(api.shareLinks.view, { publicId })).toEqual(anonymous);

    const json = JSON.stringify(anonymous);
    for (const secret of [
      w.classA.classId,
      w.classA.code,
      "A's class",
      "Ann",
      w.a.profileId,
      "tutor-a@example.com",
      w.ann.attemptId,
      w.ownA,
      "A's own",
    ]) {
      expect(json, secret).not.toContain(secret);
    }
    expect(json).not.toMatch(/"(classId|tutorId|versionId|displayName|className|code)"/);

    // The link is no way into A's dashboard for B.
    expect(
      await refusal(w.b.as.query(api.classes.attemptResult, { attemptId: w.ann.attemptId })),
    ).toBe("NOT_FOUND");
  });
});
