/**
 * T-410: every public Convex function refuses the wrong caller (PRD SE-2,
 * LLD §5.4). The table below classifies each public function as
 * `public` (anonymous by design: the exam runner, review, class lookup,
 * invite page, `me`), `tutor` or `admin`. The first test fails when a public
 * function is added or removed without updating the table, so a new tutor
 * or admin function can't ship unguarded by omission.
 *
 * Tutor and admin functions must answer, before touching their arguments:
 *   - signed out → `UNAUTHENTICATED`,
 *   - a session whose user has no profile → `FORBIDDEN`,
 *   - a removed tutor → `FORBIDDEN`,
 *   - and, for admin functions, an active tutor → `FORBIDDEN`.
 */
import { makeFunctionReference } from "convex/server";
import { describe, expect, it } from "vitest";
import { internal } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { errorCodeOf } from "../../../convex/lib/errors";
import type { SeedExam } from "../../../scripts/lib/types";
import seedJson from "../../../content/seed/sy0-701.json";
import { seedAuthSession, seedSignedIn, setup, type T } from "../lib/fixtures";

type Access = "public" | "tutor" | "admin";
type Kind = "query" | "mutation" | "action";

type Ids = {
  versionId: Id<"examVersions">;
  classId: Id<"classes">;
  attemptId: Id<"attempts">;
  questionId: Id<"questions">;
  profileId: Id<"profiles">;
  invitationId: Id<"invitations">;
};

/** Well-formed arguments, so the guard (not the validator) is what refuses. */
type Spec = { access: Access; args?: (ids: Ids) => Record<string, unknown> };

const mcq = {
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
};

const FUNCTIONS: Record<string, Spec> = {
  // Anonymous by design.
  "attempts:start": { access: "public" },
  "attempts:getPaper": { access: "public" },
  "attempts:getState": { access: "public" },
  "attempts:saveResponse": { access: "public" },
  "attempts:submit": { access: "public" },
  "review:getResult": { access: "public" },
  "review:getReview": { access: "public" },
  "review:myAttempts": { access: "public" },
  "classes:lookupCode": { access: "public" },
  "invitations:peek": { access: "public" },
  "invitations:accept": { access: "public" },
  "profiles:me": { access: "public" },
  "shareLinks:create": { access: "public" },
  "shareLinks:revoke": { access: "public" },
  "shareLinks:forAttempt": { access: "public" },
  "shareLinks:view": { access: "public" },

  // Tutor (admin passes too).
  "classes:create": {
    access: "tutor",
    args: ({ versionId }) => ({ name: "Period 3", versionId }),
  },
  "classes:update": { access: "tutor", args: ({ classId }) => ({ classId, name: "Renamed" }) },
  "classes:mine": { access: "tutor" },
  "classes:attempts": { access: "tutor", args: ({ classId }) => ({ classId }) },
  "classes:stats": { access: "tutor", args: ({ classId }) => ({ classId }) },
  "classes:attemptResult": { access: "tutor", args: ({ attemptId }) => ({ attemptId }) },
  "classes:attemptReview": { access: "tutor", args: ({ attemptId }) => ({ attemptId }) },
  "classes:exportCsv": { access: "tutor", args: ({ classId }) => ({ classId }) },
  "classes:deleteAttempts": {
    access: "tutor",
    args: ({ attemptId }) => ({ attemptIds: [attemptId] }),
  },
  "editor:myVersions": { access: "tutor" },
  "editor:createDraft": {
    access: "tutor",
    args: ({ versionId }) => ({ fromVersionId: versionId, label: "Draft" }),
  },
  "editor:getDraft": { access: "tutor", args: ({ versionId }) => ({ versionId }) },
  "editor:saveQuestion": {
    access: "tutor",
    args: ({ versionId }) => ({
      versionId,
      question: mcq,
      key: { correct: ["B"], explanation: "An IDS detects." },
    }),
  },
  "editor:deleteQuestion": {
    access: "tutor",
    args: ({ versionId, questionId }) => ({ versionId, questionId }),
  },
  "editor:reorder": {
    access: "tutor",
    args: ({ versionId, questionId }) => ({ versionId, section: "mcq", questionIds: [questionId] }),
  },
  "editor:validate": { access: "tutor", args: ({ versionId }) => ({ versionId }) },
  "editor:publish": { access: "tutor", args: ({ versionId }) => ({ versionId }) },
  "editor:generate": {
    access: "tutor",
    args: ({ versionId, questionId }) => ({ versionId, questionId, seed: 1 }),
  },
  "editor:previewAttempt": { access: "tutor", args: ({ versionId }) => ({ versionId }) },
  "content:oralQuestions": { access: "tutor", args: ({ versionId }) => ({ versionId }) },

  // Admin only.
  "admin:tutors": { access: "admin" },
  "admin:removeTutor": { access: "admin", args: ({ profileId }) => ({ profileId }) },
  "admin:restoreTutor": { access: "admin", args: ({ profileId }) => ({ profileId }) },
  "admin:audit": {
    access: "admin",
    args: () => ({ paginationOpts: { cursor: null, numItems: 10 } }),
  },
  "admin:deleteAttempts": {
    access: "admin",
    args: ({ attemptId }) => ({ attemptIds: [attemptId] }),
  },
  "invitations:create": { access: "admin", args: () => ({ email: "someone@example.com" }) },
  "invitations:list": { access: "admin" },
  "invitations:resend": { access: "admin", args: ({ invitationId }) => ({ invitationId }) },
  "invitations:cancel": { access: "admin", args: ({ invitationId }) => ({ invitationId }) },
};

type Registered = {
  isQuery?: boolean;
  isMutation?: boolean;
  isAction?: boolean;
  isPublic?: boolean;
};

/** Every public query, mutation and action exported from `convex/`, by path. */
function publicFunctions(): Map<string, Kind> {
  // Config files aren't function modules (and `convex.config.ts` imports
  // component configs that only the CLI can load).
  const modules = import.meta.glob<Record<string, unknown>>(
    ["../../../convex/**/*.ts", "!**/_generated/**", "!**/*.config.ts"],
    { eager: true },
  );
  const found = new Map<string, Kind>();
  for (const [file, exports] of Object.entries(modules)) {
    const module = file.replace(/^.*\/convex\//, "").replace(/\.ts$/, "");
    for (const [name, value] of Object.entries(exports)) {
      if (typeof value !== "function" && typeof value !== "object") continue;
      const fn = value as Registered | null;
      if (!fn?.isPublic) continue;
      const kind: Kind | null = fn.isQuery
        ? "query"
        : fn.isMutation
          ? "mutation"
          : fn.isAction
            ? "action"
            : null;
      if (kind) found.set(`${module}:${name}`, kind);
    }
  }
  return found;
}

type Caller = Pick<T, "query" | "mutation" | "action">;

async function call(caller: Caller, kind: Kind, path: string, args: Record<string, unknown>) {
  if (kind === "query") return await caller.query(makeFunctionReference<"query">(path), args);
  if (kind === "mutation") {
    return await caller.mutation(makeFunctionReference<"mutation">(path), args);
  }
  return await caller.action(makeFunctionReference<"action">(path), args);
}

async function refusal(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, "expected the call to be refused").not.toBeNull();
  return errorCodeOf(err) ?? String(err);
}

async function seedWorld(t: T) {
  const seeded = await t.mutation(internal.seed.importExam, { seed: seedJson as SeedExam });
  const owner = await seedSignedIn(t, { label: "owner", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  const ids = await t.run(async (ctx): Promise<Ids> => {
    const versionId = seeded.versionId;
    const question = await ctx.db
      .query("questions")
      .withIndex("by_version_section_order", (q) => q.eq("versionId", versionId))
      .first();
    const classId = await ctx.db.insert("classes", {
      tutorId: owner.profileId,
      name: "Period 1",
      code: "SEC-AAAA",
      versionId,
      timeMultiplier: 1,
      status: "open",
      createdAt: 0,
    });
    const attemptId = await ctx.db.insert("attempts", {
      anonKey: "k",
      versionId,
      classId,
      mode: "standard",
      status: "in_progress",
      startedAt: 0,
      deadline: 1,
      shuffleSeed: 7,
    });
    const invitationId = await ctx.db.insert("invitations", {
      email: "pending@example.com",
      tokenHash: "h",
      invitedBy: admin.profileId,
      expiresAt: Date.now() + 1_000_000,
      status: "pending",
      createdAt: 0,
    });
    return {
      versionId,
      classId,
      attemptId,
      questionId: question!._id,
      profileId: owner.profileId,
      invitationId,
    };
  });
  return { ids, owner };
}

/** A snapshot of the tables a refused call must not have touched. */
const snapshot = (t: T) =>
  t.run(async (ctx) => ({
    profiles: await ctx.db.query("profiles").collect(),
    classes: await ctx.db.query("classes").collect(),
    attempts: await ctx.db.query("attempts").collect(),
    invitations: await ctx.db.query("invitations").collect(),
    examVersions: await ctx.db.query("examVersions").collect(),
    questions: (await ctx.db.query("questions").collect()).length,
    auditLog: (await ctx.db.query("auditLog").collect()).length,
  }));

describe("access control on every public function (T-410, SE-2)", () => {
  it("classifies every public function", () => {
    const found = publicFunctions();
    expect([...found.keys()].sort()).toEqual(Object.keys(FUNCTIONS).sort());
  });

  it("refuses anonymous, profile-less and removed callers on tutor and admin functions, and tutors on admin ones", async () => {
    const t = setup();
    const { ids, owner } = await seedWorld(t);
    const removed = await seedSignedIn(t, { label: "removed", role: "tutor", status: "removed" });
    const bare = await seedAuthSession(t, "no-profile@example.com");
    const noProfile = t.withIdentity({ subject: bare.userId, sessionId: bare.sessionId });

    const kinds = publicFunctions();
    const before = await snapshot(t);
    let checked = 0;
    for (const [path, spec] of Object.entries(FUNCTIONS)) {
      if (spec.access === "public") continue;
      const kind = kinds.get(path)!;
      const args = spec.args?.(ids) ?? {};
      const label = `${path} (${spec.access})`;
      expect(await refusal(call(t, kind, path, args)), `${label}, signed out`).toBe(
        "UNAUTHENTICATED",
      );
      expect(await refusal(call(noProfile, kind, path, args)), `${label}, no profile`).toBe(
        "FORBIDDEN",
      );
      expect(await refusal(call(removed.as, kind, path, args)), `${label}, removed tutor`).toBe(
        "FORBIDDEN",
      );
      if (spec.access === "admin") {
        expect(await refusal(call(owner.as, kind, path, args)), `${label}, tutor`).toBe(
          "FORBIDDEN",
        );
      }
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
    // Nothing was written by any refused call.
    expect(await snapshot(t)).toEqual(before);
  });

  it("lets the right role through the guard", async () => {
    const t = setup();
    const { owner } = await seedWorld(t);
    const admin = await seedSignedIn(t, { label: "admin-2", role: "admin" });
    expect(await owner.as.query(makeFunctionReference<"query">("classes:mine"), {})).toHaveLength(
      1,
    );
    expect(await admin.as.query(makeFunctionReference<"query">("admin:tutors"), {})).toEqual(
      expect.arrayContaining([expect.objectContaining({ email: "owner@example.com" })]),
    );
  });
});
