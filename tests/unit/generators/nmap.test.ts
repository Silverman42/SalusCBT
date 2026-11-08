import { describe, expect, it } from "vitest";
import type { PayloadOf } from "../../../shared/content";
import { SERVICES, generateNmap } from "../../../convex/generators/nmap";
import { SEEDS, expectDeterministic, expectSetB, expectValid, sourcePbq } from "./helpers";

/** Open ports listed in the scan, e.g. `21/tcp   open  ftp …` → 21. */
const openPorts = (scan: string) =>
  [...scan.matchAll(/^(\d+)\/tcp\s+open\s/gm)].map((m) => Number(m[1]));

const cleartext = (kind: string) =>
  Object.values(SERVICES)
    .filter((s) => "cleartext" in s && s.cleartext === kind)
    .map((s) => s.port);

const shape = (p: PayloadOf<"nmap">) =>
  p.parts.map(({ id, kind, prompt }) => ({ id, kind, prompt }));

describe("generateNmap", () => {
  it("is deterministic per seed", () => expectDeterministic(generateNmap));

  it("passes validation and full-marks the key for 1,000 seeds", () => {
    for (const seed of SEEDS) expectValid(generateNmap(seed));
  });

  it("supports set B part ids", () => expectSetB(generateNmap, 2));

  it("only scans private (reserved) addresses", () => {
    for (const seed of SEEDS) {
      const ips = generateNmap(seed).payload.scan.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [];
      expect(ips.length).toBeGreaterThan(0);
      for (const ip of ips) expect(ip).toMatch(/^10\.0\.\d{1,3}\.\d{1,3}$/);
    }
  });

  it("derives the key from the open-service table", () => {
    const scenarios = new Set<string>();
    for (const seed of SEEDS) {
      const g = generateNmap(seed);
      const scan = g.payload.scan;
      const open = openPorts(scan);
      expect(scan).toMatch(/^analyst@kali:~\$ nmap -sV 10\.0\.\d+\.\d+$/m);
      expect(scan).toContain(`Not shown: ${1000 - open.length} closed tcp ports (reset)`);
      expect(open).toEqual([...open].sort((a, b) => a - b));
      expect(new Set(open).size).toBe(open.length);

      const parts = (g.key as { parts: Record<string, string | string[]> }).parts;
      const [a, b, c] = g.payload.parts.map((p) => parts[p.id]);
      if (g.payload.intro.includes("file server")) {
        scenarios.add("file");
        // Exactly one cleartext shell and one cleartext file service are open.
        const shells = open.filter((p) => cleartext("shell").includes(p));
        const files = open.filter((p) => cleartext("file").includes(p));
        expect(shells).toEqual([Number(a)]);
        expect(files).toEqual([Number(c)]);
        expect(b).toBe("22");
        expect(open).toContain(22);
      } else {
        scenarios.add("mail");
        const [todayClear, todaySecure] = a as string[];
        const [otherClear, otherSecure] = b as string[];
        // Both cleartext ports are open; only the "other" secure port is.
        expect(open).toContain(Number(todayClear));
        expect(open).not.toContain(Number(todaySecure));
        expect(open).toContain(Number(otherClear));
        expect(open).toContain(Number(otherSecure));
        expect(new Set([todayClear, otherClear])).toEqual(new Set(["110", "143"]));
        expect(c).toBe("389");
        expect(open).toEqual(expect.arrayContaining([389, 636]));
      }
    }
    expect(scenarios).toEqual(new Set(["file", "mail"]));
  });

  it("matches the shape of the source PBQs 2 and B2", () => {
    const real = sourcePbq("2").question.payload as PayloadOf<"nmap">;
    const realB = sourcePbq("B2").question.payload as PayloadOf<"nmap">;
    const fileSeed = SEEDS.find((s) => generateNmap(s).payload.intro === real.intro)!;
    const mailSeed = SEEDS.find((s) => generateNmap(s).payload.intro === realB.intro)!;
    expect(shape(generateNmap(fileSeed).payload)).toEqual(shape(real));
    const mail = generateNmap(mailSeed, { set: "B" }).payload;
    expect(mail.parts.map((p) => p.kind)).toEqual(realB.parts.map((p) => p.kind));
    expect(mail.parts.slice(1).map((p) => p.prompt)).toEqual(
      realB.parts.slice(1).map((p) => p.prompt),
    );
    // The scan header is laid out like real nmap output.
    expect(generateNmap(fileSeed).payload.scan).toMatch(/^PORT {5}STATE SERVICE +VERSION$/m);
  });
});
