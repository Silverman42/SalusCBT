// hashCheck generator (LLD §10.3, T-605): vendor hashes vs `sha256sum` output.
//
// Four installers; each vendor hash is a real SHA-256 of seeded content. One
// file is tampered: its computed hash keeps exactly the first 6 and last 6
// characters of the published value and differs in the middle (the "partial
// compare" trap from PBQ 3). The tampered file in the key is read back from
// the generated text by `hashCheckTampered`.

import type { McqPart, PbqKey, PickPart } from "../../shared/content";
import { Rand, partId, type GeneratorOptions, type Generated } from "./common";
import { sha256Hex } from "./sha256";

/** Characters kept at each end of the tampered hash. */
export const KEPT = 6;

const FILES = [
  "agent-installer-v4.2.exe",
  "vpn-client-3.1.msi",
  "backup-tool-1.8.deb",
  "pdf-reader-2026.2.exe",
  "edr-sensor-7.11.msi",
  "office-suite-24.8.pkg",
  "db-client-16.4.rpm",
  "browser-setup-131.0.exe",
  "monitoring-agent-2.9.deb",
  "password-manager-5.3.msi",
];

const ACTION_CORRECT =
  "Quarantine it, report it, and obtain a fresh copy from the vendor's official source, then verify again";
const ACTION_WRONG = [
  "Deploy it, because the other three files passed",
  "Rename the file and run sha256sum again",
  "Recalculate the vendor's hash and update vendor_hashes.txt to match",
];
const GOAL_CORRECT = "Integrity";
const GOAL_WRONG = ["Confidentiality", "Availability", "Non-repudiation"];

const HASH_LINE = /^([0-9a-f]{64})\s+(\S+)$/gm;

const hashes = (text: string) =>
  new Map([...text.matchAll(HASH_LINE)].map((m) => [m[2]!, m[1]!] as const));

/**
 * Files whose computed hash differs from the vendor's (or is missing), in
 * vendor order. Used for the key and by editor validation (ED-2).
 */
export function hashCheckTampered(vendorHashes: string, computed: string): string[] {
  const got = hashes(computed);
  return [...hashes(vendorHashes)].filter(([file, hash]) => got.get(file) !== hash).map(([f]) => f);
}

/** Replace hex digit `c` with a different one, deterministically. */
const otherHex = (c: string) => ((parseInt(c, 16) + 1) % 16).toString(16);

/** Tampered hash: same first/last `KEPT` characters, every other one free but the edges forced to differ. */
function tamper(original: string, fresh: string): string {
  const middle = fresh.slice(KEPT, 64 - KEPT).split("");
  if (middle[0] === original[KEPT]) middle[0] = otherHex(middle[0]!);
  const last = middle.length - 1;
  if (middle[last] === original[63 - KEPT]) middle[last] = otherHex(middle[last]!);
  return original.slice(0, KEPT) + middle.join("") + original.slice(64 - KEPT);
}

function mcq(r: Rand, id: string, prompt: string, correct: string, wrong: string[]) {
  const texts = r.shuffle([correct, ...wrong]);
  const options = texts.map((text, i) => ({ id: String.fromCharCode(65 + i), text }));
  const part: McqPart = { id, prompt, kind: "mcq", options };
  return { part, answer: options.find((o) => o.text === correct)!.id };
}

export function generateHashCheck(
  seed: number,
  options?: GeneratorOptions,
): Generated<"hashCheck"> {
  const r = new Rand(seed);
  const files = r.subset(FILES, 4);
  const tamperedIndex = r.int(0, 3);
  const prompt = `analyst@ws-it-${String(r.int(1, 40)).padStart(2, "0")}:~/downloads$`;
  const salt = r.int(0, 0xffffffff).toString(16);

  const vendor = files.map((f) => sha256Hex(`${f}\n${salt}\n`));
  const computed = vendor.map((h, i) =>
    i === tamperedIndex ? tamper(h, sha256Hex(`${files[i]}\n${salt}\ntampered\n`)) : h,
  );
  const listing = (values: string[]) => values.map((h, i) => `${h}  ${files[i]}`);
  const vendorHashes = [`${prompt} cat vendor_hashes.txt`, ...listing(vendor)].join("\n");
  const computedText = [`${prompt} sha256sum ${files.join(" ")}`, ...listing(computed)].join("\n");

  const tampered = hashCheckTampered(vendorHashes, computedText);
  if (tampered.length !== 1 || tampered[0] !== files[tamperedIndex]) {
    throw new Error(`hashCheck generator produced ${tampered.length} mismatches for seed ${seed}`);
  }
  const file = tampered[0]!;

  const id = (letter: string) => partId("hashCheck", options, letter);
  const pick: PickPart = {
    id: id("a"),
    prompt: "Which file failed the integrity check?",
    kind: "pick",
    choices: files,
  };
  const action = mcq(
    r,
    id("b"),
    "What should you do with that file?",
    ACTION_CORRECT,
    ACTION_WRONG,
  );
  const goal = mcq(
    r,
    id("c"),
    "Which security goal does comparing hashes confirm?",
    GOAL_CORRECT,
    GOAL_WRONG,
  );
  const key: PbqKey = {
    parts: { [pick.id]: file, [action.part.id]: action.answer, [goal.part.id]: goal.answer },
  };

  return {
    template: "hashCheck",
    payload: {
      template: "hashCheck",
      intro:
        "Installers are staged for rollout. The vendors' published SHA-256 values are in `vendor_hashes.txt`.",
      vendorHashes,
      computed: computedText,
      parts: [pick, action.part, goal.part],
    },
    key,
    points: 3,
    explanation:
      `sha256sum -c vendor_hashes.txt reports ${file}: FAILED. Its hash starts and ends with the same characters as the published value, ` +
      "which is a trap for anyone comparing only the first few characters: always compare the full hash (or let -c do it). " +
      "A mismatch means the file was altered or corrupted, so it must not be deployed. " +
      "Hashing proves integrity; proving who produced the file needs a digital signature.",
  };
}
