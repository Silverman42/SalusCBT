import { describe, expect, it } from "vitest";
import seed from "../../../content/seed/sy0-701.json";
import { partText, withPartText } from "../../../app/lib/pbq/partAnswers";
import { catTarget, splitPrompt, terminalLines } from "../../../app/lib/pbq/shellPrompt";
import type { PayloadOf } from "../../../shared/content";

const payloads = (seed.questions as { displayNumber: string; payload?: { template: string } }[])
  .filter((q) => q.payload?.template === "permissions")
  .map((q) => [q.displayNumber, q.payload as PayloadOf<"permissions">] as const);

describe("terminal transcripts", () => {
  it("covers PBQ 4 and B4 with path, octal, octal, directive parts", () => {
    expect(payloads.map(([n]) => n)).toEqual(["4", "B4"]);
    for (const [, p] of payloads) {
      expect(p.parts.map((x) => x.kind)).toEqual(["path", "octal", "octal", "directive"]);
    }
  });

  it("splits prompts from commands", () => {
    expect(splitPrompt("analyst@web01:~$ ls -l /etc")).toEqual({
      prompt: "analyst@web01:~$",
      command: "ls -l /etc",
    });
    expect(splitPrompt("root@db:/var/log# tail x")).toEqual({
      prompt: "root@db:/var/log#",
      command: "tail x",
    });
    expect(splitPrompt("-rw-r--r-- 1 root root 93 Nov  3 09:14 group")).toBeNull();
  });

  it.each(payloads)("tags every line and keeps the text (%s)", (_, p) => {
    for (const text of [p.listings, p.sshdConfig]) {
      const lines = terminalLines(text);
      expect(lines).toHaveLength(text.split("\n").length);
      const back = lines.map((l) => (l.kind === "prompt" ? `${l.prompt} ${l.command}` : l.text));
      expect(back.join("\n")).toBe(text);
    }
    const ls = terminalLines(p.listings).filter((l) => l.kind === "prompt");
    expect(ls.map((l) => l.kind === "prompt" && l.command)).toEqual([
      "ls -l /etc",
      "ls -la /home/deploy/.ssh",
    ]);
    const sshd = terminalLines(p.sshdConfig);
    expect(
      sshd.find((l) => l.kind === "output" && l.text.startsWith("PermitRootLogin")),
    ).toBeTruthy();
    expect(sshd.filter((l) => l.kind === "comment").length).toBeGreaterThan(0);
    expect(catTarget(p.sshdConfig)).toBe("/etc/ssh/sshd_config");
    expect(catTarget(p.listings)).toBeNull();
  });
});

describe("permissions answers", () => {
  it("stores what was typed (marking accepts 640 and 0640)", () => {
    let v = withPartText(undefined, "4a", "/etc/shadow");
    v = withPartText(v ?? undefined, "4b", "640");
    v = withPartText(v ?? undefined, "4c", "0600");
    expect(v).toEqual({ kind: "pbq", parts: { "4a": "/etc/shadow", "4b": "640", "4c": "0600" } });
    expect(partText(v ?? undefined, "4d")).toBe("");
  });

  it("is null when every blank is empty", () => {
    let v = withPartText(undefined, "4b", "6");
    v = withPartText(v ?? undefined, "4d", "PermitRootLogin");
    v = withPartText(v ?? undefined, "4b", "");
    expect(v).not.toBeNull();
    expect(withPartText(v ?? undefined, "4d", "")).toBeNull();
  });

  it("reads nothing from a firewall or missing answer", () => {
    expect(partText(undefined, "4a")).toBe("");
    expect(partText({ kind: "firewall", rules: [] }, "4a")).toBe("");
    expect(partText({ kind: "pbq", parts: { "4a": ["x"] } }, "4a")).toBe("");
  });
});
