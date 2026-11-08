import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { AnswerValue, PayloadOf, PortPart } from "../../shared/content";
import {
  nextEmptySlot,
  parseNmapScan,
  portSlots,
  scanTitle,
  setSlot,
  slotLabel,
  slotValue,
  slotsHoldingPort,
} from "../../app/lib/pbq/nmap";

type SeedQuestion = { displayNumber: string; payload?: { template: string } };
const seed = JSON.parse(readFileSync("content/seed/sy0-701.json", "utf8")) as {
  questions: SeedQuestion[];
};
const nmapPayload = (n: string) =>
  seed.questions.find((q) => q.displayNumber === n)?.payload as PayloadOf<"nmap">;

const PARTS: PortPart[] = [
  { id: "B2a", prompt: "POP3", kind: "portPair" },
  { id: "B2b", prompt: "IMAP", kind: "portPair" },
  { id: "B2c", prompt: "LDAP", kind: "port" },
];
const pbq = (parts: Record<string, string | string[]>): AnswerValue => ({ kind: "pbq", parts });

describe("parseNmapScan", () => {
  it("parses the set A scan into seven port rows around the text", () => {
    const scan = parseNmapScan(nmapPayload("2").scan);
    expect(scan.header).toMatch(/^PORT\s+STATE\s+SERVICE\s+VERSION$/);
    expect(scan.rows.map((r) => r.port)).toEqual(["21", "22", "23", "80", "139", "445", "3306"]);
    expect(scan.rows[2]).toEqual({
      port: "23",
      protocol: "tcp",
      state: "open",
      service: "telnet",
      version: "Linux telnetd",
    });
    expect(scan.before[0]).toBe("analyst@kali:~$ nmap -sV 10.0.5.20");
    expect(scan.after[0]).toMatch(/^Service Info:/);
    expect(scanTitle(scan)).toBe("nmap -sV 10.0.5.20");
  });

  it("parses the set B scan, including ssl/ services", () => {
    const scan = parseNmapScan(nmapPayload("B2").scan);
    expect(scan.rows.map((r) => r.port)).toEqual([
      "22",
      "25",
      "110",
      "143",
      "389",
      "443",
      "636",
      "993",
    ]);
    expect(scan.rows.find((r) => r.port === "993")?.service).toBe("ssl/imap");
  });

  it("keeps every line when there is no PORT table", () => {
    const scan = parseNmapScan("Nmap done: 0 hosts up\n");
    expect(scan).toEqual({ before: ["Nmap done: 0 hosts up"], header: null, rows: [], after: [] });
    expect(scanTitle(scan)).toBe("nmap -sV");
  });

  it("accepts a row with no version", () => {
    const scan = parseNmapScan("PORT STATE SERVICE\n53/udp open domain\nend");
    expect(scan.rows).toEqual([
      { port: "53", protocol: "udp", state: "open", service: "domain", version: "" },
    ]);
    expect(scan.after).toEqual(["end"]);
  });
});

describe("slots", () => {
  it("lists one input per port part and two per portPair, cleartext first", () => {
    expect(portSlots(PARTS)).toEqual([
      { partId: "B2a", side: 0 },
      { partId: "B2a", side: 1 },
      { partId: "B2b", side: 0 },
      { partId: "B2b", side: 1 },
      { partId: "B2c", side: 0 },
    ]);
    expect(slotLabel(PARTS, { partId: "B2a", side: 1 })).toBe("B2a secure");
    expect(slotLabel(PARTS, { partId: "B2c", side: 0 })).toBe("B2c");
  });

  it("reads slot values from the answer", () => {
    const v = pbq({ B2a: ["110", "995"], B2c: "389" });
    expect(slotValue(v, { partId: "B2a", side: 1 })).toBe("995");
    expect(slotValue(v, { partId: "B2c", side: 0 })).toBe("389");
    expect(slotValue(v, { partId: "B2b", side: 0 })).toBe("");
    expect(slotValue(undefined, { partId: "B2a", side: 0 })).toBe("");
  });
});

describe("setSlot", () => {
  const [pairA, , single] = PARTS as [PortPart, PortPart, PortPart];

  it("keeps portPair order [cleartext, secure] whichever side is set first", () => {
    const v1 = setSlot(undefined, pairA, 1, "995");
    expect(v1).toEqual(pbq({ B2a: ["", "995"] }));
    const v2 = setSlot(v1 ?? undefined, pairA, 0, "110");
    expect(v2).toEqual(pbq({ B2a: ["110", "995"] }));
  });

  it("stores an emptied pair as [] and returns null when everything is empty", () => {
    const v = setSlot(pbq({ B2a: ["110", ""] }), pairA, 0, "");
    expect(v).toBeNull();
    const w = setSlot(pbq({ B2a: ["110", ""], B2c: "389" }), pairA, 0, "");
    expect(w).toEqual(pbq({ B2a: [], B2c: "389" }));
  });

  it("sets a port part as a string and leaves typing untrimmed (the server normalises)", () => {
    expect(setSlot(undefined, single, 0, " 389 ")).toEqual(pbq({ B2c: " 389 " }));
    expect(setSlot(pbq({ B2c: "389" }), single, 0, "")).toBeNull();
  });
});

describe("nextEmptySlot", () => {
  it("moves to the next empty input, wrapping, or stays when all are filled", () => {
    const from = { partId: "B2a", side: 0 } as const;
    expect(nextEmptySlot(PARTS, pbq({ B2a: ["110", ""] }), from)).toEqual({
      partId: "B2a",
      side: 1,
    });
    expect(
      nextEmptySlot(PARTS, pbq({ B2a: ["110", "995"], B2b: ["143", "993"] }), {
        partId: "B2b",
        side: 1,
      }),
    ).toEqual({ partId: "B2c", side: 0 });
    expect(nextEmptySlot(PARTS, pbq({ B2c: "389" }), { partId: "B2c", side: 0 })).toEqual(from);
    const full = pbq({ B2a: ["110", "995"], B2b: ["143", "993"], B2c: "389" });
    expect(nextEmptySlot(PARTS, full, { partId: "B2b", side: 0 })).toEqual({
      partId: "B2b",
      side: 0,
    });
  });
});

describe("slotsHoldingPort", () => {
  it("labels every input holding the port", () => {
    const v = pbq({ B2a: ["110", "995"], B2b: ["143", "993"], B2c: " 389" });
    expect(slotsHoldingPort(PARTS, v, "389")).toEqual(["B2c"]);
    expect(slotsHoldingPort(PARTS, v, "993")).toEqual(["B2b secure"]);
    expect(slotsHoldingPort(PARTS, v, "22")).toEqual([]);
  });
});
