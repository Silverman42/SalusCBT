import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { ConvexError } from "convex/values";
import { describe, expect, it } from "vitest";
import {
  OPTION_IDS as SERVER_OPTION_IDS,
  VERSION_LABEL_MAX as SERVER_LABEL_MAX,
} from "../../convex/editor";
import {
  addOption,
  cloneMcqForm,
  copyActionLabel,
  defaultSource,
  editorErrorMessage,
  emptyMcqForm,
  fieldDomId,
  fieldForPath,
  fieldName,
  groupVersions,
  issueHeading,
  issueLabel,
  issuesByQuestion,
  labelError,
  latestPublishedIds,
  matchesSearch,
  mcqFormFromDoc,
  mcqPayload,
  mcqPublishHints,
  mcqSaveErrors,
  moveItem,
  OPTION_IDS,
  parseIssues,
  questionPreview,
  readOnlyReason,
  removeOption,
  sameMcqForm,
  setChooseCount,
  suggestedLabel,
  toggleCorrect,
  validationIssuesOf,
  VERSION_LABEL_MAX,
  versionStatusBadge,
  versionSubtitle,
  versionTotals,
  type DraftEntry,
  type Issue,
  type McqFormState,
  type QuestionDoc,
  type VersionSummary,
} from "../../app/lib/editor";

function version(over: Record<string, unknown> = {}): VersionSummary {
  return {
    versionId: "v1",
    examId: "e1",
    label: "Default SY0-701",
    versionNo: 1,
    status: "published",
    totalPoints: 103,
    publishedAt: 1000,
    updatedAt: 1000,
    parentVersionId: null,
    ownerId: null,
    isDefault: true,
    editable: false,
    authored: false,
    ...over,
  } as VersionSummary;
}

function mcq(over: Record<string, unknown> = {}): QuestionDoc {
  return {
    _id: "q1",
    _creationTime: 0,
    versionId: "v1",
    order: 1,
    section: "mcq",
    displayNumber: "6",
    kind: "mcq",
    domain: "1.0",
    points: 1,
    stem: "Which control type is a security guard?",
    options: [
      { id: "A", text: "Technical" },
      { id: "B", text: "Physical" },
      { id: "C", text: "Managerial" },
    ],
    chooseCount: 1,
    ...over,
  } as QuestionDoc;
}

function entry(question: QuestionDoc, correct: string[] = ["B"]): DraftEntry {
  return {
    question,
    key: {
      _id: "k1",
      _creationTime: 0,
      questionId: question._id,
      versionId: question.versionId,
      correct,
      explanation: "Guards are physical.",
    },
  } as DraftEntry;
}

function filled(over: Partial<McqFormState> = {}): McqFormState {
  return {
    domain: "4.0",
    stem: "Which TWO actions first?",
    chooseCount: 2,
    options: [
      { id: "A", text: "Disconnect" },
      { id: "B", text: "Pay" },
      { id: "C", text: "Preserve" },
      { id: "D", text: "Restore" },
    ],
    correct: ["A", "C"],
    explanation: "Contain, then preserve evidence.",
    ...over,
  };
}

describe("constants match the server", () => {
  it("uses the same option ids and label limit as convex/editor.ts", () => {
    expect(OPTION_IDS).toEqual(SERVER_OPTION_IDS);
    expect(VERSION_LABEL_MAX).toBe(SERVER_LABEL_MAX);
  });
});

describe("version status and wording", () => {
  it("labels each status", () => {
    expect(versionStatusBadge("draft")).toEqual({ label: "Draft", tone: "warn" });
    expect(versionStatusBadge("published")).toEqual({ label: "Published", tone: "ok" });
    expect(versionStatusBadge("archived")).toEqual({ label: "Archived", tone: "muted" });
  });

  it("offers Restore only for an older published version in the same line", () => {
    const v1 = version({ versionId: "v1", versionNo: 1 });
    const v2 = version({ versionId: "v2", versionNo: 2 });
    const mine = version({ versionId: "m1", versionNo: 1, ownerId: "p1", isDefault: false });
    const draft = version({ versionId: "d1", versionNo: 3, status: "draft", publishedAt: null });
    const latest = latestPublishedIds([v1, v2, mine, draft]);
    expect([...latest].sort()).toEqual(["m1", "v2"]);
    expect(copyActionLabel(v1, latest)).toBe("Restore");
    expect(copyActionLabel(v2, latest)).toBe("New draft from this");
    expect(copyActionLabel(mine, latest)).toBe("New draft from this");
    expect(copyActionLabel(draft, latest)).toBe("New draft from this");
  });

  it("describes a draft and where it came from", () => {
    const parent = version();
    const draft = version({
      versionId: "d1",
      label: "Evening cohort",
      versionNo: 3,
      status: "draft",
      parentVersionId: "v1",
      ownerId: "p1",
      isDefault: false,
    });
    expect(versionSubtitle(draft, [parent, draft])).toBe(
      "v3 · draft · copied from Default SY0-701 v1",
    );
    expect(versionSubtitle(parent, [parent])).toBe("v1 · published · default exam");
  });

  it("groups drafts, published and archived, newest first", () => {
    const a = version({ versionId: "a", status: "draft", updatedAt: 1 });
    const b = version({ versionId: "b", status: "draft", updatedAt: 5 });
    const c = version({ versionId: "c", publishedAt: 2 });
    const d = version({ versionId: "d", publishedAt: 9 });
    const e = version({ versionId: "e", status: "archived" });
    const groups = groupVersions([a, b, c, d, e]);
    expect(groups.drafts.map((v) => v.versionId)).toEqual(["b", "a"]);
    expect(groups.published.map((v) => v.versionId)).toEqual(["d", "c"]);
    expect(groups.archived.map((v) => v.versionId)).toEqual(["e"]);
  });

  it("starts a new draft from the newest default version", () => {
    const mine = version({ versionId: "m", isDefault: false, ownerId: "p", publishedAt: 50 });
    const def = version({ versionId: "d", publishedAt: 10 });
    expect(defaultSource([mine, def])?.versionId).toBe("d");
    expect(defaultSource([mine])?.versionId).toBe("m");
    expect(defaultSource([])).toBeNull();
  });

  it("suggests and checks draft names", () => {
    expect(suggestedLabel({ label: "Default" })).toBe("Copy of Default");
    expect(suggestedLabel({ label: "x".repeat(100) })).toHaveLength(VERSION_LABEL_MAX);
    expect(labelError("  ")).toMatch(/name/);
    expect(labelError("x".repeat(81))).toMatch(/80/);
    expect(labelError(" Evening ")).toBeNull();
  });

  it("explains why a version is read-only", () => {
    expect(readOnlyReason(version({ status: "draft", editable: true }))).toBeNull();
    expect(readOnlyReason(version({ status: "draft" }))).toMatch(/owns this draft/);
    expect(readOnlyReason(version())).toMatch(/published.*Create a draft/);
  });
});

describe("question list", () => {
  it("previews the stem, a PBQ template, or a placeholder", () => {
    expect(questionPreview(mcq({ stem: "a  b\n c" }))).toBe("a b c");
    expect(questionPreview(mcq({ stem: "x".repeat(100) }), 10)).toBe("xxxxxxxxx…");
    expect(questionPreview(mcq({ stem: "", kind: "pbq", template: "nmap" }))).toBe("Nmap scan");
    expect(questionPreview(mcq({ stem: " " }))).toBe("(no question text yet)");
  });

  it("searches number, stem and options", () => {
    const e = entry(mcq());
    expect(matchesSearch(e, "")).toBe(true);
    expect(matchesSearch(e, "Q6")).toBe(true);
    expect(matchesSearch(e, "guard")).toBe(true);
    expect(matchesSearch(e, "physical")).toBe(true);
    expect(matchesSearch(e, "firewall")).toBe(false);
  });

  it("moves an item up or down, refusing the ends", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
    expect(moveItem(["a", "b", "c"], 0, -1)).toBeNull();
    expect(moveItem(["a", "b", "c"], 2, 1)).toBeNull();
  });

  it("totals points and counts per section", () => {
    const list = [
      entry(mcq({ _id: "1" })),
      entry(mcq({ _id: "2", section: "pbqA", kind: "pbq", points: 4 })),
      entry(mcq({ _id: "3", section: "pbqB", kind: "pbq", points: 3 })),
    ];
    expect(versionTotals(list)).toEqual({ points: 8, pbqA: 1, pbqB: 1, mcq: 1 });
  });

  it("marks each question with its worst issue and words the panel", () => {
    const issues = [
      {
        severity: "warning",
        rule: "explanation",
        questionId: "q1",
        displayNumber: "87",
        message: "w",
      },
      {
        severity: "error",
        rule: "mcq.chooseCount",
        questionId: "q1",
        displayNumber: "87",
        message: "Choose TWO needs two",
      },
      {
        severity: "warning",
        rule: "domains.spread",
        questionId: null,
        displayNumber: null,
        message: "Domain spread",
      },
    ] as Issue[];
    const map = issuesByQuestion(issues);
    expect(map.get("q1")).toBe("error");
    expect(map.size).toBe(1);
    expect(issueHeading(issues)).toBe("1 issue before publishing");
    expect(issueHeading(issues.slice(2))).toBe("Ready to publish · 1 warning");
    expect(issueHeading([])).toBe("Ready to publish");
    expect(issueLabel(issues[1]!)).toBe("Q87 · Choose TWO needs two");
    expect(issueLabel(issues[2]!)).toBe("Version · Domain spread");
  });
});

describe("MCQ form ↔ payload", () => {
  it("round-trips a stored question", () => {
    const e = entry(mcq(), ["B"]);
    const form = mcqFormFromDoc(e.question, e.key);
    expect(form).toEqual({
      domain: "1.0",
      stem: "Which control type is a security guard?",
      chooseCount: 1,
      options: [
        { id: "A", text: "Technical" },
        { id: "B", text: "Physical" },
        { id: "C", text: "Managerial" },
      ],
      correct: ["B"],
      explanation: "Guards are physical.",
    });
    expect(mcqPayload({ ...form, domain: "1.0" })).toEqual({
      question: {
        kind: "mcq",
        section: "mcq",
        domain: "1.0",
        stem: "Which control type is a security guard?",
        options: form.options,
        chooseCount: 1,
      },
      key: { correct: ["B"], explanation: "Guards are physical." },
    });
  });

  it("drops key ids that aren't options and handles a missing key", () => {
    const form = mcqFormFromDoc(mcq({ chooseCount: 2 }), {
      ...entry(mcq()).key!,
      correct: ["C", "Z", "A", "A"],
    });
    expect(form.correct).toEqual(["A", "C"]);
    expect(form.chooseCount).toBe(2);
    expect(mcqFormFromDoc(mcq(), null)).toMatchObject({ correct: [], explanation: "" });
  });

  it("starts empty with four lettered options", () => {
    const form = emptyMcqForm();
    expect(form.options.map((o) => o.id)).toEqual(["A", "B", "C", "D"]);
    expect(form).toMatchObject({ domain: "", chooseCount: 1, correct: [] });
  });

  it("adds options up to F and removes down to two, relettering the rest", () => {
    let form = filled();
    form = addOption(addOption(form));
    expect(form.options.map((o) => o.id)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(addOption(form)).toBe(form);
    form = removeOption(filled(), 1); // remove B; C (ticked) becomes B
    expect(form.options).toEqual([
      { id: "A", text: "Disconnect" },
      { id: "B", text: "Preserve" },
      { id: "C", text: "Restore" },
    ]);
    expect(form.correct).toEqual(["A", "B"]);
    const two = filled({ options: filled().options.slice(0, 2), correct: ["A"] });
    expect(removeOption(two, 0)).toBe(two);
  });

  it("ticks like a radio for Choose ONE and keeps the newest two for Choose TWO", () => {
    const one = filled({ chooseCount: 1, correct: ["A"] });
    expect(toggleCorrect(one, "C").correct).toEqual(["C"]);
    expect(toggleCorrect(one, "A").correct).toEqual([]);
    const two = filled({ correct: ["A", "C"] });
    expect(toggleCorrect(two, "D").correct).toEqual(["C", "D"]);
    expect(toggleCorrect(two, "C").correct).toEqual(["A"]);
    expect(toggleCorrect(filled({ correct: ["C"] }), "A").correct).toEqual(["A", "C"]);
  });

  it("trims ticks when switching to Choose ONE", () => {
    expect(setChooseCount(filled(), 1)).toMatchObject({ chooseCount: 1, correct: ["A"] });
    expect(setChooseCount(filled({ chooseCount: 1, correct: ["B"] }), 2).correct).toEqual(["B"]);
  });

  it("compares and copies forms", () => {
    const a = filled();
    const b = cloneMcqForm(a);
    expect(b).not.toBe(a);
    expect(b.options[0]).not.toBe(a.options[0]);
    expect(sameMcqForm(a, b)).toBe(true);
    b.options[0]!.text = "x";
    expect(sameMcqForm(a, b)).toBe(false);
  });
});

describe("form checks", () => {
  it("blocks a save without a domain, text or option text", () => {
    expect(mcqSaveErrors(filled())).toEqual([]);
    const errors = mcqSaveErrors(
      filled({
        domain: "",
        stem: " ",
        options: [
          { id: "A", text: "" },
          { id: "B", text: "ok" },
        ],
      }),
    );
    expect(errors.map((e) => e.field)).toEqual(["domain", "stem", "option:0"]);
  });

  it("hints at publish-time gaps without blocking the save", () => {
    expect(mcqPublishHints(filled())).toEqual([]);
    const hints = mcqPublishHints(filled({ correct: ["A"], explanation: "" }));
    expect(hints).toEqual([
      { field: "correct", message: "Choose TWO needs exactly two correct answers (1 ticked)." },
      { field: "explanation", message: "Required before publishing." },
    ]);
    expect(mcqPublishHints(filled({ chooseCount: 1, correct: [] }))[0]?.message).toBe(
      "Choose ONE needs one correct answer (0 ticked).",
    );
  });
});

describe("server issues → fields", () => {
  it("maps issue paths to form fields", () => {
    expect(fieldForPath("question.options[1].id")).toBe("option:1");
    expect(fieldForPath("question.options[3].text")).toBe("option:3");
    expect(fieldForPath("question.options")).toBe("options");
    expect(fieldForPath("question.stem")).toBe("stem");
    expect(fieldForPath("question.chooseCount")).toBe("chooseCount");
    expect(fieldForPath("key.correct[0]")).toBe("correct");
    expect(fieldForPath("key.explanation")).toBe("explanation");
    expect(fieldForPath("key.parts")).toBeNull();
    expect(fieldForPath("version")).toBeNull();
  });

  it("parses issue strings into field messages", () => {
    expect(
      parseIssues([
        'question.options[1].id: duplicate option id "A"',
        "question.stem: must not be blank",
        "key.parts: an MCQ key has no parts",
        "no colon here",
      ]),
    ).toEqual([
      { field: "option:1", message: 'Duplicate option id "A".' },
      { field: "stem", message: "Must not be blank." },
      { field: null, message: "Key.parts: an MCQ key has no parts." },
      { field: null, message: "No colon here." },
    ]);
  });

  it("names fields for the error summary and gives them DOM ids", () => {
    expect(fieldName("option:2", filled())).toBe("Option C");
    expect(fieldName("option:4")).toBe("Option E");
    expect(fieldName("stem")).toBe("Question text");
    expect(fieldDomId("f1", "option:2")).toBe("f1-option-2");
    expect(fieldDomId("f1", "domain")).toBe("f1-domain");
  });

  it("reads the issues of a VALIDATION_FAILED error only", () => {
    const err = new ConvexError({ code: "VALIDATION_FAILED", issues: ["question.stem: x", 3] });
    expect(validationIssuesOf(err)).toEqual(["question.stem: x"]);
    expect(validationIssuesOf(new ConvexError({ code: "NOT_FOUND" }))).toBeNull();
    expect(validationIssuesOf(new Error("boom"))).toBeNull();
  });

  it("words editor errors", () => {
    const frozen = new ConvexError({
      code: "VALIDATION_FAILED",
      issues: ["version: a published version can't be changed; create a draft from it"],
    });
    expect(editorErrorMessage(frozen, "save")).toMatch(/can't be changed/);
    expect(
      editorErrorMessage(
        new ConvexError({ code: "VALIDATION_FAILED", issues: ["version: no PBQ set B"] }),
        "publish",
      ),
    ).toMatch(/Fix the issues/);
    expect(editorErrorMessage(new ConvexError({ code: "NOT_FOUND" }), "load")).toMatch(
      /couldn't find that version/,
    );
    expect(editorErrorMessage(new ConvexError("UNAUTHENTICATED"), "save")).toMatch(/Sign in/);
    expect(editorErrorMessage(new Error("Value does not match validator"), "load")).toMatch(
      /Check the link/,
    );
    expect(editorErrorMessage(new Error("offline"), "reorder")).toMatch(/connection/);
  });
});

describe("tutor text is plain text", () => {
  function files(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  }

  it("editor pages and components never render HTML", () => {
    const root = join(__dirname, "../../app");
    const sources = [
      ...files(join(root, "components/editor")),
      ...files(join(root, "pages/tutor/versions")),
    ].filter((p) => p.endsWith(".vue"));
    expect(sources.length).toBeGreaterThan(0);
    for (const path of sources) {
      const text = readFileSync(path, "utf8");
      expect(text, path).not.toMatch(/v-html|innerHTML/);
    }
  });
});
