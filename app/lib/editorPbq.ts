/**
 * Pure helpers for the PBQ template forms in the question editor (T-608;
 * PRD "Tutor question editor" table, ED-1, ED-2; LLD §10): one form state
 * for all five templates, its conversion to and from a stored payload and
 * answer key, the `editor.saveQuestion` arguments, live save checks (our
 * own wording first, then `shared/validate`), server issue paths such as
 * `question.payload.log` or `key.parts.parts.1b` mapped to form fields, and
 * a paper question for the live student-view preview. No Vue, no Convex
 * client.
 */
import type {
  FirewallAction,
  PartKind,
  PbqKey,
  PbqPart,
  PbqPayload,
  PbqTemplate,
} from "../../shared/content";
import { validatePayload, validatePbqKey, type ValidationIssue } from "../../shared/validate";
import type { FunctionReturnType } from "convex/server";
import type { api } from "../../convex/_generated/api";
import {
  EXPLANATION_MAX,
  OPTION_IDS,
  STEM_MAX,
  type DraftEntry,
  type KeyDoc,
  type QuestionDoc,
  type SaveQuestionArgs,
} from "./editor";
import { DOMAIN_NAMES, type Domain } from "./resultView";

export type PbqSection = "pbqA" | "pbqB";

/** A paper PBQ, as `attempts.getPaper` returns it (`AttemptPaperPbq` in useAttempt). */
export type PaperPbq = Extract<
  FunctionReturnType<typeof api.attempts.getPaper>["questions"][number],
  { kind: "pbq" }
>;

/** The payload's text artefacts (everything the student reads besides the parts). */
export type ArtefactField =
  "log" | "scan" | "vendorHashes" | "computed" | "listings" | "sshdConfig" | "diagram";

export interface ArtefactSpec {
  field: ArtefactField;
  label: string;
  hint: string;
  rows: number;
}

export const ARTEFACTS: Record<PbqTemplate, ArtefactSpec[]> = {
  sshLog: [
    {
      field: "log",
      label: "Log text",
      hint: "The auth.log lines the student reads. The answers are recomputed from it before publishing.",
      rows: 12,
    },
  ],
  nmap: [{ field: "scan", label: "Scan output", hint: "The nmap output, as text.", rows: 12 }],
  hashCheck: [
    {
      field: "vendorHashes",
      label: "Vendor hashes",
      hint: "The published hashes: one `hash  filename` per line.",
      rows: 6,
    },
    {
      field: "computed",
      label: "Computed hashes",
      hint: "The sha256sum output. Exactly one file should differ.",
      rows: 6,
    },
  ],
  permissions: [
    { field: "listings", label: "File listings", hint: "The ls -l output.", rows: 8 },
    { field: "sshdConfig", label: "sshd_config", hint: "The SSH server configuration.", rows: 8 },
  ],
  firewall: [
    {
      field: "diagram",
      label: "Network diagram",
      hint: "ASCII art; the student sees it drawn as boxes when it can be read.",
      rows: 8,
    },
  ],
};

const ALL_ARTEFACTS: ArtefactField[] = [
  "log",
  "scan",
  "vendorHashes",
  "computed",
  "listings",
  "sshdConfig",
  "diagram",
];

/** Part kinds each template's parts may use (`shared/validate` payload validators). */
export const PART_KINDS: Record<Exclude<PbqTemplate, "firewall">, PartKind[]> = {
  sshLog: ["ip", "text", "integer", "octal", "directive", "path"],
  nmap: ["port", "portPair"],
  hashCheck: ["pick", "mcq"],
  permissions: ["ip", "text", "integer", "octal", "directive", "path"],
};

export const PART_KIND_LABEL: Record<PartKind, string> = {
  ip: "IP address",
  text: "Text",
  integer: "Whole number",
  octal: "Octal mode",
  directive: "Config directive",
  path: "File path",
  port: "One port",
  portPair: "Two ports (cleartext, secure)",
  pick: "Pick from a list",
  mcq: "Multiple choice",
};

export const FIREWALL_ACTIONS: FirewallAction[] = ["ALLOW", "DENY"];
export const PROTOCOLS = ["TCP", "UDP"] as const;

/** Upper bounds that keep a form sane (not server rules). */
export const MAX_PARTS = 10;
export const MAX_RULES = 12;
export const MAX_PART_OPTIONS = OPTION_IDS.length;

export interface PartForm {
  id: string;
  prompt: string;
  kind: PartKind;
  /** Text parts only: `false` is a practice part (model answer, no marks). */
  scored: boolean;
  /** Pick parts: one choice per line. */
  choices: string;
  /** MCQ parts. */
  options: { id: string; text: string }[];
  /** The key (or a practice part's model answer); the first port of a pair. */
  answer: string;
  /** The second (secure) port of a portPair. */
  answer2: string;
}

export interface RuleForm {
  source: string;
  destination: string;
  protocol: "TCP" | "UDP";
  /** The key: one of the port choices, and an action. */
  port: string;
  action: FirewallAction | "";
}

export interface PbqFormState {
  template: PbqTemplate;
  section: PbqSection;
  domain: Domain | "";
  stem: string;
  intro: string;
  artefacts: Record<ArtefactField, string>;
  parts: PartForm[];
  /** Firewall: one requirement per line. */
  requirements: string;
  rules: RuleForm[];
  /** Firewall: one port choice per line. */
  portChoices: string;
  actionChoices: FirewallAction[];
  explanation: string;
}

// ---------------------------------------------------------------- helpers

const DOMAIN_IDS = Object.keys(DOMAIN_NAMES);

function isDomain(value: unknown): value is Domain {
  return typeof value === "string" && DOMAIN_IDS.includes(value);
}

/** Non-blank trimmed lines. */
export function lines(text: string): string[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l !== "");
}

const isTextKind = (kind: PartKind) =>
  kind === "ip" ||
  kind === "text" ||
  kind === "integer" ||
  kind === "octal" ||
  kind === "directive" ||
  kind === "path";

/** Whether a part is marked (text parts can be practice parts; every other kind is scored). */
export function isScored(part: Pick<PartForm, "kind" | "scored">): boolean {
  return isTextKind(part.kind) ? part.scored : true;
}

function emptyArtefacts(): Record<ArtefactField, string> {
  return Object.fromEntries(ALL_ARTEFACTS.map((f) => [f, ""])) as Record<ArtefactField, string>;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

// ------------------------------------------------------------ doc → form

/** A stored PBQ (and its key) as form state. */
export function pbqFormFromDoc(question: QuestionDoc, key: KeyDoc | null): PbqFormState {
  const payload = question.payload as PbqPayload | undefined;
  const template: PbqTemplate = question.template ?? payload?.template ?? "sshLog";
  const pbqKey = key?.parts as PbqKey | undefined;
  const keyParts = pbqKey && "parts" in pbqKey ? pbqKey.parts : {};
  const practice = pbqKey && "parts" in pbqKey ? (pbqKey.practice ?? {}) : {};
  const keyRules = pbqKey && "rules" in pbqKey ? pbqKey.rules : [];

  const form: PbqFormState = {
    template,
    section: question.section === "pbqB" ? "pbqB" : "pbqA",
    domain: isDomain(question.domain) ? question.domain : "",
    stem: question.stem,
    intro: asString(payload?.intro),
    artefacts: emptyArtefacts(),
    parts: [],
    requirements: "",
    rules: [],
    portChoices: "",
    actionChoices: [],
    explanation: key?.explanation ?? "",
  };
  if (!payload) return form;

  for (const spec of ARTEFACTS[template]) {
    form.artefacts[spec.field] = asString((payload as Record<string, unknown>)[spec.field]);
  }

  if (payload.template === "firewall") {
    form.requirements = payload.requirements.join("\n");
    form.portChoices = payload.portChoices.join("\n");
    form.actionChoices = [...payload.actionChoices];
    form.rules = payload.rules.map((r, i) => ({
      source: r.source,
      destination: r.destination,
      protocol: r.protocol,
      port: keyRules[i]?.port ?? "",
      action: keyRules[i]?.action ?? "",
    }));
    return form;
  }

  form.parts = (payload.parts as PbqPart[]).map((part) => {
    const answer = keyParts[part.id] ?? practice[part.id];
    const pair = Array.isArray(answer) ? answer : null;
    return {
      id: part.id,
      prompt: part.prompt,
      kind: part.kind,
      scored: "scored" in part ? part.scored : true,
      choices: part.kind === "pick" ? part.choices.join("\n") : "",
      options: part.kind === "mcq" ? part.options.map((o) => ({ id: o.id, text: o.text })) : [],
      answer: pair ? (pair[0] ?? "") : typeof answer === "string" ? answer : "",
      answer2: pair ? (pair[1] ?? "") : "",
    };
  });
  return form;
}

// ------------------------------------------------------------ form → doc

function partOf(part: PartForm): PbqPart {
  const base = { id: part.id.trim(), prompt: part.prompt };
  switch (part.kind) {
    case "port":
    case "portPair":
      return { ...base, kind: part.kind };
    case "pick":
      return { ...base, kind: "pick", choices: lines(part.choices) };
    case "mcq":
      return {
        ...base,
        kind: "mcq",
        options: part.options.map((o) => ({ id: o.id, text: o.text })),
      };
    default:
      return { ...base, kind: part.kind, scored: part.scored };
  }
}

/** The payload this form describes (not yet validated). */
export function pbqFormPayload(form: PbqFormState): PbqPayload {
  const a = form.artefacts;
  switch (form.template) {
    case "firewall":
      return {
        template: "firewall",
        intro: form.intro,
        requirements: lines(form.requirements),
        diagram: a.diagram,
        rules: form.rules.map((r) => ({
          source: r.source.trim(),
          destination: r.destination.trim(),
          protocol: r.protocol,
        })),
        portChoices: lines(form.portChoices),
        actionChoices: FIREWALL_ACTIONS.filter((x) => form.actionChoices.includes(x)),
      };
    case "sshLog":
      return {
        template: "sshLog",
        intro: form.intro,
        log: a.log,
        parts: form.parts.map(partOf) as Extract<PbqPayload, { template: "sshLog" }>["parts"],
      };
    case "nmap":
      return {
        template: "nmap",
        intro: form.intro,
        scan: a.scan,
        parts: form.parts.map(partOf) as Extract<PbqPayload, { template: "nmap" }>["parts"],
      };
    case "hashCheck":
      return {
        template: "hashCheck",
        intro: form.intro,
        vendorHashes: a.vendorHashes,
        computed: a.computed,
        parts: form.parts.map(partOf) as Extract<PbqPayload, { template: "hashCheck" }>["parts"],
      };
    case "permissions":
      return {
        template: "permissions",
        intro: form.intro,
        listings: a.listings,
        sshdConfig: a.sshdConfig,
        parts: form.parts.map(partOf) as Extract<PbqPayload, { template: "permissions" }>["parts"],
      };
  }
}

/**
 * The answer key this form describes. Blank answers are left out, so a
 * scored part without an answer is reported ("has no key") rather than
 * saved as an empty key.
 */
export function pbqFormKey(form: PbqFormState): PbqKey {
  if (form.template === "firewall") {
    return {
      rules: form.rules.map((r) => ({
        port: r.port.trim(),
        action: (r.action || "") as FirewallAction,
      })),
    };
  }
  const parts: Record<string, string | string[]> = {};
  const practice: Record<string, string> = {};
  for (const part of form.parts) {
    const id = part.id.trim();
    const answer = part.answer.trim();
    if (part.kind === "portPair") {
      const second = part.answer2.trim();
      if (answer !== "" || second !== "") parts[id] = [answer, second];
    } else if (!isScored(part)) {
      if (answer !== "") practice[id] = answer;
    } else if (answer !== "") {
      parts[id] = answer;
    }
  }
  return Object.keys(practice).length > 0 ? { parts, practice } : { parts };
}

/** The `editor.saveQuestion` arguments for this form (domain must be chosen). */
export function pbqSaveArgs(
  form: PbqFormState & { domain: Domain },
): Pick<SaveQuestionArgs, "question" | "key"> {
  return {
    question: {
      kind: "pbq",
      section: form.section,
      domain: form.domain,
      stem: form.stem,
      template: form.template,
      payload: pbqFormPayload(form),
    },
    key: { parts: pbqFormKey(form), explanation: form.explanation },
  };
}

/** Marks the form is worth: scored parts, or one per firewall rule (`pbqPoints`). */
export function pbqFormPoints(form: PbqFormState): number {
  return form.template === "firewall" ? form.rules.length : form.parts.filter(isScored).length;
}

export function clonePbqForm(form: PbqFormState): PbqFormState {
  return JSON.parse(JSON.stringify(form)) as PbqFormState;
}

export function samePbqForm(a: PbqFormState, b: PbqFormState): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

// ------------------------------------------------------------ list edits

/** "1d" after "1c", "B1e" after "B1d"; otherwise the next free `p<n>`. */
export function nextPartId(parts: readonly Pick<PartForm, "id">[]): string {
  const taken = new Set(parts.map((p) => p.id.trim()));
  const last = parts.at(-1)?.id.trim() ?? "";
  const m = /^(.*\d)([a-y])$/.exec(last);
  if (m) {
    const id = `${m[1]}${String.fromCharCode(m[2]!.charCodeAt(0) + 1)}`;
    if (!taken.has(id)) return id;
  }
  let n = parts.length + 1;
  while (taken.has(`p${n}`)) n += 1;
  return `p${n}`;
}

export function emptyPart(form: PbqFormState): PartForm {
  const kind = form.template === "firewall" ? "text" : PART_KINDS[form.template][0]!;
  return {
    id: nextPartId(form.parts),
    prompt: "",
    kind,
    scored: true,
    choices: "",
    options: kind === "mcq" ? OPTION_IDS.slice(0, 4).map((id) => ({ id, text: "" })) : [],
    answer: "",
    answer2: "",
  };
}

export function addPart(form: PbqFormState): PbqFormState {
  if (form.template === "firewall" || form.parts.length >= MAX_PARTS) return form;
  return { ...form, parts: [...form.parts, emptyPart(form)] };
}

export function removePart(form: PbqFormState, index: number): PbqFormState {
  if (form.parts.length <= 1 || index < 0 || index >= form.parts.length) return form;
  return { ...form, parts: form.parts.filter((_, i) => i !== index) };
}

/** Change a part's kind, keeping what still fits (the answer stays unless it can't). */
export function setPartKind(part: PartForm, kind: PartKind): PartForm {
  if (part.kind === kind) return part;
  const next: PartForm = { ...part, kind };
  if (kind === "mcq" && next.options.length < 2)
    next.options = OPTION_IDS.slice(0, 4).map((id) => ({ id, text: "" }));
  if (kind !== "portPair") next.answer2 = "";
  if (kind === "mcq" || part.kind === "mcq") next.answer = "";
  if (!isTextKind(kind)) next.scored = true;
  return next;
}

export function addPartOption(part: PartForm): PartForm {
  if (part.options.length >= MAX_PART_OPTIONS) return part;
  const id = OPTION_IDS[part.options.length]!;
  return { ...part, options: [...part.options, { id, text: "" }] };
}

/** Remove an option; later options move up a letter and the answer follows its text. */
export function removePartOption(part: PartForm, index: number): PartForm {
  if (part.options.length <= 2 || index < 0 || index >= part.options.length) return part;
  const removed = part.options[index]!.id;
  const kept = part.options.filter((_, i) => i !== index);
  const rename = new Map(kept.map((o, i) => [o.id, OPTION_IDS[i]!]));
  return {
    ...part,
    options: kept.map((o, i) => ({ id: OPTION_IDS[i]!, text: o.text })),
    answer: part.answer === removed ? "" : (rename.get(part.answer) ?? part.answer),
  };
}

export function addRule(form: PbqFormState): PbqFormState {
  if (form.template !== "firewall" || form.rules.length >= MAX_RULES) return form;
  const rule: RuleForm = { source: "", destination: "", protocol: "TCP", port: "", action: "" };
  // Keep a final catch-all rule last (LLD §10.3: the last rule is Any / DENY).
  const last = form.rules.at(-1);
  const rules =
    last && /^any$/i.test(last.source.trim())
      ? [...form.rules.slice(0, -1), rule, last]
      : [...form.rules, rule];
  return { ...form, rules };
}

export function removeRule(form: PbqFormState, index: number): PbqFormState {
  if (form.rules.length <= 1 || index < 0 || index >= form.rules.length) return form;
  return { ...form, rules: form.rules.filter((_, i) => i !== index) };
}

// ------------------------------------------------------------ fields

type PartSub = "id" | "prompt" | "kind" | "choices" | "options" | "answer";
type RuleSub = "source" | "destination" | "protocol" | "port" | "action";

/** A form field an issue can point at. */
export type PbqField =
  | "domain"
  | "stem"
  | "section"
  | "intro"
  | "explanation"
  | `artefact:${ArtefactField}`
  | "parts"
  | `part:${number}:${PartSub}`
  | `part:${number}:option:${number}`
  | "requirements"
  | "rules"
  | `rule:${number}:${RuleSub}`
  | "portChoices"
  | "actionChoices";

export interface PbqFieldIssue {
  /** `null`: about the whole question, shown in the summary only. */
  field: PbqField | null;
  message: string;
}

/** A DOM id for a field, under a per-form prefix. */
export function pbqDomId(prefix: string, field: PbqField): string {
  return `${prefix}-${field.replace(/:/g, "-")}`;
}

/**
 * The form field for a `VALIDATION_FAILED` issue path from `saveQuestion`
 * (`question.payload.parts[1].prompt`, `key.parts.parts.1b`,
 * `key.parts.rules[2].port`, ...). Key paths name part ids, so the form's
 * parts are needed to find the row.
 */
export function pbqFieldForPath(path: string, form: Pick<PbqFormState, "parts">): PbqField | null {
  if (path === "question.stem") return "stem";
  if (path === "question.domain") return "domain";
  if (path === "question.section") return "section";
  if (path === "key.explanation") return "explanation";

  const payload = /^question\.payload(?:\.(.*))?$/.exec(path);
  if (payload) {
    const rest = payload[1] ?? "";
    if (rest === "intro") return "intro";
    if ((ALL_ARTEFACTS as string[]).includes(rest)) return `artefact:${rest as ArtefactField}`;
    if (rest === "parts") return "parts";
    const option = /^parts\[(\d+)\]\.options\[(\d+)\]\.text$/.exec(rest);
    if (option) return `part:${Number(option[1])}:option:${Number(option[2])}`;
    const part = /^parts\[(\d+)\](?:\.(\w+))?/.exec(rest);
    if (part) {
      const i = Number(part[1]);
      switch (part[2]) {
        case undefined:
        case "id":
          return `part:${i}:id`;
        case "prompt":
          return `part:${i}:prompt`;
        case "kind":
        case "scored":
          return `part:${i}:kind`;
        case "choices":
          return `part:${i}:choices`;
        case "options":
          return `part:${i}:options`;
        default:
          return null;
      }
    }
    if (/^requirements(\[\d+\])?$/.test(rest)) return "requirements";
    if (/^portChoices(\[\d+\])?$/.test(rest)) return "portChoices";
    if (/^actionChoices(\[\d+\])?$/.test(rest)) return "actionChoices";
    if (rest === "rules") return "rules";
    const rule = /^rules\[(\d+)\](?:\.(source|destination|protocol))?$/.exec(rest);
    if (rule) return `rule:${Number(rule[1])}:${(rule[2] as RuleSub | undefined) ?? "source"}`;
    return null;
  }

  const key = /^key\.parts(?:\.(.*))?$/.exec(path);
  if (key) {
    const rest = key[1] ?? "";
    if (rest === "" || rest === "parts" || rest === "practice") return "parts";
    const keyed = /^(?:parts|practice)\.(.+)$/.exec(rest);
    if (keyed) {
      const index = form.parts.findIndex((p) => p.id.trim() === keyed[1]);
      return index >= 0 ? `part:${index}:answer` : "parts";
    }
    if (rest === "rules") return "rules";
    const rule = /^rules\[(\d+)\]\.(port|action)$/.exec(rest);
    if (rule) return `rule:${Number(rule[1])}:${rule[2] as RuleSub}`;
    if (/^rules\[\d+\]$/.test(rest)) return "rules";
    return null;
  }
  return null;
}

const ARTEFACT_LABEL: Record<ArtefactField, string> = Object.fromEntries(
  Object.values(ARTEFACTS)
    .flat()
    .map((s) => [s.field, s.label]),
) as Record<ArtefactField, string>;

const PART_SUB_NAME: Record<PartSub, string> = {
  id: "id",
  prompt: "prompt",
  kind: "answer type",
  choices: "choices",
  options: "options",
  answer: "answer",
};

/** A field's name for the error summary: "Part 1b answer", "Rule 2 port", "Log text". */
export function pbqFieldName(field: PbqField, form?: Pick<PbqFormState, "parts">): string {
  const option = /^part:(\d+):option:(\d+)$/.exec(field);
  if (option) {
    const part = form?.parts[Number(option[1])];
    const id = part?.options[Number(option[2])]?.id ?? OPTION_IDS[Number(option[2])];
    return `Part ${part?.id || Number(option[1]) + 1} option ${id}`;
  }
  const part = /^part:(\d+):(\w+)$/.exec(field);
  if (part) {
    const id = form?.parts[Number(part[1])]?.id.trim() || String(Number(part[1]) + 1);
    return `Part ${id} ${PART_SUB_NAME[part[2] as PartSub]}`;
  }
  const rule = /^rule:(\d+):(\w+)$/.exec(field);
  if (rule) return `Rule ${Number(rule[1]) + 1} ${rule[2]}`;
  if (field.startsWith("artefact:"))
    return ARTEFACT_LABEL[field.slice("artefact:".length) as ArtefactField];
  const names: Record<string, string> = {
    domain: "Domain",
    stem: "Question text",
    section: "PBQ set",
    intro: "Scenario",
    explanation: "Explanation",
    parts: "Parts",
    requirements: "Requirements",
    rules: "Rules",
    portChoices: "Port choices",
    actionChoices: "Action choices",
  };
  return names[field] ?? field;
}

/** "Must not be blank." from "must not be blank". */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const s = t[0]!.toUpperCase() + t.slice(1);
  return /[.!?]$/.test(s) ? s : `${s}.`;
}

/** Server issue strings (`path: message`) as field issues on this form. */
export function parsePbqIssues(
  issues: readonly string[],
  form: Pick<PbqFormState, "parts">,
): PbqFieldIssue[] {
  return issues.map((issue) => {
    const at = issue.indexOf(": ");
    if (at < 0) return { field: null, message: sentence(issue) };
    const field = pbqFieldForPath(issue.slice(0, at), form);
    return { field, message: field ? sentence(issue.slice(at + 2)) : sentence(issue) };
  });
}

// ------------------------------------------------------------ live checks

const prefixed = (prefix: string, errors: ValidationIssue[]) =>
  errors.map((e) => `${prefix}${e.path === "(root)" ? "" : `.${e.path}`}: ${e.message}`);

/**
 * Problems that stop a save, in the form's own words, then anything else
 * `validatePayload` / `validatePbqKey` (the server's save checks) would
 * reject, one issue per field. Run live as the tutor types.
 */
export function pbqSaveErrors(form: PbqFormState): PbqFieldIssue[] {
  const out: PbqFieldIssue[] = [];
  const add = (field: PbqField | null, message: string) => {
    if (field === null || !out.some((e) => e.field === field)) out.push({ field, message });
  };

  if (!form.domain) add("domain", "Choose a domain.");
  if (form.stem.trim() === "") add("stem", "Enter the question text.");
  else if (form.stem.length > STEM_MAX) add("stem", `Keep the question to ${STEM_MAX} characters.`);
  if (form.explanation.length > EXPLANATION_MAX)
    add("explanation", `Keep the explanation to ${EXPLANATION_MAX} characters.`);

  if (form.template === "firewall") {
    if (lines(form.requirements).length === 0) add("requirements", "Add at least one requirement.");
    const choices = lines(form.portChoices);
    if (choices.length === 0) add("portChoices", "Add at least one port choice.");
    else if (new Set(choices).size !== choices.length)
      add("portChoices", "Each port choice must appear once.");
    if (form.actionChoices.length === 0) add("actionChoices", "Offer at least one action.");
    if (form.rules.length === 0) add("rules", "Add at least one rule.");
    form.rules.forEach((r, i) => {
      if (r.source.trim() === "") add(`rule:${i}:source`, "Enter the source.");
      if (r.destination.trim() === "") add(`rule:${i}:destination`, "Enter the destination.");
      if (r.port.trim() === "") add(`rule:${i}:port`, "Choose the correct port.");
      else if (!choices.includes(r.port.trim()))
        add(`rule:${i}:port`, "The correct port must be one of the port choices.");
      if (!r.action) add(`rule:${i}:action`, "Choose the correct action.");
      else if (!form.actionChoices.includes(r.action))
        add(`rule:${i}:action`, "The correct action must be one of the action choices.");
    });
  } else {
    if (form.parts.length === 0) add("parts", "Add at least one part.");
    const seen = new Set<string>();
    form.parts.forEach((p, i) => {
      const id = p.id.trim();
      if (id === "") add(`part:${i}:id`, "Enter a part id, like 1a.");
      else if (seen.has(id)) add(`part:${i}:id`, `Part id ${id} is used twice.`);
      seen.add(id);
      if (p.prompt.trim() === "") add(`part:${i}:prompt`, "Enter the prompt.");
      if (p.kind === "pick") {
        const list = lines(p.choices);
        if (list.length < 2) add(`part:${i}:choices`, "Give at least two choices, one per line.");
        else if (new Set(list).size !== list.length)
          add(`part:${i}:choices`, "Each choice must appear once.");
        if (p.answer.trim() === "") add(`part:${i}:answer`, "Choose the correct answer.");
        else if (!list.includes(p.answer.trim()))
          add(`part:${i}:answer`, "The answer must be one of the choices.");
      } else if (p.kind === "mcq") {
        p.options.forEach((o, j) => {
          if (o.text.trim() === "")
            add(`part:${i}:option:${j}`, `Enter the text for option ${o.id}.`);
        });
        if (!p.options.some((o) => o.id === p.answer))
          add(`part:${i}:answer`, "Tick the correct option.");
      } else if (p.kind === "portPair") {
        if (p.answer.trim() === "" || p.answer2.trim() === "")
          add(`part:${i}:answer`, "Enter both ports.");
      } else if (isScored(p) && p.answer.trim() === "") {
        add(`part:${i}:answer`, "Enter the correct answer.");
      }
    });
    if (
      (form.template === "sshLog" || form.template === "permissions") &&
      form.parts.length > 0 &&
      !form.parts.some(isScored)
    )
      add("parts", "At least one part must be scored.");
  }
  for (const spec of ARTEFACTS[form.template]) {
    if (form.artefacts[spec.field].trim() === "")
      add(`artefact:${spec.field}`, `Enter the ${spec.label.toLowerCase()}.`);
  }

  // Whatever the shared validators still reject (the server runs the same ones).
  const payload = pbqFormPayload(form);
  const checked = validatePayload(form.template, payload);
  const raw = checked.ok
    ? (() => {
        const key = validatePbqKey(checked.value, pbqFormKey(form));
        return key.ok ? [] : prefixed("key.parts", key.errors);
      })()
    : prefixed("question.payload", checked.errors);
  for (const issue of parsePbqIssues(raw, form)) add(issue.field, issue.message);
  return out;
}

/** Things a draft may be saved without but that block publishing (LLD §10.2). */
export function pbqPublishHints(form: PbqFormState): PbqFieldIssue[] {
  return form.explanation.trim() === ""
    ? [{ field: "explanation", message: "Required before publishing." }]
    : [];
}

// ------------------------------------------------------------ preview

/**
 * The form as a paper question for the student PBQ components (the
 * `ExamQuestionPbq` contract), or `null` while the payload is invalid.
 */
export function pbqPreviewQuestion(
  form: PbqFormState,
  entry: Pick<DraftEntry, "question">,
): PaperPbq | null {
  const checked = validatePayload(form.template, pbqFormPayload(form));
  if (!checked.ok) return null;
  return {
    questionId: entry.question._id,
    kind: "pbq",
    section: form.section,
    displayNumber: entry.question.displayNumber,
    points: pbqFormPoints(form),
    stem: form.stem,
    payload: checked.value,
  };
}

// ------------------------------------------------------------ messages

/** The message for `field` in `list`, or `null`. */
export function issueOf(list: readonly PbqFieldIssue[], field: PbqField): string | null {
  return list.find((e) => e.field === field)?.message ?? null;
}

/** `aria-describedby` for a field: its hint or its error (`EditorPbqFieldMessage` ids). */
export function describedByOf(
  prefix: string,
  field: PbqField,
  errors: readonly PbqFieldIssue[],
  hints: readonly PbqFieldIssue[] = [],
): string | undefined {
  const id = pbqDomId(prefix, field);
  if (issueOf(errors, field)) return `${id}-error`;
  if (issueOf(hints, field)) return `${id}-hint`;
  return undefined;
}
