// Generator registry (LLD §10.3): one deterministic generator per PBQ template.
// Used by `editor.generate` (T-606).

import type { PbqTemplate } from "../../shared/content";
import type { Generated, Generator, GeneratorOptions } from "./common";
import { generateFirewall } from "./firewall";
import { generateHashCheck } from "./hashCheck";
import { generateNmap } from "./nmap";
import { generatePermissions } from "./permissions";
import { generateSshLog } from "./sshLog";

export type { Generated, Generator, GeneratorOptions } from "./common";

export const generators: { [T in PbqTemplate]: Generator<T> } = {
  sshLog: generateSshLog,
  nmap: generateNmap,
  hashCheck: generateHashCheck,
  permissions: generatePermissions,
  firewall: generateFirewall,
};

/** Run the generator for `template`. `seed` is treated as a uint32. */
export function generate<T extends PbqTemplate>(
  template: T,
  seed: number,
  options?: GeneratorOptions,
): Generated<T> {
  return (generators[template] as Generator<T>)(seed, options);
}
