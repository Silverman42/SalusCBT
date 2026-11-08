import { describe, expect, it } from "vitest";
import type { PbqPayload, PbqTemplate } from "../../../shared/content";
import {
  validateAnswerValue,
  validatePayload,
  validatePbqKey,
  type ValidationResult,
} from "../../../shared/validate";

// Fixtures follow set A of content/source/secplus-701-mock-exam.md (text blocks trimmed).
const fixtures: { [T in PbqTemplate]: Extract<PbqPayload, { template: T }> } = {
  sshLog: {
    template: "sshLog",
    intro:
      "A SIEM alert for repeated SSH login failures fired on `web01`. Below is `/var/log/auth.log`.",
    log: "Nov  3 01:58:01 web01 sshd[1852]: Failed password for invalid user test from 45.155.205.233 port 39663 ssh2",
    parts: [
      {
        id: "1a",
        prompt: "Source IP address of the brute-force attack?",
        kind: "ip",
        scored: true,
      },
      {
        id: "1b",
        prompt: "Account the attacker successfully logged in to?",
        kind: "text",
        scored: true,
      },
      {
        id: "1c",
        prompt: "Number of `Failed password` entries from that IP?",
        kind: "integer",
        scored: true,
      },
      {
        id: "1d",
        prompt: "Write a one-line command that counts failed logins per source IP.",
        kind: "text",
        scored: false,
      },
    ],
  },
  nmap: {
    template: "nmap",
    intro:
      "You scan the in-scope file server to find services that expose credentials or data in cleartext.",
    scan: "PORT     STATE SERVICE      VERSION\n21/tcp   open  ftp          vsftpd 3.0.5\n23/tcp   open  telnet       Linux telnetd",
    parts: [
      {
        id: "2a",
        prompt: "Port offering a cleartext remote shell that should be disabled?",
        kind: "port",
      },
      {
        id: "2b",
        prompt: "Open port administrators should use for remote shell access instead?",
        kind: "port",
      },
      { id: "2c", prompt: "Port transferring files in cleartext?", kind: "port" },
    ],
  },
  hashCheck: {
    template: "hashCheck",
    intro: "Installers are staged for rollout.",
    vendorHashes:
      "6666386a26df62fe5a706bcb5f555297dcb406658c174d450131bd1ff1602bbb  backup-tool-1.8.deb",
    computed:
      "6666388652ab9ee82931f163e11eb66ca7cb7a8b7a6bfc6bbb093ae6a1602bbb  backup-tool-1.8.deb",
    parts: [
      {
        id: "3a",
        prompt: "Which file failed the integrity check?",
        kind: "pick",
        choices: [
          "agent-installer-v4.2.exe",
          "vpn-client-3.1.msi",
          "backup-tool-1.8.deb",
          "pdf-reader-2026.2.exe",
        ],
      },
      {
        id: "3b",
        prompt: "What should you do with that file?",
        kind: "mcq",
        options: [
          { id: "A", text: "Deploy it, because the other three files passed" },
          { id: "B", text: "Quarantine it, report it, and obtain a fresh copy" },
          { id: "C", text: "Rename the file and run sha256sum again" },
          { id: "D", text: "Recalculate the vendor's hash" },
        ],
      },
      {
        id: "3c",
        prompt: "Which security goal does comparing hashes confirm?",
        kind: "mcq",
        options: [
          { id: "A", text: "Confidentiality" },
          { id: "B", text: "Integrity" },
          { id: "C", text: "Availability" },
          { id: "D", text: "Non-repudiation" },
        ],
      },
    ],
  },
  permissions: {
    template: "permissions",
    intro: "Hardening review of `web01`. Record the fixes you would make.",
    listings: "-rw-r--rw- 1 root     shadow         455 Nov  3 09:14 shadow",
    sshdConfig: "PermitRootLogin yes\nPasswordAuthentication yes",
    parts: [
      {
        id: "4a",
        prompt: "Which file in `/etc` has dangerously permissive permissions?",
        kind: "path",
        scored: true,
      },
      { id: "4b", prompt: "Octal mode for that file?", kind: "octal", scored: true },
      { id: "4c", prompt: "Octal mode for the private key `id_rsa`?", kind: "octal", scored: true },
      {
        id: "4d",
        prompt: "Which `sshd_config` directive should be set to `no`?",
        kind: "directive",
        scored: true,
      },
    ],
  },
  firewall: {
    template: "firewall",
    intro: "Rules are processed top to bottom; first match wins.",
    requirements: [
      "Anyone on the internet can reach the website on web01 over HTTPS only.",
      "The admin LAN can manage web01 over SSH.",
      "Only web01 can reach the database on db01.",
      "Everything else is blocked.",
    ],
    diagram: "Internet ──► [ Firewall ]──► DMZ web01 10.1.1.10",
    rules: [
      { source: "Any", destination: "10.1.1.10", protocol: "TCP" },
      { source: "192.168.10.0/24", destination: "10.1.1.10", protocol: "TCP" },
      { source: "10.1.1.10", destination: "10.1.2.20", protocol: "TCP" },
      { source: "Any", destination: "Any", protocol: "TCP" },
    ],
    portChoices: ["Any", "22", "23", "80", "443", "3306", "3389"],
    actionChoices: ["ALLOW", "DENY"],
  },
};

const clone = <T>(value: T): T => structuredClone(value);
const paths = (r: ValidationResult<unknown>) => (r.ok ? [] : r.errors.map((e) => e.path));

describe("validatePayload: valid payloads", () => {
  for (const template of Object.keys(fixtures) as PbqTemplate[]) {
    it(`accepts a ${template} payload`, () => {
      const r = validatePayload(template, fixtures[template]);
      expect(r).toEqual({ ok: true, value: fixtures[template] });
    });
  }

  it("accepts the B2 portPair parts", () => {
    const payload = clone(fixtures.nmap);
    payload.parts = [
      { id: "B2a", prompt: "Cleartext POP3 port and its replacement?", kind: "portPair" },
      {
        id: "B2b",
        prompt: "Cleartext retrieval port with secure equivalent open?",
        kind: "portPair",
      },
      { id: "B2c", prompt: "Port to close so directory queries use LDAPS?", kind: "port" },
    ];
    expect(validatePayload("nmap", payload).ok).toBe(true);
  });
});

describe("validatePayload: invalid payloads", () => {
  it("rejects an sshLog part with an unknown kind", () => {
    const payload = clone(fixtures.sshLog) as unknown as { parts: { kind: string }[] };
    payload.parts[0]!.kind = "ipv6";
    expect(paths(validatePayload("sshLog", payload))).toEqual(["parts[0].kind"]);
  });

  it("rejects an nmap payload with no parts", () => {
    const payload = { ...fixtures.nmap, parts: [] };
    expect(paths(validatePayload("nmap", payload))).toEqual(["parts"]);
  });

  it("rejects a hashCheck payload missing its computed hashes", () => {
    const { computed: _computed, ...payload } = fixtures.hashCheck;
    const r = validatePayload("hashCheck", payload);
    expect(r).toEqual({ ok: false, errors: [{ path: "computed", message: "is required" }] });
  });

  it("rejects a permissions part missing its prompt", () => {
    const payload = clone(fixtures.permissions) as unknown as { parts: Record<string, unknown>[] };
    delete payload.parts[1]!.prompt;
    expect(paths(validatePayload("permissions", payload))).toEqual(["parts[1].prompt"]);
  });

  it("rejects a firewall payload with an action choice outside ALLOW/DENY", () => {
    const payload = { ...fixtures.firewall, actionChoices: ["ALLOW", "REJECT"] };
    expect(paths(validatePayload("firewall", payload))).toEqual(["actionChoices[1]"]);
  });

  it("rejects a payload stored under the wrong template", () => {
    const r = validatePayload("nmap", fixtures.sshLog);
    expect(r.ok).toBe(false);
    expect(paths(r)).toEqual(["template"]);
  });

  it("rejects an unknown template", () => {
    expect(paths(validatePayload("ssh", fixtures.sshLog))).toEqual(["template"]);
  });

  it("rejects a payload missing a whole part of its shape (parts field)", () => {
    const { parts: _parts, ...payload } = fixtures.sshLog;
    expect(paths(validatePayload("sshLog", payload))).toEqual(["parts"]);
  });

  it("rejects duplicate part ids and extra fields", () => {
    const payload = clone(fixtures.nmap) as unknown as Record<string, unknown> & {
      parts: { id: string }[];
    };
    payload.parts[1]!.id = "2a";
    expect(paths(validatePayload("nmap", payload))).toEqual(["parts[1]"]);
    expect(paths(validatePayload("nmap", { ...fixtures.nmap, extra: 1 }))).toEqual(["extra"]);
  });

  it("rejects non-object payloads", () => {
    expect(paths(validatePayload("sshLog", null))).toEqual(["(root)"]);
    expect(paths(validatePayload("sshLog", "text"))).toEqual(["(root)"]);
  });
});

describe("validatePbqKey", () => {
  it("accepts the Part 6 keys", () => {
    expect(
      validatePbqKey(fixtures.sshLog, {
        parts: { "1a": "193.32.162.71", "1b": "backup", "1c": "54" },
        practice: {
          "1d": "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c",
        },
      }).ok,
    ).toBe(true);
    expect(
      validatePbqKey(fixtures.hashCheck, {
        parts: { "3a": "backup-tool-1.8.deb", "3b": "B", "3c": "B" },
      }).ok,
    ).toBe(true);
    expect(
      validatePbqKey(fixtures.firewall, {
        rules: [
          { port: "443", action: "ALLOW" },
          { port: "22", action: "ALLOW" },
          { port: "3306", action: "ALLOW" },
          { port: "Any", action: "DENY" },
        ],
      }).ok,
    ).toBe(true);
  });

  it("rejects a key with a missing scored part, a bad option and an unknown part", () => {
    const r = validatePbqKey(fixtures.hashCheck, {
      parts: { "3a": "backup-tool-1.8.deb", "3b": "E", "3z": "B" },
    });
    expect(paths(r)).toEqual(["parts.3b", "parts.3c", "parts.3z"]);
  });

  it("rejects firewall keys outside the choice lists or with the wrong rule count", () => {
    const r = validatePbqKey(fixtures.firewall, { rules: [{ port: "8080", action: "ALLOW" }] });
    expect(paths(r)).toEqual(["rules", "rules[0].port"]);
    expect(paths(validatePbqKey(fixtures.firewall, { parts: {} }))).toEqual(["rules"]);
  });

  it("requires portPair keys to be two ports", () => {
    const payload = clone(fixtures.nmap);
    payload.parts[0] = { id: "2a", prompt: "pair", kind: "portPair" };
    expect(
      paths(validatePbqKey(payload, { parts: { "2a": "110", "2b": "22", "2c": "21" } })),
    ).toEqual(["parts.2a"]);
    expect(
      validatePbqKey(payload, { parts: { "2a": ["110", "995"], "2b": "22", "2c": "21" } }).ok,
    ).toBe(true);
  });
});

describe("validateAnswerValue", () => {
  it("accepts each answer kind", () => {
    expect(validateAnswerValue({ kind: "mcq", optionIds: ["A", "B"] }).ok).toBe(true);
    expect(
      validateAnswerValue({ kind: "pbq", parts: { "1a": "193.32.162.71", B2a: ["110", "995"] } })
        .ok,
    ).toBe(true);
    expect(
      validateAnswerValue({ kind: "firewall", rules: [{ port: "443", action: null }] }).ok,
    ).toBe(true);
  });

  it("rejects malformed answers", () => {
    expect(validateAnswerValue({ kind: "mcq", optionIds: "A" }).ok).toBe(false);
    expect(validateAnswerValue({ kind: "pbq", parts: { "1a": 54 } }).ok).toBe(false);
    expect(validateAnswerValue({ kind: "essay", text: "x" }).ok).toBe(false);
  });
});
