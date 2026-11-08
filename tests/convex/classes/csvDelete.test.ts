// T-503: classes.exportCsv / classes.deleteAttempts (LLD §5.2; CL-8, CL-11, PR-5).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import { MAX_DELETE_ATTEMPTS } from "../../../convex/lib/attemptDeletion";
import { csvCell, CSV_BOM, CSV_HEADER, toCsv } from "../../../convex/lib/classCsv";
import { errorCodeOf } from "../../../convex/lib/errors";
import { seedSignedIn, seedVersion, setup, type T } from "../lib/fixtures";

const NOW = new Date("2026-11-08T10:00:00Z").getTime();

async function codeOf(p: Promise<unknown>): Promise<string | null> {
  const err = await p.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err).not.toBeNull();
  return errorCodeOf(err);
}

/** Minimal RFC 4180 parser, to check the export round-trips. */
function parseCsv(text: string): string[][] {
  expect(text.startsWith(CSV_BOM)).toBe(true);
  const s = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(cell);
      cell = "";
    } else if (c === "\r" && s[i + 1] === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      i++;
    } else cell += c;
  }
  expect(cell).toBe("");
  expect(row).toEqual([]);
  return rows;
}

const RESULT: NonNullable<Doc<"attempts">["result"]> = {
  points: 80,
  totalPoints: 102,
  scaled: 800,
  passed: true,
  comfortable: true,
  domains: [
    { domain: "1.0", points: 9, max: 12 },
    { domain: "2.0", points: 20, max: 22 },
    { domain: "3.0", points: 15, max: 18 },
    { domain: "4.0", points: 26, max: 28 },
    { domain: "5.0", points: 10, max: 22 },
  ],
  flaggedCount: 2,
  timeUsedSec: 3030,
};

async function world() {
  const t = setup();
  const versionId = await seedVersion(t);
  const tutorA = await seedSignedIn(t, { label: "a", role: "tutor" });
  const tutorB = await seedSignedIn(t, { label: "b", role: "tutor" });
  const admin = await seedSignedIn(t, { label: "admin", role: "admin" });
  const { classId } = await tutorA.as.mutation(api.classes.create, { name: "A1", versionId });
  const { classId: classB } = await tutorB.as.mutation(api.classes.create, {
    name: "B1",
    versionId,
  });
  return { t, versionId, tutorA, tutorB, admin, classId, classB };
}

let n = 0;
async function seedAttempt(
  t: T,
  versionId: Id<"examVersions">,
  opts: {
    classId?: Id<"classes">;
    displayName?: string;
    submitted?: boolean;
    startedAt?: number;
    responses?: number;
    shareLink?: boolean;
    withJob?: boolean;
  } = {},
): Promise<Id<"attempts">> {
  const i = ++n;
  return await t.run(async (ctx) => {
    const startedAt = opts.startedAt ?? NOW;
    const attemptId = await ctx.db.insert("attempts", {
      anonKey: `anonkey-${i}`.padEnd(64, "0"),
      ...(opts.displayName !== undefined ? { displayName: opts.displayName } : {}),
      ...(opts.classId ? { classId: opts.classId } : {}),
      versionId,
      mode: "standard",
      status: opts.submitted ? "submitted" : "in_progress",
      startedAt,
      deadline: startedAt + 90 * 60_000,
      shuffleSeed: i,
      ipHash: `iphash-${i}`.padEnd(64, "f"),
      ...(opts.submitted
        ? { submittedAt: startedAt + 3030_000, submittedBy: "student" as const, result: RESULT }
        : {}),
    });
    if (opts.withJob) {
      const jobId = await ctx.scheduler.runAfter(60_000, internal.attempts.autoSubmit, {
        attemptId,
      });
      await ctx.db.patch("attempts", attemptId, { autoSubmitJobId: jobId });
    }
    for (let r = 0; r < (opts.responses ?? 0); r++) {
      const questionId = await ctx.db.insert("questions", {
        versionId,
        order: r,
        section: "mcq",
        displayNumber: `${i}.${r}`,
        kind: "mcq",
        domain: "1.0",
        points: 1,
        stem: "Q",
      });
      await ctx.db.insert("responses", { attemptId, questionId, flagged: false, updatedAt: NOW });
    }
    if (opts.shareLink) {
      await ctx.db.insert("shareLinks", {
        attemptId,
        publicId: `pub${i}`.padEnd(22, "x"),
        anonKey: `anonkey-${i}`.padEnd(64, "0"),
        createdAt: NOW,
      });
    }
    return attemptId;
  });
}

beforeEach(() => {
  n = 0;
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("CSV helpers", () => {
  it("escapes per RFC 4180", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell("a,b")).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell("two\nlines")).toBe('"two\nlines"');
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
    expect(csvCell(750)).toBe("750");
    expect(toCsv([["a", 1], ["b,c"]])).toBe(`${CSV_BOM}a,1\r\n"b,c"\r\n`);
  });

  it("neutralises formula injection in text cells", () => {
    expect(csvCell("=1+1")).toBe("'=1+1");
    expect(csvCell("+44 123")).toBe("'+44 123");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("\tx")).toBe("'\tx");
    expect(csvCell("\rx")).toBe('"\'\rx"');
    expect(csvCell('=HYPERLINK("http://x","y")')).toBe('"\'=HYPERLINK(""http://x"",""y"")"');
    expect(csvCell("Ann = Bob")).toBe("Ann = Bob");
  });
});

describe("classes.exportCsv (CL-8)", () => {
  it("exports a header and one row per class attempt, newest first", async () => {
    const w = await world();
    const ann = await seedAttempt(w.t, w.versionId, {
      classId: w.classId,
      displayName: 'Ann, "Annie"',
      submitted: true,
      startedAt: NOW - 60_000,
    });
    const evil = await seedAttempt(w.t, w.versionId, {
      classId: w.classId,
      displayName: "=cmd|' /C calc'!A0",
    });
    await seedAttempt(w.t, w.versionId, { classId: w.classB, displayName: "Other class" });
    await seedAttempt(w.t, w.versionId, { displayName: "Solo" });

    const csv = await w.tutorA.as.action(api.classes.exportCsv, { classId: w.classId });
    const rows = parseCsv(csv);
    expect(rows[0]).toEqual([...CSV_HEADER]);
    expect(rows).toHaveLength(3);
    for (const r of rows) expect(r).toHaveLength(CSV_HEADER.length);
    expect(rows[1]).toEqual([
      "'=cmd|' /C calc'!A0",
      "standard",
      "in_progress",
      new Date(NOW).toISOString(),
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      evil,
    ]);
    expect(rows[2]).toEqual([
      'Ann, "Annie"',
      "standard",
      "submitted",
      new Date(NOW - 60_000).toISOString(),
      new Date(NOW - 60_000 + 3030_000).toISOString(),
      "student",
      "50.5",
      "800",
      "Pass",
      "80",
      "102",
      "2",
      "75",
      "91",
      "83",
      "93",
      "45",
      ann,
    ]);
    // Nothing that identifies the student's browser.
    expect(csv).not.toMatch(/anonkey|iphash|pub\d/);
  });

  it("an empty class exports the header only", async () => {
    const w = await world();
    const csv = await w.tutorA.as.action(api.classes.exportCsv, { classId: w.classId });
    expect(parseCsv(csv)).toEqual([[...CSV_HEADER]]);
  });

  it("another tutor gets NOT_FOUND; the admin may export any class", async () => {
    const w = await world();
    await seedAttempt(w.t, w.versionId, { classId: w.classId, displayName: "Ann" });
    expect(await codeOf(w.tutorB.as.action(api.classes.exportCsv, { classId: w.classId }))).toBe(
      "NOT_FOUND",
    );
    expect(await codeOf(w.t.action(api.classes.exportCsv, { classId: w.classId }))).toBe(
      "UNAUTHENTICATED",
    );
    const csv = await w.admin.as.action(api.classes.exportCsv, { classId: w.classId });
    expect(parseCsv(csv)).toHaveLength(2);
  });
});

describe("classes.deleteAttempts (CL-11)", () => {
  const auditRows = (t: T) =>
    t.run((ctx) =>
      ctx.db
        .query("auditLog")
        .filter((q) => q.eq(q.field("action"), "attempt.deleted"))
        .collect(),
    );

  it("deletes the attempts with responses and share links, and audits the count", async () => {
    const w = await world();
    const a = await seedAttempt(w.t, w.versionId, {
      classId: w.classId,
      submitted: true,
      responses: 3,
      shareLink: true,
    });
    const b = await seedAttempt(w.t, w.versionId, {
      classId: w.classId,
      responses: 2,
      withJob: true,
    });
    const kept = await seedAttempt(w.t, w.versionId, {
      classId: w.classId,
      responses: 1,
      shareLink: true,
    });

    expect(
      await w.tutorA.as.mutation(api.classes.deleteAttempts, { attemptIds: [a, b, a] }),
    ).toEqual({ deleted: 2 });

    await w.t.run(async (ctx) => {
      expect(await ctx.db.get("attempts", a)).toBeNull();
      expect(await ctx.db.get("attempts", b)).toBeNull();
      expect(await ctx.db.get("attempts", kept)).not.toBeNull();
      const responses = await ctx.db.query("responses").collect();
      expect(responses.map((r) => r.attemptId)).toEqual([kept]);
      const links = await ctx.db.query("shareLinks").collect();
      expect(links.map((l) => l.attemptId)).toEqual([kept]);
      const jobs = await ctx.db.system.query("_scheduled_functions").collect();
      expect(jobs.find((j) => j.args[0]?.attemptId === b)?.state.kind).toBe("canceled");
    });
    const rows = await auditRows(w.t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorId: w.tutorA.profileId,
      target: w.classId,
      meta: { count: 2, classIds: [w.classId] },
    });
    const list = await w.tutorA.as.query(api.classes.attempts, { classId: w.classId });
    expect(list.map((r) => r.attemptId)).toEqual([kept]);
  });

  it("refuses the whole list if any id is another tutor's, missing or outside a class", async () => {
    const w = await world();
    const mine = await seedAttempt(w.t, w.versionId, { classId: w.classId, shareLink: true });
    const theirs = await seedAttempt(w.t, w.versionId, { classId: w.classB });
    const solo = await seedAttempt(w.t, w.versionId, {});
    const gone = await seedAttempt(w.t, w.versionId, { classId: w.classId });
    await w.t.run((ctx) => ctx.db.delete("attempts", gone));

    for (const bad of [theirs, solo, gone]) {
      expect(
        await codeOf(w.tutorA.as.mutation(api.classes.deleteAttempts, { attemptIds: [mine, bad] })),
      ).toBe("NOT_FOUND");
    }
    await w.t.run(async (ctx) => {
      expect(await ctx.db.get("attempts", mine)).not.toBeNull();
      expect(await ctx.db.get("attempts", theirs)).not.toBeNull();
      expect(await ctx.db.get("attempts", solo)).not.toBeNull();
      expect(await ctx.db.query("shareLinks").collect()).toHaveLength(1);
    });
    expect(await auditRows(w.t)).toHaveLength(0);
  });

  it("the admin may delete across classes; limits and roles are enforced", async () => {
    const w = await world();
    const a = await seedAttempt(w.t, w.versionId, { classId: w.classId });
    const b = await seedAttempt(w.t, w.versionId, { classId: w.classB });
    expect(await codeOf(w.t.mutation(api.classes.deleteAttempts, { attemptIds: [a] }))).toBe(
      "UNAUTHENTICATED",
    );
    const tooMany = Array.from({ length: MAX_DELETE_ATTEMPTS + 1 }, () => a);
    // Duplicates count once, so this is just `a`, not over the limit.
    expect(await w.tutorA.as.mutation(api.classes.deleteAttempts, { attemptIds: tooMany })).toEqual(
      { deleted: 1 },
    );

    const ids: Id<"attempts">[] = [];
    for (let i = 0; i <= MAX_DELETE_ATTEMPTS; i++) {
      ids.push(await seedAttempt(w.t, w.versionId, { classId: w.classId }));
    }
    expect(
      await codeOf(w.tutorA.as.mutation(api.classes.deleteAttempts, { attemptIds: ids })),
    ).toBe("VALIDATION_FAILED");

    expect(await w.admin.as.mutation(api.classes.deleteAttempts, { attemptIds: [b] })).toEqual({
      deleted: 1,
    });
    const rows = await auditRows(w.t);
    expect(rows.at(-1)).toMatchObject({ actorId: w.admin.profileId, meta: { count: 1 } });
    expect(await w.tutorA.as.mutation(api.classes.deleteAttempts, { attemptIds: [] })).toEqual({
      deleted: 0,
    });
    expect(await auditRows(w.t)).toHaveLength(2);
  });
});
