// permissions generator (LLD §10.3, T-605): `ls -l` listings + sshd_config.
//
// Starts from the PBQ 4 listings. One sensitive file in /etc (`shadow`,
// `gshadow` or `sudoers`) is made world-readable or world-writable; its
// correct mode comes from `SECURE_MODES`. The user's private key is readable
// by others (key: 600), and one risky sshd directive is set to `yes`.

import type { PbqKey, TextPart } from "../../shared/content";
import {
  Rand,
  clockHm,
  partId,
  randomDate,
  syslogDate,
  type GeneratorOptions,
  type Generated,
} from "./common";

export type SensitiveFile = "shadow" | "gshadow" | "sudoers";

/** Correct octal mode and group for each sensitive file. */
export const SECURE_MODES: Record<SensitiveFile, { mode: string; group: string; why: string }> = {
  shadow: { mode: "640", group: "shadow", why: "owner read/write, group read, others nothing" },
  gshadow: { mode: "640", group: "shadow", why: "owner read/write, group read, others nothing" },
  sudoers: { mode: "440", group: "root", why: "owner read, group read, others nothing" },
};

/** Insecure modes the target file may be given (each lets "others" read or write). */
const INSECURE_MODES: Record<SensitiveFile, string[]> = {
  shadow: ["646", "644", "666", "664"],
  gshadow: ["646", "644", "666", "664"],
  sudoers: ["446", "444", "644", "666"],
};

export const PRIVATE_KEY_MODE = "600";

const DIRECTIVES = [
  {
    name: "PermitRootLogin",
    prompt: "Which `sshd_config` directive should be set to `no` to block direct root logins?",
  },
  {
    name: "PasswordAuthentication",
    prompt:
      "Which `sshd_config` directive should be set to `no` so users can only log in with SSH keys?",
  },
  {
    name: "X11Forwarding",
    prompt:
      "Which `sshd_config` directive should be set to `no` to stop graphical sessions being tunnelled over SSH?",
  },
] as const;

/** `640` → `-rw-r-----`. */
export function symbolic(mode: string, dir = false): string {
  const bits = mode.split("").map(Number);
  return (
    (dir ? "d" : "-") +
    bits.map((b) => `${b & 4 ? "r" : "-"}${b & 2 ? "w" : "-"}${b & 1 ? "x" : "-"}`).join("")
  );
}

type Entry = {
  mode: string;
  dir?: boolean;
  owner: string;
  group: string;
  size: number;
  name: string;
};

function ls(entries: Entry[], stamp: string): string[] {
  return entries.map(
    (e) =>
      `${symbolic(e.mode, e.dir)} ${e.dir ? 2 : 1} ${e.owner.padEnd(8)} ${e.group.padEnd(8)} ${String(e.size).padStart(9)} ${stamp} ${e.name}`,
  );
}

export function generatePermissions(
  seed: number,
  options?: GeneratorOptions,
): Generated<"permissions"> {
  const r = new Rand(seed);
  const host = r.pick(["web01", "web02", "app01", "db01", "files01"]);
  const user = r.pick(["deploy", "ansible", "svc_backup", "jenkins", "git"]);
  const keyFile = r.pick(["id_rsa", "id_ed25519", "id_ecdsa"]);
  const target = r.pick(["shadow", "gshadow", "sudoers"] as const);
  const badMode = r.pick(INSECURE_MODES[target]);
  const keyMode = r.pick(["644", "640", "664", "666"]);
  const directive = r.pick(DIRECTIVES);
  const date = randomDate(r);
  const stamp = `${syslogDate(date)} ${clockHm(r.int(8 * 3600, 17 * 3600))}`;
  const jitter = (n: number) => n + r.int(-12, 12);

  const sensitive: Record<SensitiveFile, Entry> = {
    shadow: { mode: "640", owner: "root", group: "shadow", size: jitter(455), name: "shadow" },
    gshadow: { mode: "640", owner: "root", group: "shadow", size: jitter(380), name: "gshadow" },
    sudoers: { mode: "440", owner: "root", group: "root", size: jitter(66), name: "sudoers" },
  };
  sensitive[target] = { ...sensitive[target], mode: badMode };
  const etc: Entry[] = [
    { mode: "644", owner: "root", group: "root", size: jitter(93), name: "group" },
    sensitive.gshadow,
    { mode: "644", owner: "root", group: "root", size: r.int(5, 10), name: "hostname" },
    { mode: "644", owner: "root", group: "root", size: jitter(342), name: "passwd" },
    sensitive.shadow,
    { mode: "755", dir: true, owner: "root", group: "root", size: 4096, name: "ssh" },
    sensitive.sudoers,
  ];
  const pubSize = keyFile === "id_rsa" ? 566 : keyFile === "id_ed25519" ? 98 : 178;
  const privSize = keyFile === "id_rsa" ? 2602 : keyFile === "id_ed25519" ? 411 : 513;
  const sshDir: Entry[] = [
    { mode: "755", dir: true, owner: user, group: user, size: 4096, name: "." },
    { mode: "755", dir: true, owner: user, group: user, size: 4096, name: ".." },
    { mode: "600", owner: user, group: user, size: pubSize, name: "authorized_keys" },
    { mode: keyMode, owner: user, group: user, size: privSize, name: keyFile },
    { mode: "644", owner: user, group: user, size: pubSize, name: `${keyFile}.pub` },
  ];
  const listings = [
    `analyst@${host}:~$ ls -l /etc`,
    "total 28",
    ...ls(etc, stamp),
    "",
    `analyst@${host}:~$ ls -la /home/${user}/.ssh`,
    "total 20",
    ...ls(sshDir, stamp),
  ].join("\n");

  // The asked-about directive is always `yes`; the others vary.
  const yesNo = (name: string) => (name === directive.name || r.chance(0.5) ? "yes" : "no");
  const sshdConfig = [
    `analyst@${host}:~$ cat /etc/ssh/sshd_config`,
    "# This is the sshd server system-wide configuration file.",
    "# See sshd_config(5) for more information.",
    "Include /etc/ssh/sshd_config.d/*.conf",
    "",
    "Port 22",
    "#AddressFamily any",
    "#ListenAddress 0.0.0.0",
    "",
    `PermitRootLogin ${yesNo("PermitRootLogin")}`,
    `MaxAuthTries ${r.int(3, 6)}`,
    "PubkeyAuthentication yes",
    `PasswordAuthentication ${yesNo("PasswordAuthentication")}`,
    "PermitEmptyPasswords no",
    "KbdInteractiveAuthentication no",
    "UsePAM yes",
    `X11Forwarding ${yesNo("X11Forwarding")}`,
    "PrintMotd no",
    "AcceptEnv LANG LC_*",
    "Subsystem sftp /usr/lib/openssh/sftp-server",
  ].join("\n");

  const secure = SECURE_MODES[target];
  const id = (letter: string) => partId("permissions", options, letter);
  const parts: TextPart[] = [
    {
      id: id("a"),
      prompt: "Which file in `/etc` has dangerously permissive permissions?",
      kind: "path",
      scored: true,
    },
    {
      id: id("b"),
      prompt: `Octal mode for that file (${secure.why})?`,
      kind: "octal",
      scored: true,
    },
    {
      id: id("c"),
      prompt: `Octal mode for the private key \`${keyFile}\`?`,
      kind: "octal",
      scored: true,
    },
    { id: id("d"), prompt: directive.prompt, kind: "directive", scored: true },
  ];
  const key: PbqKey = {
    parts: {
      [id("a")]: `/etc/${target}`,
      [id("b")]: secure.mode,
      [id("c")]: PRIVATE_KEY_MODE,
      [id("d")]: directive.name,
    },
  };

  return {
    template: "permissions",
    payload: {
      template: "permissions",
      intro: `Hardening review of \`${host}\`. Record the fixes you would make.`,
      listings,
      sshdConfig,
      parts,
    },
    key,
    points: 4,
    explanation:
      `ls -l /etc shows /etc/${target} as ${symbolic(badMode)}: other users can read${badMode.endsWith("6") ? " and even modify" : ""} it. ` +
      `It should be ${secure.mode} (${symbolic(secure.mode).slice(1)}, root:${secure.group}). ` +
      `The ${user} user's private key is ${symbolic(keyMode)}, so accounts other than ${user} can read it; SSH private keys must be 600 (chmod 600 /home/${user}/.ssh/${keyFile}). ` +
      `In sshd_config, ${directive.name} yes should be no.`,
  };
}
