// sshLog generator (LLD §10.3, T-604): an auth.log with one SSH brute force.
//
// The attacker comes from a documentation range (203.0.113.0/24 or
// 198.51.100.0/24) and fails 40–60 times before one `Accepted password`.
// Decoys: a scanner from another documentation range (a handful of invalid
// users), an internal user who mistypes a password before logging in, plus
// benign cron and publickey lines. The key is computed from the generated
// text by `sshLogAnswers`, not tracked while generating.

import type { PbqKey, TextPart } from "../../shared/content";
import {
  Rand,
  clock,
  partId,
  randomDate,
  syslogDate,
  type GeneratorOptions,
  type Generated,
} from "./common";

/** RFC 5737 documentation ranges; the attacker uses one of the first two. */
export const ATTACKER_RANGES = ["203.0.113", "198.51.100"] as const;
const SCANNER_RANGES = ["203.0.113", "198.51.100", "192.0.2"] as const;

const HOSTS = ["web01", "web02", "app01", "api01", "vpn01", "bastion01"];
const ADMINS = ["adaeze", "tunde", "ngozi", "emeka", "amara", "kelechi"];
const STAFF = ["chidi", "ifeoma", "segun", "funmi", "obinna", "zainab"];
const TARGETS = ["backup", "svc_web", "deploy", "git", "jenkins", "svc_backup", "oracle"];
const SCANNER_USERS = ["test", "admin", "pi", "ftpuser", "guest", "user", "support"];
const SPRAY_USERS = ["admin", "test", "ubuntu", "oracle", "postgres", "user", "ftpuser", "mysql"];

export const PRACTICE_COMMAND =
  "grep 'Failed password' auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr";

type Event = { at: number; proc: "sshd" | "CRON"; text: string };

/** Answers derived from an auth.log text (also used by editor validation, ED-2). */
export type SshLogAnswers = { ip: string; account: string; failures: number };

const FAILED = /\bFailed password for (?:invalid user )?\S+ from (\d{1,3}(?:\.\d{1,3}){3}) port /;
const ACCEPTED = /\bAccepted password for (\S+) from (\d{1,3}(?:\.\d{1,3}){3}) port /;

/**
 * Work out the expected answers from the log text: the source with the most
 * `Failed password` lines, the account it got into with `Accepted password`,
 * and how many `Failed password` lines it produced. Returns null when there is
 * no unique top source or it never logged in.
 */
export function sshLogAnswers(log: string): SshLogAnswers | null {
  const failures = new Map<string, number>();
  const accepted = new Map<string, string>();
  for (const line of log.split("\n")) {
    const f = FAILED.exec(line);
    if (f) failures.set(f[1]!, (failures.get(f[1]!) ?? 0) + 1);
    const a = ACCEPTED.exec(line);
    if (a && !accepted.has(a[2]!)) accepted.set(a[2]!, a[1]!);
  }
  const ranked = [...failures].sort((x, y) => y[1] - x[1]);
  const top = ranked[0];
  if (!top || ranked[1]?.[1] === top[1]) return null;
  const account = accepted.get(top[0]);
  return account ? { ip: top[0], account, failures: top[1] } : null;
}

function hostIp(r: Rand, prefix: string, taken: Set<string>): string {
  for (;;) {
    const ip = `${prefix}.${r.int(2, 254)}`;
    if (!taken.has(ip)) {
      taken.add(ip);
      return ip;
    }
  }
}

const port = (r: Rand) => r.int(30000, 64999);

const session = (user: string, uid: number) =>
  `pam_unix(sshd:session): session opened for user ${user}(uid=${uid}) by (uid=0)`;

export function generateSshLog(seed: number, options?: GeneratorOptions): Generated<"sshLog"> {
  const r = new Rand(seed);
  const host = r.pick(HOSTS);
  const date = randomDate(r);
  const admin = r.pick(ADMINS);
  const staff = r.pick(STAFF);
  const target = r.pick(TARGETS);
  const taken = new Set<string>();
  const attackerRange = r.pick(ATTACKER_RANGES);
  const attacker = hostIp(r, attackerRange, taken);
  const scanner = hostIp(r, r.pick(SCANNER_RANGES), taken);
  const adminIp = `10.0.2.${r.int(10, 60)}`;
  const staffIp = hostIp(r, `10.0.${r.int(3, 9)}`, taken);
  const keyType = r.pick(["ED25519", "RSA", "ECDSA"]);
  const fingerprint = Array.from({ length: 6 }, () =>
    r.pick("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".split("")),
  ).join("");
  const adminUid = r.int(1002, 1010);
  const targetUid = r.int(1011, 1099);

  const events: Event[] = [];
  const start = r.int(1, 3) * 3600 + r.int(30, 50) * 60 + r.int(0, 59); // 01:30–03:50
  const end = start + r.int(55, 70) * 60;

  // Benign: cron every ~7 minutes, admin logging in with a key every ~19 minutes.
  for (let t = start + r.int(0, 60); t < end; t += r.int(380, 470)) {
    events.push({
      at: t,
      proc: "CRON",
      text: "pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)",
    });
  }
  for (let t = start + r.int(240, 420); t < end; t += r.int(1000, 1250)) {
    events.push({
      at: t,
      proc: "sshd",
      text: `Accepted publickey for ${admin} from ${adminIp} port ${port(r)} ssh2: ${keyType} SHA256:${fingerprint}...`,
    });
    events.push({ at: t + 1, proc: "sshd", text: session(admin, adminUid) });
  }

  // Decoy 1: a scanner trying a few default accounts, never succeeding.
  let t = start + r.int(560, 720);
  for (let i = r.int(8, 14); i > 0; i--) {
    const user = r.pick(SCANNER_USERS);
    const p = port(r);
    events.push({ at: t, proc: "sshd", text: `Invalid user ${user} from ${scanner} port ${p}` });
    events.push({
      at: t + 1,
      proc: "sshd",
      text: `Failed password for invalid user ${user} from ${scanner} port ${p} ssh2`,
    });
    t += r.int(3, 8);
  }

  // Decoy 2: an internal user mistyping their password, then getting in.
  t += r.int(180, 300);
  for (let i = r.int(1, 3); i > 0; i--) {
    events.push({
      at: t,
      proc: "sshd",
      text: `Failed password for ${staff} from ${staffIp} port ${port(r)} ssh2`,
    });
    t += r.int(10, 16);
  }
  events.push({
    at: t,
    proc: "sshd",
    text: `Accepted password for ${staff} from ${staffIp} port ${port(r)} ssh2`,
  });

  // The attack: 40–60 failures over common usernames, the target and root.
  t += r.int(420, 600);
  const failures = r.int(40, 60);
  const targetShare = 0.25 + r.float() * 0.15;
  for (let i = 0; i < failures; i++) {
    const p = port(r);
    const roll = i >= failures - 4 ? 0 : r.float(); // the last few go at the target
    if (roll < targetShare) {
      events.push({
        at: t,
        proc: "sshd",
        text: `Failed password for ${target} from ${attacker} port ${p} ssh2`,
      });
    } else if (roll < targetShare + 0.1) {
      events.push({
        at: t,
        proc: "sshd",
        text: `Failed password for root from ${attacker} port ${p} ssh2`,
      });
    } else {
      const user = r.pick(SPRAY_USERS.filter((u) => u !== target));
      events.push({ at: t, proc: "sshd", text: `Invalid user ${user} from ${attacker} port ${p}` });
      t += 1;
      events.push({
        at: t,
        proc: "sshd",
        text: `Failed password for invalid user ${user} from ${attacker} port ${p} ssh2`,
      });
    }
    t += r.int(1, 6);
  }
  t += r.int(1, 5);
  events.push({
    at: t,
    proc: "sshd",
    text: `Accepted password for ${target} from ${attacker} port ${port(r)} ssh2`,
  });
  events.push({ at: t + 1, proc: "sshd", text: session(target, targetUid) });

  // Stable sort by time, then number the processes in order.
  const day = syslogDate(date);
  let cronPid = r.int(1200, 2400);
  let sshPid = cronPid + r.int(8, 12);
  const lines = [`analyst@${host}:~$ cat /var/log/auth.log`];
  for (const e of events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at || a.i - b.i)) {
    const { at, proc, text } = e.e;
    const pid = proc === "CRON" ? cronPid++ : sshPid++;
    lines.push(`${day} ${clock(at)} ${host} ${proc}[${pid}]: ${text}`);
  }
  const log = lines.join("\n");

  const id = (letter: string) => partId("sshLog", options, letter);
  const parts: TextPart[] = [
    {
      id: id("a"),
      prompt: "Source IP address of the brute-force attack?",
      kind: "ip",
      scored: true,
    },
    {
      id: id("b"),
      prompt: "Account the attacker successfully logged in to?",
      kind: "text",
      scored: true,
    },
    {
      id: id("c"),
      prompt: "Number of `Failed password` entries from that IP?",
      kind: "integer",
      scored: true,
    },
    {
      id: id("d"),
      prompt: "Write a one-line command that counts failed logins per source IP.",
      kind: "text",
      scored: false,
    },
  ];

  const answers = sshLogAnswers(log);
  if (!answers || answers.ip !== attacker || answers.account !== target) {
    throw new Error(`sshLog generator produced an ambiguous log for seed ${seed}`);
  }
  const key: PbqKey = {
    parts: {
      [id("a")]: answers.ip,
      [id("b")]: answers.account,
      [id("c")]: String(answers.failures),
    },
    practice: { [id("d")]: PRACTICE_COMMAND },
  };

  const explanation =
    `Count failures per source with: grep 'Failed password' /var/log/auth.log | awk '{print $(NF-3)}' | sort | uniq -c | sort -nr. ` +
    `${answers.ip} leads with ${answers.failures} failures (the other sources are a small scanner and a user mistyping a password). ` +
    `Note that grep '${answers.ip}' | wc -l over-counts, because 'Invalid user' lines also contain the IP. ` +
    `Then grep 'Accepted' shows 'Accepted password for ${answers.account}' from the same IP right after the attempts, so that account is compromised. ` +
    "In a real incident: disable the account, end its sessions, block the IP, and review what the session did.";

  return {
    template: "sshLog",
    payload: {
      template: "sshLog",
      intro: `A SIEM alert for repeated SSH login failures fired on \`${host}\`. Below is \`/var/log/auth.log\`.`,
      log,
      parts,
    },
    key,
    points: 3,
    explanation,
  };
}
