// firewall generator (LLD §10.3, T-605): fill in Port and Action per rule.
//
// A web scenario (HTTPS website, SSH admin, database behind the web server,
// like PBQ 5) or a mail scenario (SMTP, encrypted retrieval, SSH admin, like
// PBQ B5). The three allow rules come in a seeded order, the port choices are
// the answers plus distractors, and the last rule is always `Any / DENY`.

import type { FirewallAction, FirewallRuleRow, PbqKey } from "../../shared/content";
import { Rand, type GeneratorOptions, type Generated } from "./common";

type Allow = {
  requirement: string;
  source: string;
  destination: string;
  port: string;
  /** Short reason, used in the explanation. */
  label: string;
};

type Scenario = {
  allows: Allow[];
  diagram: string;
  /** Wrong ports always offered (the obvious mistakes). */
  traps: string[];
  /** Wrong ports sampled to fill the list up to seven choices. */
  distractors: string[];
  why: string;
};

const DATABASES = [
  { name: "MySQL", port: "3306" },
  { name: "PostgreSQL", port: "5432" },
  { name: "SQL Server", port: "1433" },
];

const RETRIEVAL = [
  { req: "encrypted IMAP only", port: "993", short: "IMAPS", cleartext: ["143", "110"] },
  { req: "encrypted POP3 only", port: "995", short: "POP3S", cleartext: ["110", "143"] },
];

function webScenario(r: Rand, adminLan: string): Scenario {
  const web = `10.1.${r.int(1, 9)}.${r.int(10, 99)}`;
  const db = `10.1.${r.int(10, 19)}.${r.int(10, 99)}`;
  const webName = r.pick(["web01", "web02", "www01", "shop01"]);
  const dbName = r.pick(["db01", "db02", "sql01"]);
  const dbms = r.pick(DATABASES);
  const allows: Allow[] = [
    {
      requirement: `Anyone on the internet can reach the website on ${webName} over HTTPS only.`,
      source: "Any",
      destination: web,
      port: "443",
      label: `HTTPS (443) from anywhere to ${webName}`,
    },
    {
      requirement: `The admin LAN can manage ${webName} over SSH.`,
      source: adminLan,
      destination: web,
      port: "22",
      label: `SSH (22) from the admin LAN to ${webName}`,
    },
    {
      requirement: `Only ${webName} can reach the database on ${dbName}.`,
      source: web,
      destination: db,
      port: dbms.port,
      label: `${dbms.name} (${dbms.port}) only from ${webName} to ${dbName}`,
    },
  ];
  const pad = (s: string) => s.padEnd(6);
  const diagram = [
    "  Internet ──┐",
    "             ▼",
    `        [ Firewall ]──► DMZ        ${pad(webName)} ${web.padEnd(10)} (HTTPS website)`,
    "             │",
    `             ├────────► DB zone    ${pad(dbName)} ${db.padEnd(10)} (${dbms.name})`,
    "             │",
    `  Admin LAN ${adminLan}`,
  ].join("\n");
  return {
    allows,
    diagram,
    traps: ["80"],
    distractors: ["23", "3389", "21", "8080", "445"],
    why: `Opening port 80 (cleartext HTTP), or allowing ${dbms.port} from Any, would fail the requirements.`,
  };
}

function mailScenario(r: Rand, adminLan: string): Scenario {
  const mail = `10.1.${r.int(1, 9)}.${r.int(10, 99)}`;
  const name = r.pick(["mail01", "mail02", "mx01"]);
  const retrieval = r.pick(RETRIEVAL);
  const allows: Allow[] = [
    {
      requirement: `Mail from anywhere can be delivered to ${name} with SMTP.`,
      source: "Any",
      destination: mail,
      port: "25",
      label: `SMTP (25) from anywhere to ${name}`,
    },
    {
      requirement: `Staff anywhere can read mail on ${name} over ${retrieval.req}.`,
      source: "Any",
      destination: mail,
      port: retrieval.port,
      label: `${retrieval.short} (${retrieval.port}) from anywhere to ${name}`,
    },
    {
      requirement: `The admin LAN can manage ${name} over SSH.`,
      source: adminLan,
      destination: mail,
      port: "22",
      label: `SSH (22) from the admin LAN to ${name}`,
    },
  ];
  const diagram = [
    "  Internet ──┐",
    "             ▼",
    `        [ Firewall ]──► DMZ   ${name.padEnd(7)} ${mail}  (SMTP, ${retrieval.short})`,
    "             │",
    `  Admin LAN ${adminLan}`,
  ].join("\n");
  return {
    allows,
    diagram,
    traps: retrieval.cleartext,
    distractors: ["23", "3389", "80"],
    why: `Allowing ${retrieval.cleartext.join(" or ")} would fail the "${retrieval.req}" requirement.`,
  };
}

const byPort = (a: string, b: string) =>
  a === "Any" ? -1 : b === "Any" ? 1 : Number(a) - Number(b);

export function generateFirewall(seed: number, _options?: GeneratorOptions): Generated<"firewall"> {
  const r = new Rand(seed);
  const adminLan = `192.168.${r.int(10, 99)}.0/24`;
  const scenario = r.chance(0.5) ? webScenario(r, adminLan) : mailScenario(r, adminLan);
  const allows = r.shuffle(scenario.allows);

  const answers = allows.map((a) => a.port);
  // Any + three answers + three wrong ports, like the source PBQs.
  const wrong = [...scenario.traps, ...r.sample(scenario.distractors, 3 - scenario.traps.length)];
  const portChoices = [...new Set(["Any", ...answers, ...wrong])].sort(byPort);

  const rules: FirewallRuleRow[] = [
    ...allows.map((a) => ({
      source: a.source,
      destination: a.destination,
      protocol: "TCP" as const,
    })),
    { source: "Any", destination: "Any", protocol: "TCP" },
  ];
  const keyRules: { port: string; action: FirewallAction }[] = [
    ...allows.map((a) => ({ port: a.port, action: "ALLOW" as const })),
    { port: "Any", action: "DENY" },
  ];
  const key: PbqKey = { rules: keyRules };

  const ruleList = allows.map((a, i) => `rule ${i + 1}: ${a.label}`).join("; ");
  return {
    template: "firewall",
    payload: {
      template: "firewall",
      intro:
        "Rules are processed top to bottom; first match wins. Fill in **Port** and **Action** for each rule.",
      requirements: [...allows.map((a) => a.requirement), "Everything else is blocked."],
      diagram: scenario.diagram,
      rules,
      portChoices,
      actionChoices: ["ALLOW", "DENY"],
    },
    key,
    points: rules.length,
    explanation:
      `Allow only what is needed (${ruleList}), and finish with a deny Any/Any rule (implicit deny). ` +
      scenario.why,
  };
}
