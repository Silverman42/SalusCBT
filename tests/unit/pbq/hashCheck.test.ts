import { describe, expect, it } from "vitest";
import seed from "../../../content/seed/sy0-701.json";
import { alignHashes, parseHashListing } from "../../../app/lib/pbq/hashCheck";
import { mcqPartOptions, partText, withPartText } from "../../../app/lib/pbq/partAnswers";
import type { PayloadOf } from "../../../shared/content";

const payloads = (seed.questions as { displayNumber: string; payload?: { template: string } }[])
  .filter((q) => q.payload?.template === "hashCheck")
  .map((q) => [q.displayNumber, q.payload as PayloadOf<"hashCheck">] as const);

describe("hash listings", () => {
  it("covers PBQ 3 and B3", () => {
    expect(payloads.map(([n]) => n)).toEqual(["3", "B3"]);
  });

  it.each(payloads)("aligns vendor and computed hashes by file name (%s)", (_, p) => {
    const rows = alignHashes(p.vendorHashes, p.computed);
    expect(rows).not.toBeNull();
    const pick = p.parts.find((x) => x.kind === "pick")!;
    expect(rows!.map((r) => r.file)).toEqual(pick.choices);
    for (const r of rows!) {
      // Full 64-character SHA-256 on both sides: never truncated.
      expect(r.vendor).toMatch(/^[0-9a-f]{64}$/);
      expect(r.computed).toMatch(/^[0-9a-f]{64}$/);
      expect(p.vendorHashes).toContain(`${r.vendor}  ${r.file}`);
      expect(p.computed).toContain(`${r.computed}  ${r.file}`);
    }
  });

  it("keeps the command line apart from the entries", () => {
    const l = parseHashListing("me@ws:~$ sha256sum a.bin\n" + "ab".repeat(32) + " *a.bin\n");
    expect(l).toEqual({
      command: "sha256sum a.bin",
      entries: [{ hash: "ab".repeat(32), file: "a.bin" }],
      unparsed: [],
    });
  });

  it("aligns out-of-order files and keeps files only one side has", () => {
    const h = (c: string) => c.repeat(64);
    const rows = alignHashes(`${h("a")}  one\n${h("b")}  two`, `${h("b")}  two\n${h("c")}  three`);
    expect(rows).toEqual([
      { file: "one", vendor: h("a"), computed: null },
      { file: "two", vendor: h("b"), computed: h("b") },
      { file: "three", vendor: null, computed: h("c") },
    ]);
  });

  it("gives up (raw text shown) when a line doesn't parse", () => {
    expect(alignHashes("not a hash line", `${"a".repeat(64)}  one`)).toBeNull();
    expect(alignHashes("me@ws:~$ cat x", "me@ws:~$ cat y")).toBeNull();
  });
});

describe("hashCheck answers", () => {
  it("stores the picked file and MCQ option ids as given", () => {
    let v = withPartText(undefined, "3a", "backup-tool-1.8.deb");
    v = withPartText(v ?? undefined, "3b", "B");
    expect(v).toEqual({ kind: "pbq", parts: { "3a": "backup-tool-1.8.deb", "3b": "B" } });
    expect(partText(v ?? undefined, "3b")).toBe("B");
    expect(partText(v ?? undefined, "3c")).toBe("");
  });

  it("is null once every part is cleared", () => {
    const v = withPartText(undefined, "3a", "backup-tool-1.8.deb");
    expect(withPartText(v ?? undefined, "3a", "")).toBeNull();
  });

  it("keeps MCQ part options in paper order with their ids", () => {
    const part = {
      id: "3c",
      prompt: "",
      kind: "mcq" as const,
      options: [
        { id: "C", text: "Availability" },
        { id: "A", text: "Confidentiality" },
        { id: "B", text: "Integrity" },
      ],
    };
    expect(mcqPartOptions(part)).toEqual([
      { id: "C", text: "Availability", letter: "A" },
      { id: "A", text: "Confidentiality", letter: "B" },
      { id: "B", text: "Integrity", letter: "C" },
    ]);
  });
});
