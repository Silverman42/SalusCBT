import { describe, expect, it } from "vitest";
import seed from "../../../content/seed/sy0-701.json";
import {
  actionLabel,
  describeDiagram,
  diagramLayout,
  firewallRows,
  parseNetworkDiagram,
  ruleLabel,
  type DiagramBox,
} from "../../../app/lib/pbq/firewall";
import { setFirewallCell } from "../../../app/lib/examRunner";
import type { PayloadOf } from "../../../shared/content";

const payloads = (seed.questions as { displayNumber: string; payload?: { template: string } }[])
  .filter((q) => q.payload?.template === "firewall")
  .map((q) => [q.displayNumber, q.payload as PayloadOf<"firewall">] as const);
const pbq5 = payloads[0]![1];

describe("firewall answers", () => {
  it("covers PBQ 5 and B5", () => {
    expect(payloads.map(([n]) => n)).toEqual(["5", "B5"]);
  });

  it.each(payloads)("has one row per payload rule (%s)", (_, p) => {
    expect(firewallRows(p, undefined)).toHaveLength(p.rules.length);
    expect(firewallRows(p, undefined).every((r) => r.port === null && r.action === null)).toBe(
      true,
    );
    // A short or long saved value is padded or cut to the payload's rules.
    const short = { kind: "firewall" as const, rules: [{ port: "443", action: "ALLOW" }] };
    expect(firewallRows(p, short)).toHaveLength(p.rules.length);
    expect(firewallRows(p, short)[0]).toEqual({ port: "443", action: "ALLOW" });
  });

  it("builds a full-length answer from one cell and clears to null", () => {
    const n = pbq5.rules.length;
    const v = setFirewallCell(undefined, n, 1, "port", pbq5.portChoices[1]!);
    expect(v).toEqual({
      kind: "firewall",
      rules: Array.from({ length: n }, (_, i) =>
        i === 1 ? { port: "22", action: null } : { port: null, action: null },
      ),
    });
    expect(setFirewallCell(v ?? undefined, n, 1, "port", "")).toBeNull();
  });

  it("labels rules and actions", () => {
    expect(ruleLabel("5", 0)).toBe("5a");
    expect(ruleLabel("B5", 3)).toBe("B5d");
    expect(pbq5.actionChoices.map(actionLabel)).toEqual(["Allow", "Deny"]);
  });
});

describe("network diagram", () => {
  it("reads PBQ 5's networks out of the ASCII art", () => {
    expect(parseNetworkDiagram(pbq5.diagram)).toEqual({
      firewall: "Firewall",
      sources: [
        { name: "Internet", address: null },
        { name: "Admin LAN", address: "192.168.10.0/24" },
      ],
      zones: [
        { zone: "DMZ", host: "web01", address: "10.1.1.10", note: "HTTPS website" },
        { zone: "DB zone", host: "db01", address: "10.1.2.20", note: "MySQL" },
      ],
    });
  });

  it("reads B5's networks", () => {
    const net = parseNetworkDiagram(payloads[1]![1].diagram);
    expect(net?.zones).toEqual([
      { zone: "DMZ", host: "mail01", address: "10.1.1.25", note: "SMTP, IMAPS" },
    ]);
    expect(describeDiagram(net!)).toBe(
      "Internet and Admin LAN (192.168.10.0/24) connect through the firewall to DMZ: mail01 10.1.1.25 (SMTP, IMAPS).",
    );
  });

  it("returns null for text it can't read (shown as text instead)", () => {
    expect(parseNetworkDiagram("just some words")).toBeNull();
    expect(parseNetworkDiagram("A ──► something odd")).toBeNull();
  });

  const overlaps = (a: DiagramBox, b: DiagramBox) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it.each([true, false])("lays boxes out inside the view box without overlap (wide %s)", (wide) => {
    for (const [, p] of payloads) {
      const net = parseNetworkDiagram(p.diagram)!;
      const l = diagramLayout(net, wide);
      expect(l.boxes).toHaveLength(net.sources.length + net.zones.length + 1);
      for (const b of l.boxes) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.y).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(l.width);
        expect(b.y + b.h).toBeLessThanOrEqual(l.height);
      }
      l.boxes.forEach((a, i) =>
        l.boxes.slice(i + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
      );
      expect(l.links.every((d) => /^M[\d. L-]+$/.test(d))).toBe(true);
    }
  });
});
