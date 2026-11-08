// Runtime validators for the shapes in ./content.ts (LLD §3.2).
//
// The validators are Convex `v` validators, so they can be used directly in the
// Convex schema and function args. `validatePayload`, `validatePbqKey` and
// `validateAnswerValue` check plain values against them (plus a few rules the
// type system cannot express) and return a result instead of throwing, so the
// parser, seeding and the editor can report every problem at once.

import { v, type Infer, type Validator } from "convex/values";
import type { AnswerValue, PbqKey, PbqPayload, PbqTemplate, PayloadOf } from "./content";

// ---------------------------------------------------------------------------
// Convex validators
// ---------------------------------------------------------------------------

export const textPartValidator = v.object({
  id: v.string(),
  prompt: v.string(),
  kind: v.union(
    v.literal("ip"),
    v.literal("text"),
    v.literal("integer"),
    v.literal("octal"),
    v.literal("directive"),
    v.literal("path"),
  ),
  scored: v.boolean(),
});

export const portPartValidator = v.object({
  id: v.string(),
  prompt: v.string(),
  kind: v.union(v.literal("port"), v.literal("portPair")),
});

export const pickPartValidator = v.object({
  id: v.string(),
  prompt: v.string(),
  kind: v.literal("pick"),
  choices: v.array(v.string()),
});

export const mcqPartValidator = v.object({
  id: v.string(),
  prompt: v.string(),
  kind: v.literal("mcq"),
  options: v.array(v.object({ id: v.string(), text: v.string() })),
});

export const firewallActionValidator = v.union(v.literal("ALLOW"), v.literal("DENY"));

export const firewallRuleRowValidator = v.object({
  source: v.string(),
  destination: v.string(),
  protocol: v.union(v.literal("TCP"), v.literal("UDP")),
});

export const pbqTemplateValidator = v.union(
  v.literal("sshLog"),
  v.literal("nmap"),
  v.literal("hashCheck"),
  v.literal("permissions"),
  v.literal("firewall"),
);

/** One validator per template, keyed by template name. */
export const payloadValidators = {
  sshLog: v.object({
    template: v.literal("sshLog"),
    intro: v.string(),
    log: v.string(),
    parts: v.array(textPartValidator),
  }),
  nmap: v.object({
    template: v.literal("nmap"),
    intro: v.string(),
    scan: v.string(),
    parts: v.array(portPartValidator),
  }),
  hashCheck: v.object({
    template: v.literal("hashCheck"),
    intro: v.string(),
    vendorHashes: v.string(),
    computed: v.string(),
    parts: v.array(v.union(pickPartValidator, mcqPartValidator)),
  }),
  permissions: v.object({
    template: v.literal("permissions"),
    intro: v.string(),
    listings: v.string(),
    sshdConfig: v.string(),
    parts: v.array(textPartValidator),
  }),
  firewall: v.object({
    template: v.literal("firewall"),
    intro: v.string(),
    requirements: v.array(v.string()),
    diagram: v.string(),
    rules: v.array(firewallRuleRowValidator),
    portChoices: v.array(v.string()),
    actionChoices: v.array(firewallActionValidator),
  }),
} as const;

export const pbqPayloadValidator = v.union(
  payloadValidators.sshLog,
  payloadValidators.nmap,
  payloadValidators.hashCheck,
  payloadValidators.permissions,
  payloadValidators.firewall,
);

const partAnswerValidator = v.union(v.string(), v.array(v.string()));

export const pbqKeyValidator = v.union(
  v.object({
    parts: v.record(v.string(), partAnswerValidator),
    practice: v.optional(v.record(v.string(), v.string())),
  }),
  v.object({
    rules: v.array(v.object({ port: v.string(), action: firewallActionValidator })),
  }),
);

export const answerValueValidator = v.union(
  v.object({ kind: v.literal("mcq"), optionIds: v.array(v.string()) }),
  v.object({ kind: v.literal("pbq"), parts: v.record(v.string(), partAnswerValidator) }),
  v.object({
    kind: v.literal("firewall"),
    rules: v.array(
      v.object({ port: v.union(v.string(), v.null()), action: v.union(v.string(), v.null()) }),
    ),
  }),
);

// Compile-time proof that the validators and the hand-written types agree.
type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
type Assert<T extends true> = T;
export type _ValidatorsMatchTypes = [
  Assert<Equal<Infer<typeof pbqPayloadValidator>, PbqPayload>>,
  Assert<Equal<Infer<typeof pbqTemplateValidator>, PbqTemplate>>,
  Assert<Equal<Infer<typeof pbqKeyValidator>, PbqKey>>,
  Assert<Equal<Infer<typeof answerValueValidator>, AnswerValue>>,
];

// ---------------------------------------------------------------------------
// Result type and a generic checker over Convex validators
// ---------------------------------------------------------------------------

/** `path` uses dot/bracket notation from the value's root, e.g. `parts[1].kind`. */
export type ValidationIssue = { path: string; message: string };
export type ValidationResult<T> = { ok: true; value: T } | { ok: false; errors: ValidationIssue[] };

type AnyValidator = Validator<unknown, "required" | "optional", string>;

const join = (path: string, key: string | number) =>
  typeof key === "number" ? `${path}[${key}]` : path ? `${path}.${key}` : key;
const describe = (value: unknown) =>
  value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Check `value` against a Convex validator and collect every mismatch. Covers
 * the validator kinds used in this file (and the other plain JSON kinds).
 */
export function checkValue(validator: AnyValidator, value: unknown, path = ""): ValidationIssue[] {
  const at = path || "(root)";
  const fail = (message: string): ValidationIssue[] => [{ path: at, message }];
  switch (validator.kind) {
    case "string":
      return typeof value === "string" ? [] : fail(`expected string, got ${describe(value)}`);
    case "float64":
      return typeof value === "number" ? [] : fail(`expected number, got ${describe(value)}`);
    case "boolean":
      return typeof value === "boolean" ? [] : fail(`expected boolean, got ${describe(value)}`);
    case "null":
      return value === null ? [] : fail(`expected null, got ${describe(value)}`);
    case "any":
      return [];
    case "literal":
      return value === validator.value
        ? []
        : fail(`expected ${JSON.stringify(validator.value)}, got ${JSON.stringify(value)}`);
    case "array":
      if (!Array.isArray(value)) return fail(`expected array, got ${describe(value)}`);
      return value.flatMap((item, i) => checkValue(validator.element, item, join(path, i)));
    case "record":
      if (!isPlainObject(value)) return fail(`expected object, got ${describe(value)}`);
      return Object.entries(value).flatMap(([k, item]) =>
        checkValue(validator.value, item, join(path, k)),
      );
    case "object": {
      if (!isPlainObject(value)) return fail(`expected object, got ${describe(value)}`);
      const fields = validator.fields as Record<string, AnyValidator>;
      const issues: ValidationIssue[] = [];
      for (const [name, field] of Object.entries(fields)) {
        if (value[name] === undefined) {
          if (field.isOptional !== "optional")
            issues.push({ path: join(path, name), message: "is required" });
        } else {
          issues.push(...checkValue(field, value[name], join(path, name)));
        }
      }
      for (const name of Object.keys(value)) {
        if (!(name in fields)) issues.push({ path: join(path, name), message: "is not allowed" });
      }
      return issues;
    }
    case "union": {
      // Report the closest member's issues so messages stay specific.
      let best: ValidationIssue[] | undefined;
      for (const member of validator.members as AnyValidator[]) {
        const issues = checkValue(member, value, path);
        if (issues.length === 0) return [];
        if (!best || issues.length < best.length) best = issues;
      }
      return best ?? fail("no union members");
    }
    default:
      return fail(`unsupported validator kind "${validator.kind}"`);
  }
}

const result = <T>(value: unknown, errors: ValidationIssue[]): ValidationResult<T> =>
  errors.length === 0 ? { ok: true, value: value as T } : { ok: false, errors };

function duplicates(values: string[], path: string, what: string): ValidationIssue[] {
  const seen = new Set<string>();
  const issues: ValidationIssue[] = [];
  values.forEach((value, i) => {
    if (seen.has(value))
      issues.push({ path: join(path, i), message: `duplicate ${what} "${value}"` });
    seen.add(value);
  });
  return issues;
}

function nonEmpty(list: unknown[], path: string): ValidationIssue[] {
  return list.length === 0 ? [{ path, message: "must not be empty" }] : [];
}

const isTemplate = (t: unknown): t is PbqTemplate =>
  typeof t === "string" && Object.hasOwn(payloadValidators, t);

// ---------------------------------------------------------------------------
// Public helpers
// ---------------------------------------------------------------------------

/**
 * Validate a PBQ payload against the template it is stored under
 * (`questions.template`). Used by seeding and every editor save.
 */
export function validatePayload<T extends PbqTemplate>(
  template: T,
  payload: unknown,
): ValidationResult<PayloadOf<T>>;
export function validatePayload(template: string, payload: unknown): ValidationResult<PbqPayload>;
export function validatePayload(template: string, payload: unknown): ValidationResult<PbqPayload> {
  if (!isTemplate(template)) {
    return { ok: false, errors: [{ path: "template", message: `unknown template "${template}"` }] };
  }
  if (isPlainObject(payload) && payload.template !== template) {
    return {
      ok: false,
      errors: [
        {
          path: "template",
          message: `payload template ${JSON.stringify(payload.template)} does not match "${template}"`,
        },
      ],
    };
  }
  const errors = checkValue(payloadValidators[template], payload);
  if (errors.length > 0) return { ok: false, errors };

  // Shape is right; now the rules the types cannot express.
  const p = payload as PbqPayload;
  if (p.template === "firewall") {
    errors.push(
      ...nonEmpty(p.requirements, "requirements"),
      ...nonEmpty(p.rules, "rules"),
      ...nonEmpty(p.portChoices, "portChoices"),
      ...duplicates(p.portChoices, "portChoices", "port choice"),
      ...nonEmpty(p.actionChoices, "actionChoices"),
      ...duplicates(p.actionChoices, "actionChoices", "action choice"),
    );
  } else {
    errors.push(
      ...nonEmpty(p.parts, "parts"),
      ...duplicates(
        p.parts.map((part) => part.id),
        "parts",
        "part id",
      ),
    );
    p.parts.forEach((part, i) => {
      if (part.id.trim() === "")
        errors.push({ path: `parts[${i}].id`, message: "must not be blank" });
      if (part.prompt.trim() === "")
        errors.push({ path: `parts[${i}].prompt`, message: "must not be blank" });
      if (part.kind === "pick") {
        errors.push(
          ...nonEmpty(part.choices, `parts[${i}].choices`),
          ...duplicates(part.choices, `parts[${i}].choices`, "choice"),
        );
      } else if (part.kind === "mcq") {
        if (part.options.length < 2)
          errors.push({ path: `parts[${i}].options`, message: "needs at least 2 options" });
        errors.push(
          ...duplicates(
            part.options.map((o) => o.id),
            `parts[${i}].options`,
            "option id",
          ),
        );
      }
    });
    if (p.template === "sshLog" || p.template === "permissions") {
      if (!p.parts.some((part) => part.scored))
        errors.push({ path: "parts", message: "needs at least one scored part" });
    }
  }
  return result<PbqPayload>(payload, errors);
}

/**
 * Validate an answer key against an already-validated payload: right key
 * shape for the template, every scored part keyed (and only known parts),
 * portPair keys are two ports, pick/mcq keys are valid choices, firewall keys
 * use values from the choice lists (LLD §6.2, §10.2).
 */
export function validatePbqKey(payload: PbqPayload, key: unknown): ValidationResult<PbqKey> {
  const errors = checkValue(pbqKeyValidator, key);
  if (errors.length > 0) return { ok: false, errors };
  const k = key as PbqKey;

  if (payload.template === "firewall") {
    if (!("rules" in k))
      return { ok: false, errors: [{ path: "rules", message: "is required for firewall" }] };
    if (k.rules.length !== payload.rules.length)
      errors.push({
        path: "rules",
        message: `has ${k.rules.length} rules, payload has ${payload.rules.length}`,
      });
    k.rules.forEach((rule, i) => {
      if (!payload.portChoices.includes(rule.port))
        errors.push({ path: `rules[${i}].port`, message: `"${rule.port}" is not in portChoices` });
      if (!payload.actionChoices.includes(rule.action))
        errors.push({
          path: `rules[${i}].action`,
          message: `"${rule.action}" is not in actionChoices`,
        });
    });
    return result<PbqKey>(key, errors);
  }

  if (!("parts" in k)) return { ok: false, errors: [{ path: "parts", message: "is required" }] };
  const known = new Map(payload.parts.map((part) => [part.id, part]));
  for (const part of payload.parts) {
    const scored = !("scored" in part) || part.scored;
    const answer = k.parts[part.id];
    const path = `parts.${part.id}`;
    if (!scored) {
      if (answer !== undefined) errors.push({ path, message: "practice part belongs in practice" });
      continue;
    }
    if (answer === undefined) {
      errors.push({ path, message: "scored part has no key" });
      continue;
    }
    if (part.kind === "portPair") {
      if (!Array.isArray(answer) || answer.length !== 2)
        errors.push({ path, message: "portPair key must be two ports" });
    } else if (typeof answer !== "string") {
      errors.push({ path, message: `${part.kind} key must be a single string` });
    } else if (part.kind === "pick" && !part.choices.includes(answer)) {
      errors.push({ path, message: `"${answer}" is not one of the choices` });
    } else if (part.kind === "mcq" && !part.options.some((o) => o.id === answer)) {
      errors.push({ path, message: `"${answer}" is not one of the option ids` });
    }
  }
  for (const id of Object.keys(k.parts)) {
    if (!known.has(id)) errors.push({ path: `parts.${id}`, message: "unknown part id" });
  }
  for (const id of Object.keys(k.practice ?? {})) {
    const part = known.get(id);
    if (!part || !("scored" in part) || part.scored)
      errors.push({ path: `practice.${id}`, message: "not a practice part" });
  }
  return result<PbqKey>(key, errors);
}

/** Validate a student's saved answer (`responses.value`). Shape only; marking handles content. */
export function validateAnswerValue(value: unknown): ValidationResult<AnswerValue> {
  return result<AnswerValue>(value, checkValue(answerValueValidator, value));
}
