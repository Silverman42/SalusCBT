// Content and answer shapes shared by app/, convex/ and scripts/ (LLD §3.2).
// Runtime validators for these types live in ./validate.ts.

export type PbqTemplate = PbqPayload["template"];

export type PbqPayload =
  | { template: "sshLog"; intro: string; log: string; parts: TextPart[] } // 1a–1c scored, 1d practice
  | { template: "nmap"; intro: string; scan: string; parts: PortPart[] }
  | {
      template: "hashCheck";
      intro: string;
      vendorHashes: string;
      computed: string;
      parts: (PickPart | McqPart)[];
    }
  | {
      template: "permissions";
      intro: string;
      listings: string;
      sshdConfig: string;
      parts: TextPart[];
    }
  | {
      template: "firewall";
      intro: string;
      requirements: string[];
      diagram: string;
      rules: FirewallRuleRow[];
      portChoices: string[];
      actionChoices: FirewallAction[];
    };

/** Payload narrowed to one template, e.g. `PayloadOf<"nmap">`. */
export type PayloadOf<T extends PbqTemplate> = Extract<PbqPayload, { template: T }>;

export type TextPart = {
  id: string;
  prompt: string;
  kind: "ip" | "text" | "integer" | "octal" | "directive" | "path";
  scored: boolean;
};
export type PortPart = { id: string; prompt: string; kind: "port" | "portPair" }; // B2a/B2b ask for two ports
export type PickPart = { id: string; prompt: string; kind: "pick"; choices: string[] };
export type McqPart = {
  id: string;
  prompt: string;
  kind: "mcq";
  options: { id: string; text: string }[];
};

export type PbqPart = TextPart | PortPart | PickPart | McqPart;
export type PartKind = PbqPart["kind"];

export type FirewallAction = "ALLOW" | "DENY";
/** A row of the firewall table as shown to the student (port and action are the blanks). */
export type FirewallRuleRow = { source: string; destination: string; protocol: "TCP" | "UDP" };

export type PbqKey =
  | { parts: Record<string, string | string[]>; practice?: Record<string, string> } // text/port/pick/mcq parts
  | { rules: { port: string; action: FirewallAction }[] }; // firewall

export type AnswerValue =
  | { kind: "mcq"; optionIds: string[] }
  | { kind: "pbq"; parts: Record<string, string | string[]> }
  | { kind: "firewall"; rules: { port: string | null; action: string | null }[] };
