// nmap generator (LLD §10.3, T-604): an `nmap -sV` scan of one in-scope host.
//
// The host is a file server (cleartext shell + cleartext file transfer, like
// PBQ 2) or a mail and directory server (cleartext POP3/IMAP/LDAP, like
// PBQ B2). Open services are sampled from a table of
// `{ port, service, version, cleartext, secure }`; every scenario contains
// exactly one service of each kind the parts ask about, and the key ports are
// read from the chosen table rows.

import type { PbqKey, PortPart } from "../../shared/content";
import {
  Rand,
  isoDate,
  clockHm,
  partId,
  randomDate,
  type GeneratorOptions,
  type Generated,
} from "./common";

export type Service = {
  port: number;
  service: string;
  version: string;
  /** What a cleartext service exposes; undefined for encrypted or out-of-scope services. */
  cleartext?: "shell" | "file" | "pop3" | "imap" | "ldap";
  /** Port of the encrypted replacement, for cleartext services. */
  secure?: number;
};

const OPENSSH = "OpenSSH 9.6p1 Ubuntu 3ubuntu13.5 (Ubuntu Linux; protocol 2.0)";

/** Service table the scenarios sample from. */
export const SERVICES = {
  ssh: { port: 22, service: "ssh", version: OPENSSH },
  telnet: {
    port: 23,
    service: "telnet",
    version: "Linux telnetd",
    cleartext: "shell",
    secure: 22,
  },
  rlogin: { port: 513, service: "login", version: "", cleartext: "shell", secure: 22 },
  ftp: { port: 21, service: "ftp", version: "vsftpd 3.0.5", cleartext: "file", secure: 22 },
  proftpd: { port: 21, service: "ftp", version: "ProFTPD 1.3.8", cleartext: "file", secure: 22 },
  http: { port: 80, service: "http", version: "nginx 1.24.0 (Ubuntu)" },
  apache: { port: 80, service: "http", version: "Apache httpd 2.4.58 ((Ubuntu))" },
  https: { port: 443, service: "ssl/http", version: "nginx 1.24.0" },
  rpcbind: { port: 111, service: "rpcbind", version: "2-4 (RPC #100000)" },
  netbios: { port: 139, service: "netbios-ssn", version: "Samba smbd 4.6.2" },
  smb: { port: 445, service: "netbios-ssn", version: "Samba smbd 4.6.2" },
  nfs: { port: 2049, service: "nfs_acl", version: "3 (RPC #100227)" },
  mysql: { port: 3306, service: "mysql", version: "MySQL 8.0.39-0ubuntu0.24.04.2" },
  postgres: { port: 5432, service: "postgresql", version: "PostgreSQL DB 16.4 - 16.6" },
  smtp: { port: 25, service: "smtp", version: "Postfix smtpd" },
  submission: { port: 587, service: "smtp", version: "Postfix smtpd" },
  pop3: { port: 110, service: "pop3", version: "Dovecot pop3d", cleartext: "pop3", secure: 995 },
  imap: { port: 143, service: "imap", version: "Dovecot imapd", cleartext: "imap", secure: 993 },
  pop3s: { port: 995, service: "ssl/pop3", version: "Dovecot pop3d" },
  imaps: { port: 993, service: "ssl/imap", version: "Dovecot imapd" },
  ldap: {
    port: 389,
    service: "ldap",
    version: "OpenLDAP 2.2.X - 2.3.X",
    cleartext: "ldap",
    secure: 636,
  },
  ldaps: { port: 636, service: "ssl/ldap", version: "OpenLDAP 2.2.X - 2.3.X" },
} satisfies Record<string, Service>;

type Scenario = {
  host: string;
  ip: string;
  /** Text after `Service Info: `. */
  serviceInfo: string;
  intro: string;
  services: Service[];
  parts: { prompt: string; kind: PortPart["kind"]; answer: string | string[] }[];
  explanation: string;
};

const S = SERVICES;

function fileServer(r: Rand): Scenario {
  const shell = r.pick([S.telnet, S.rlogin]);
  const file = r.pick([S.ftp, S.proftpd]);
  const groups: Service[][] = [
    [r.pick([S.http, S.apache])],
    [S.https],
    [S.rpcbind],
    [S.netbios, S.smb],
    [S.nfs],
    [S.mysql],
    [S.postgres],
  ];
  const extras = r.subset(groups, r.int(3, 5)).flat();
  const services = dedupe([file, S.ssh, shell, ...extras]);
  const ip = `10.0.${r.int(4, 9)}.${r.int(10, 60)}`;
  const shellName = shell === S.telnet ? "telnet" : "rlogin";
  return {
    host: r.pick(["fileserver01", "fileserver02", "files01", "nas01", "share01"]),
    ip,
    serviceInfo: "OS: Linux; CPE: cpe:/o:linux:linux_kernel",
    intro:
      "You scan the in-scope file server to find services that expose credentials or data in cleartext.",
    services,
    parts: [
      {
        prompt: "Port offering a cleartext remote shell that should be disabled?",
        kind: "port",
        answer: String(shell.port),
      },
      {
        prompt: "Open port administrators should use for remote shell access instead?",
        kind: "port",
        answer: String(shell.secure),
      },
      {
        prompt: "Port transferring files in cleartext that should be replaced with SFTP or FTPS?",
        kind: "port",
        answer: String(file.port),
      },
    ],
    explanation:
      `nmap -sV ${ip} shows ${shellName} on ${shell.port} (cleartext shell, replace with SSH on ${shell.secure}) and FTP on ${file.port} ` +
      "(cleartext credentials and files, replace with SFTP over 22 or FTPS). For extra credit in a real report: " +
      "database and file-sharing ports should not be reachable from the whole subnet.",
  };
}

function mailServer(r: Rand): Scenario {
  // One retrieval protocol is "used today" with its secure port closed; the
  // other already has its secure equivalent open.
  const [today, other] = r.shuffle([S.pop3, S.imap]) as [Service, Service];
  const secureOther = other === S.pop3 ? S.pop3s : S.imaps;
  const name = (s: Service) => (s === S.pop3 ? "POP3" : "IMAP");
  const extras = r.subset([S.smtp, S.submission, S.https, S.http], r.int(2, 3));
  const services = dedupe([S.ssh, S.ldap, S.ldaps, today, other, secureOther, ...extras]);
  const host = r.pick(["mail01", "mail02", "mx01", "mx02", "post01"]);
  return {
    host,
    ip: `10.0.${r.int(4, 9)}.${r.int(10, 60)}`,
    serviceInfo: `Host: ${host}; OS: Linux`,
    intro:
      "You scan the company mail and directory server. Policy: no credentials may cross the network in cleartext.",
    services,
    parts: [
      {
        prompt: `Staff read mail with ${name(today)} today. Which open port carries it in cleartext, and which port should they use instead?`,
        kind: "portPair",
        answer: [String(today.port), String(today.secure)],
      },
      {
        prompt:
          "Which cleartext mail retrieval port has a secure equivalent already open on this server, and what is that secure port?",
        kind: "portPair",
        answer: [String(other.port), String(other.secure)],
      },
      {
        prompt: "Which port should be closed so directory queries only use LDAPS?",
        kind: "port",
        answer: String(S.ldap.port),
      },
    ],
    explanation:
      `${today.port} is cleartext ${name(today)}; use ${today.secure} (${name(today)}S). Note ${today.secure} is not open yet, so it needs enabling. ` +
      `${other.port} (${name(other)}) has its secure equivalent ${other.secure} (${name(other)}S) already open. ` +
      "Close 389 so directory traffic uses LDAPS on 636.",
  };
}

/** Sort by port and drop repeated ports (first wins). */
function dedupe(services: Service[]): Service[] {
  const seen = new Set<number>();
  return services
    .filter((s) => !seen.has(s.port) && seen.add(s.port))
    .sort((a, b) => a.port - b.port);
}

/** Render `nmap -sV` output for the open services. */
function renderScan(
  r: Rand,
  { host, ip, services, serviceInfo }: Scenario,
  date: string,
  time: string,
): string {
  const portCol = Math.max(8, ...services.map((s) => `${s.port}/tcp`.length)) + 1;
  const svcCol = Math.max(7, ...services.map((s) => s.service.length)) + 2;
  const row = (p: string, state: string, svc: string, ver: string) =>
    `${p.padEnd(portCol)}${state.padEnd(6)}${svc.padEnd(svcCol)}${ver}`.trimEnd();
  return [
    `analyst@kali:~$ nmap -sV ${ip}`,
    `Starting Nmap 7.94 ( https://nmap.org ) at ${date} ${time} WAT`,
    `Nmap scan report for ${host} (${ip})`,
    `Host is up (0.00${r.int(5, 19).toString().padStart(2, "0")}s latency).`,
    `Not shown: ${1000 - services.length} closed tcp ports (reset)`,
    row("PORT", "STATE", "SERVICE", "VERSION"),
    ...services.map((s) => row(`${s.port}/tcp`, "open", s.service, s.version)),
    `Service Info: ${serviceInfo}`,
    "",
    "Service detection performed. Please report any incorrect results at https://nmap.org/submit/ .",
    `Nmap done: 1 IP address (1 host up) scanned in ${r.int(8, 19)}.${r.int(10, 99)} seconds`,
  ].join("\n");
}

export function generateNmap(seed: number, options?: GeneratorOptions): Generated<"nmap"> {
  const r = new Rand(seed);
  const scenario = r.chance(0.5) ? fileServer(r) : mailServer(r);
  const date = isoDate(randomDate(r));
  const time = clockHm(r.int(8 * 3600, 17 * 3600));
  const scan = renderScan(r, scenario, date, time);

  const letters = ["a", "b", "c"];
  const parts: PortPart[] = scenario.parts.map((p, i) => ({
    id: partId("nmap", options, letters[i]!),
    prompt: p.prompt,
    kind: p.kind,
  }));
  const key: PbqKey = {
    parts: Object.fromEntries(scenario.parts.map((p, i) => [parts[i]!.id, p.answer])),
  };
  return {
    template: "nmap",
    payload: { template: "nmap", intro: scenario.intro, scan, parts },
    key,
    points: parts.length,
    explanation: scenario.explanation,
  };
}
