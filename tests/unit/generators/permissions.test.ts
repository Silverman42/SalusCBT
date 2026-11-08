import { describe, expect, it } from "vitest";
import type { PayloadOf } from "../../../shared/content";
import {
  PRIVATE_KEY_MODE,
  SECURE_MODES,
  generatePermissions,
  symbolic,
  type SensitiveFile,
} from "../../../convex/generators/permissions";
import { SEEDS, expectDeterministic, expectSetB, expectValid, sourcePbq } from "./helpers";

/** `-rw-r--rw- 1 root shadow 455 Nov  3 09:14 shadow` → { perms, name }. */
const entries = (block: string) =>
  [
    ...block.matchAll(/^([-d][-rwx]{9}) \d+ (\S+) +(\S+) +\d+ \w{3} [ \d]\d \d\d:\d\d (\S+)$/gm),
  ].map((m) => ({ perms: m[1]!, owner: m[2]!, group: m[3]!, name: m[4]! }));

const othersCan = (perms: string) => perms.slice(7) !== "---";

describe("symbolic", () => {
  it("renders octal modes like ls", () => {
    expect(symbolic("640")).toBe("-rw-r-----");
    expect(symbolic("646")).toBe("-rw-r--rw-");
    expect(symbolic("440")).toBe("-r--r-----");
    expect(symbolic("755", true)).toBe("drwxr-xr-x");
  });
});

describe("generatePermissions", () => {
  it("is deterministic per seed", () => expectDeterministic(generatePermissions));

  it("passes validation and full-marks the key for 1,000 seeds", () => {
    for (const seed of SEEDS) expectValid(generatePermissions(seed));
  });

  it("supports set B part ids", () => expectSetB(generatePermissions, 4));

  it("exposes exactly one sensitive /etc file and keys its correct mode", () => {
    const targets = new Set<string>();
    const directives = new Set<string>();
    for (const seed of SEEDS) {
      const g = generatePermissions(seed);
      const parts = (g.key as { parts: Record<string, string> }).parts;
      const [etcBlock, sshBlock] = g.payload.listings.split("\n\n") as [string, string];
      const etc = entries(etcBlock);
      expect(etc.map((e) => e.name)).toEqual(
        expect.arrayContaining(["shadow", "gshadow", "sudoers", "passwd", "group"]),
      );

      const sensitive = etc.filter((e) => e.name in SECURE_MODES);
      const exposed = sensitive.filter((e) => othersCan(e.perms));
      expect(exposed).toHaveLength(1);
      const target = exposed[0]!.name as SensitiveFile;
      targets.add(target);
      expect(parts["4a"]).toBe(`/etc/${target}`);
      expect(parts["4b"]).toBe(SECURE_MODES[target].mode);
      // The other sensitive files already have their secure modes.
      for (const e of sensitive.filter((e) => e.name !== target))
        expect(e.perms).toBe(symbolic(SECURE_MODES[e.name as SensitiveFile].mode));

      const key = entries(sshBlock).find((e) => /^id_\w+$/.test(e.name))!;
      expect(key.perms).not.toBe(symbolic(PRIVATE_KEY_MODE));
      expect(parts["4c"]).toBe("600");
      expect(g.payload.parts[2]!.prompt).toContain(`\`${key.name}\``);

      // The asked-about directive is currently `yes`.
      directives.add(parts["4d"]!);
      expect(g.payload.sshdConfig).toMatch(new RegExp(`^${parts["4d"]} yes$`, "m"));
      expect(g.payload.sshdConfig.split("\n")[0]).toMatch(/\$ cat \/etc\/ssh\/sshd_config$/);
    }
    expect(targets).toEqual(new Set(["shadow", "gshadow", "sudoers"]));
    expect(directives).toEqual(
      new Set(["PermitRootLogin", "PasswordAuthentication", "X11Forwarding"]),
    );
  });

  it("matches the shape of the source PBQ 4", () => {
    const real = sourcePbq("4").question.payload as PayloadOf<"permissions">;
    const seed = SEEDS.find((s) => {
      const k = (generatePermissions(s).key as { parts: Record<string, string> }).parts;
      return k["4a"] === "/etc/shadow" && k["4d"] === "PermitRootLogin";
    })!;
    const g = generatePermissions(seed).payload;
    expect(g.parts.map(({ id, kind, scored }) => ({ id, kind, scored }))).toEqual(
      real.parts.map(({ id, kind, scored }) => ({ id, kind, scored })),
    );
    expect([g.parts[0]!.prompt, g.parts[1]!.prompt, g.parts[3]!.prompt]).toEqual([
      real.parts[0]!.prompt,
      real.parts[1]!.prompt,
      real.parts[3]!.prompt,
    ]);
    // Same sshd_config body apart from the seeded values.
    const body = (s: string) =>
      s
        .split("\n")
        .slice(1)
        .map((l) => l.replace(/ (yes|no|\d+)$/, " _"));
    expect(body(g.sshdConfig)).toEqual(body(real.sshdConfig));
  });
});
