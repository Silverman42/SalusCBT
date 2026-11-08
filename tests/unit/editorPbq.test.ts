import { describe, expect, it } from "vitest";
import { checkQuestion, pbqPoints } from "../../convex/editor";
import { generate } from "../../convex/generators";
import type { PbqTemplate } from "../../shared/content";
import { ConvexError } from "convex/values";
import { editorErrorMessage, type KeyDoc, type QuestionDoc } from "../../app/lib/editor";
import {
  addPart,
  addPartOption,
  addRule,
  clonePbqForm,
  describedByOf,
  issueOf,
  lines,
  nextPartId,
  parsePbqIssues,
  pbqDomId,
  pbqFieldForPath,
  pbqFieldName,
  pbqFormFromDoc,
  pbqFormKey,
  pbqFormPayload,
  pbqFormPoints,
  pbqPreviewQuestion,
  pbqPublishHints,
  pbqSaveArgs,
  pbqSaveErrors,
  removePart,
  removePartOption,
  removeRule,
  samePbqForm,
  setPartKind,
  type PbqFormState,
} from "../../app/lib/editorPbq";

const TEMPLATES: PbqTemplate[] = ["sshLog", "nmap", "hashCheck", "permissions", "firewall"];

function docs(template: PbqTemplate, seed = 7, set: "A" | "B" = "A") {
  const g = generate(template, seed, { set });
  const question = {
    _id: `q-${template}`,
    _creationTime: 0,
    versionId: "v1",
    order: 1,
    displayNumber: set === "B" ? "B1" : "1",
    section: set === "B" ? "pbqB" : "pbqA",
    kind: "pbq",
    domain: "4.0",
    points: g.points,
    stem: `Investigate the ${template} evidence.`,
    template,
    payload: g.payload,
  } as unknown as QuestionDoc;
  const key = {
    _id: "k1",
    _creationTime: 0,
    versionId: "v1",
    questionId: question._id,
    parts: g.key,
    explanation: g.explanation,
  } as unknown as KeyDoc;
  return { g, question, key };
}

/** An nmap form with a portPair part (the mail-server scenario). */
function nmapWithPair() {
  for (let seed = 1; seed < 200; seed++) {
    const f = formFor("nmap", seed);
    if (f.form.parts.some((p) => p.kind === "portPair")) return f;
  }
  throw new Error("no portPair scenario");
}

function formFor(template: PbqTemplate, seed = 7, set: "A" | "B" = "A") {
  const d = docs(template, seed, set);
  return { ...d, form: pbqFormFromDoc(d.question, d.key) };
}

describe("PBQ form ↔ payload and key", () => {
  for (const template of TEMPLATES) {
    for (const set of ["A", "B"] as const) {
      it(`${template} set ${set}: round-trips a generated question unchanged`, () => {
        const { g, form } = formFor(template, 11, set);
        expect(form.template).toBe(template);
        expect(form.section).toBe(set === "B" ? "pbqB" : "pbqA");
        expect(form.domain).toBe("4.0");
        expect(form.explanation).toBe(g.explanation);
        expect(pbqFormPayload(form)).toEqual(g.payload);
        expect(pbqFormKey(form)).toEqual(g.key);
        expect(pbqFormPoints(form)).toBe(g.points);
        expect(pbqFormPoints(form)).toBe(pbqPoints(g.payload));
      });
    }

    it(`${template}: a generated form has no save errors and the server accepts it`, () => {
      const { form } = formFor(template, 3);
      expect(pbqSaveErrors(form)).toEqual([]);
      const args = pbqSaveArgs(form as PbqFormState & { domain: "4.0" });
      expect(args.question).toMatchObject({ kind: "pbq", section: "pbqA", template });
      const checked = checkQuestion(args.question, args.key);
      expect(checked.ok).toBe(true);
    });

    it(`${template}: gives the student-view paper question`, () => {
      const { form, question, g } = formFor(template, 5);
      const paper = pbqPreviewQuestion(form, { question });
      expect(paper).toMatchObject({
        questionId: question._id,
        kind: "pbq",
        displayNumber: "1",
        points: g.points,
        payload: g.payload,
      });
    });
  }

  it("keeps the template's artefacts and fills nothing else", () => {
    const { form } = formFor("hashCheck");
    expect(form.artefacts.vendorHashes).toMatch(/vendor_hashes/);
    expect(form.artefacts.computed).toMatch(/sha256sum/);
    expect(form.artefacts.log).toBe("");
    const fw = formFor("firewall").form;
    expect(fw.parts).toEqual([]);
    expect(fw.rules.length).toBeGreaterThan(0);
    expect(fw.rules.every((r) => r.port !== "" && r.action !== "")).toBe(true);
    expect(lines(fw.portChoices).length).toBeGreaterThan(0);
  });

  it("puts practice answers in `practice` and leaves blank answers out", () => {
    const { form } = formFor("sshLog");
    const practice = form.parts.find((p) => !p.scored)!;
    expect(practice.answer).not.toBe("");
    const key = pbqFormKey(form);
    expect("parts" in key && key.practice?.[practice.id]).toBe(practice.answer);
    form.parts[0]!.answer = "  ";
    const blank = pbqFormKey(form);
    expect("parts" in blank && form.parts[0]!.id in blank.parts).toBe(false);
  });

  it("keys a portPair as two trimmed ports", () => {
    const { form } = nmapWithPair();
    const i = form.parts.findIndex((p) => p.kind === "portPair");
    form.parts[i]!.answer = " 23 ";
    form.parts[i]!.answer2 = "22";
    const key = pbqFormKey(form);
    expect("parts" in key && key.parts[form.parts[i]!.id]).toEqual(["23", "22"]);
  });

  it("reads a missing key and payload as an empty form", () => {
    const { question } = docs("sshLog");
    const bare = pbqFormFromDoc({ ...question, payload: undefined } as QuestionDoc, null);
    expect(bare.parts).toEqual([]);
    expect(bare.explanation).toBe("");
    expect(pbqPreviewQuestion(bare, { question })).toBeNull();
  });

  it("clones deeply and compares by value", () => {
    const { form } = formFor("firewall");
    const copy = clonePbqForm(form);
    expect(samePbqForm(copy, form)).toBe(true);
    copy.rules[0]!.port = "x";
    expect(samePbqForm(copy, form)).toBe(false);
    expect(form.rules[0]!.port).not.toBe("x");
  });
});

describe("PBQ live save checks", () => {
  it("reports blank question text, domain, prompt and answer in plain words", () => {
    const { form } = formFor("sshLog");
    form.stem = " ";
    form.domain = "";
    form.parts[1]!.prompt = "";
    form.parts[0]!.answer = "";
    const errors = pbqSaveErrors(form);
    expect(issueOf(errors, "stem")).toBe("Enter the question text.");
    expect(issueOf(errors, "domain")).toBe("Choose a domain.");
    expect(issueOf(errors, "part:1:prompt")).toBe("Enter the prompt.");
    expect(issueOf(errors, "part:0:answer")).toBe("Enter the correct answer.");
  });

  it("catches duplicate part ids and a pick answer that isn't a choice", () => {
    const { form } = formFor("hashCheck");
    form.parts[1]!.id = form.parts[0]!.id;
    form.parts[0]!.answer = "not-a-file.bin";
    const errors = pbqSaveErrors(form);
    expect(issueOf(errors, "part:1:id")).toMatch(/used twice/);
    expect(issueOf(errors, "part:0:answer")).toMatch(/one of the choices/);
  });

  it("needs a scored part for sshLog and permissions", () => {
    const { form } = formFor("permissions");
    for (const p of form.parts) p.scored = false;
    expect(issueOf(pbqSaveErrors(form), "parts")).toMatch(/scored/);
  });

  it("checks firewall keys against the choice lists", () => {
    const { form } = formFor("firewall");
    form.rules[0]!.port = "99999";
    form.actionChoices = ["ALLOW"];
    form.rules[1]!.action = "DENY";
    form.requirements = "\n  \n";
    const errors = pbqSaveErrors(form);
    expect(issueOf(errors, "rule:0:port")).toMatch(/port choices/);
    expect(issueOf(errors, "rule:1:action")).toMatch(/action choices/);
    expect(issueOf(errors, "requirements")).toMatch(/at least one/);
  });

  it("asks for the artefact text and MCQ part answers", () => {
    const { form } = formFor("hashCheck");
    form.artefacts.computed = "";
    const mcq = form.parts.findIndex((p) => p.kind === "mcq");
    form.parts[mcq]!.answer = "";
    form.parts[mcq]!.options[1]!.text = "";
    const errors = pbqSaveErrors(form);
    expect(issueOf(errors, "artefact:computed")).toBe("Enter the computed hashes.");
    expect(issueOf(errors, `part:${mcq}:answer`)).toBe("Tick the correct option.");
    expect(issueOf(errors, `part:${mcq}:option:1`)).toMatch(/option B/);
  });

  it("only one issue per field", () => {
    const { form } = formFor("nmap");
    form.parts[0]!.id = "";
    const errors = pbqSaveErrors(form);
    const fields = errors.map((e) => e.field).filter(Boolean);
    expect(new Set(fields).size).toBe(fields.length);
  });

  it("hints that the explanation is needed before publishing", () => {
    const { form } = formFor("nmap");
    expect(pbqPublishHints(form)).toEqual([]);
    form.explanation = "";
    expect(issueOf(pbqPublishHints(form), "explanation")).toMatch(/before publishing/);
  });
});

describe("PBQ issue paths → fields", () => {
  const { form } = formFor("sshLog", 7, "B");
  const ids = form.parts.map((p) => p.id);

  it("maps question-level and payload paths", () => {
    expect(pbqFieldForPath("question.stem", form)).toBe("stem");
    expect(pbqFieldForPath("question.domain", form)).toBe("domain");
    expect(pbqFieldForPath("key.explanation", form)).toBe("explanation");
    expect(pbqFieldForPath("question.payload.intro", form)).toBe("intro");
    expect(pbqFieldForPath("question.payload.log", form)).toBe("artefact:log");
    expect(pbqFieldForPath("question.payload.vendorHashes", form)).toBe("artefact:vendorHashes");
    expect(pbqFieldForPath("question.payload.parts", form)).toBe("parts");
    expect(pbqFieldForPath("question.payload.parts[2]", form)).toBe("part:2:id");
    expect(pbqFieldForPath("question.payload.parts[1].prompt", form)).toBe("part:1:prompt");
    expect(pbqFieldForPath("question.payload.parts[1].scored", form)).toBe("part:1:kind");
    expect(pbqFieldForPath("question.payload.parts[0].choices[3]", form)).toBe("part:0:choices");
    expect(pbqFieldForPath("question.payload.parts[0].options", form)).toBe("part:0:options");
    expect(pbqFieldForPath("question.payload.parts[0].options[2].text", form)).toBe(
      "part:0:option:2",
    );
    expect(pbqFieldForPath("question.payload.requirements[0]", form)).toBe("requirements");
    expect(pbqFieldForPath("question.payload.portChoices[1]", form)).toBe("portChoices");
    expect(pbqFieldForPath("question.payload.actionChoices", form)).toBe("actionChoices");
    expect(pbqFieldForPath("question.payload.rules", form)).toBe("rules");
    expect(pbqFieldForPath("question.payload.rules[1].destination", form)).toBe(
      "rule:1:destination",
    );
    expect(pbqFieldForPath("question.payload", form)).toBeNull();
    expect(pbqFieldForPath("question.payload.template", form)).toBeNull();
  });

  it("maps key paths by part id (set B ids too)", () => {
    expect(ids[1]).toBe("B1b");
    expect(pbqFieldForPath("key.parts.parts.B1b", form)).toBe("part:1:answer");
    expect(pbqFieldForPath(`key.parts.practice.${ids[3]}`, form)).toBe("part:3:answer");
    expect(pbqFieldForPath("key.parts.parts.9z", form)).toBe("parts");
    expect(pbqFieldForPath("key.parts", form)).toBe("parts");
    expect(pbqFieldForPath("key.parts.rules", form)).toBe("rules");
    expect(pbqFieldForPath("key.parts.rules[2].port", form)).toBe("rule:2:port");
    expect(pbqFieldForPath("key.parts.rules[0].action", form)).toBe("rule:0:action");
    expect(pbqFieldForPath("version", form)).toBeNull();
  });

  it("maps a set A key path", () => {
    const a = formFor("nmap").form;
    expect(pbqFieldForPath("key.parts.parts.2b", a)).toBe("part:1:answer");
  });

  it("parses server issue strings", () => {
    const parsed = parsePbqIssues(
      [
        "key.parts.parts.B1b: scored part has no key",
        "question.payload.log: expected string, got number",
        "version: a published version can't be changed",
        "no colon here",
      ],
      form,
    );
    expect(parsed).toEqual([
      { field: "part:1:answer", message: "Scored part has no key." },
      { field: "artefact:log", message: "Expected string, got number." },
      { field: null, message: "Version: a published version can't be changed." },
      { field: null, message: "No colon here." },
    ]);
  });

  it("names fields for the error summary", () => {
    expect(pbqFieldName("part:1:answer", form)).toBe("Part B1b answer");
    expect(pbqFieldName("part:0:option:1", form)).toBe("Part B1a option B");
    expect(pbqFieldName("rule:2:port")).toBe("Rule 3 port");
    expect(pbqFieldName("artefact:sshdConfig")).toBe("sshd_config");
    expect(pbqFieldName("portChoices")).toBe("Port choices");
  });

  it("builds DOM ids and aria-describedby", () => {
    expect(pbqDomId("v-1", "part:0:option:2")).toBe("v-1-part-0-option-2");
    const errors = [{ field: "stem" as const, message: "x" }];
    const hints = [{ field: "explanation" as const, message: "y" }];
    expect(describedByOf("p", "stem", errors, hints)).toBe("p-stem-error");
    expect(describedByOf("p", "explanation", errors, hints)).toBe("p-explanation-hint");
    expect(describedByOf("p", "intro", errors, hints)).toBeUndefined();
  });
});

describe("PBQ form list edits", () => {
  it("suggests the next part id", () => {
    expect(nextPartId([{ id: "1a" }, { id: "1b" }])).toBe("1c");
    expect(nextPartId([{ id: "B5c" }])).toBe("B5d");
    expect(nextPartId([{ id: "odd" }])).toBe("p2");
    expect(nextPartId([])).toBe("p1");
  });

  it("adds and removes parts, never below one", () => {
    const { form } = formFor("nmap");
    const added = addPart(form);
    expect(added.parts).toHaveLength(form.parts.length + 1);
    expect(added.parts.at(-1)).toMatchObject({ id: "2d", kind: "port", answer: "" });
    let one = form;
    while (one.parts.length > 1) one = removePart(one, 0);
    expect(removePart(one, 0)).toBe(one);
    expect(addPart(formFor("firewall").form).parts).toEqual([]);
  });

  it("changes a part kind and keeps what fits", () => {
    const { form } = formFor("hashCheck");
    const pick = form.parts.find((p) => p.kind === "pick")!;
    const mcq = setPartKind(pick, "mcq");
    expect(mcq.options).toHaveLength(4);
    expect(mcq.answer).toBe("");
    const nmap = nmapWithPair().form.parts.find((p) => p.kind === "portPair")!;
    expect(setPartKind(nmap, "port").answer2).toBe("");
    const practice = { ...formFor("sshLog").form.parts[3]!, scored: false };
    expect(setPartKind(practice, "port").scored).toBe(true);
  });

  it("relabels MCQ part options and keeps the answer on its text", () => {
    const { form } = formFor("hashCheck");
    const part = form.parts.find((p) => p.kind === "mcq")!;
    const withC = { ...part, options: part.options.slice(0, 3), answer: "C" };
    const removed = removePartOption(withC, 0);
    expect(removed.options.map((o) => o.id)).toEqual(["A", "B"]);
    expect(removed.answer).toBe("B");
    expect(removed.options[1]!.text).toBe(withC.options[2]!.text);
    expect(removePartOption(removed, 0)).toBe(removed);
    expect(addPartOption(removed).options.map((o) => o.id)).toEqual(["A", "B", "C"]);
  });

  it("adds firewall rules before a final Any rule", () => {
    const { form } = formFor("firewall");
    const last = form.rules.at(-1)!;
    expect(last.source).toMatch(/^any$/i);
    const added = addRule(form);
    expect(added.rules).toHaveLength(form.rules.length + 1);
    expect(added.rules.at(-1)).toEqual(last);
    expect(added.rules.at(-2)).toMatchObject({ source: "", protocol: "TCP", port: "" });
    expect(removeRule(added, added.rules.length - 2).rules).toEqual(form.rules);
  });
});

describe("generate errors", () => {
  const bad = (issue: string) => new ConvexError({ code: "VALIDATION_FAILED", issues: [issue] });

  it("explains a bad seed and a non-PBQ", () => {
    expect(editorErrorMessage(bad("seed: must be an integer"), "generate")).toMatch(
      /0 to 4294967295/,
    );
    expect(editorErrorMessage(bad("question: only a PBQ can be generated"), "generate")).toMatch(
      /Only a PBQ/,
    );
  });
});
