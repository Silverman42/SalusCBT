/**
 * Firewall PBQ (T-306): answer rows and the network diagram. Pure: no Vue.
 *
 * The payload's diagram is ASCII art such as
 *
 *     Internet ──┐
 *                ▼
 *           [ Firewall ]──► DMZ        web01  10.1.1.10  (HTTPS website)
 *                │
 *     Admin LAN 192.168.10.0/24
 *
 * `parseNetworkDiagram` reads the networks out of it as text and
 * `diagramLayout` places them as boxes for an SVG; nothing is rendered as
 * HTML (SE-6). When the text doesn't follow that shape the component shows
 * it as-is.
 */
import type { AnswerValue, PayloadOf } from "../../../shared/content";

export type FirewallCell = { port: string | null; action: string | null };

/** One row per payload rule, whatever was saved (missing cells are null). */
export function firewallRows(
  payload: PayloadOf<"firewall">,
  value: AnswerValue | undefined,
): FirewallCell[] {
  const saved = value?.kind === "firewall" ? value.rules : [];
  return payload.rules.map((_, i) => ({
    port: saved[i]?.port ?? null,
    action: saved[i]?.action ?? null,
  }));
}

/** Rule label after the display number: 5a, 5b … (B5a … in a retake). */
export function ruleLabel(displayNumber: string, index: number): string {
  return `${displayNumber}${String.fromCharCode(97 + index)}`;
}

/** Display text for an action value (the stored value stays ALLOW / DENY). */
export function actionLabel(action: string): string {
  if (action === "ALLOW") return "Allow";
  if (action === "DENY") return "Deny";
  return action;
}

// ---------------------------------------------------------------------------
// Network diagram
// ---------------------------------------------------------------------------

export type NetworkSource = { name: string; address: string | null };
export type NetworkZone = { zone: string; host: string; address: string; note: string | null };
export type NetworkDiagram = {
  firewall: string;
  sources: NetworkSource[];
  zones: NetworkZone[];
};

const ADDRESS = String.raw`\d{1,3}(?:\.\d{1,3}){3}(?:\/\d{1,2})?`;
/** After the arrow: `DMZ        web01  10.1.1.10  (HTTPS website)`. */
const ZONE = new RegExp(String.raw`^(.+?)\s{2,}(\S+)\s+(${ADDRESS})(?:\s+\((.+)\))?$`);
const SOURCE = new RegExp(String.raw`^(.*?)\s+(${ADDRESS})$`);
const BOX_DRAWING = /[─-╿←-⇿▲-◄]/g; // ─│┐├ ▼ ► ← …

export function parseNetworkDiagram(text: string): NetworkDiagram | null {
  let firewall = "Firewall";
  const sources: NetworkSource[] = [];
  const zones: NetworkZone[] = [];
  for (const raw of text.split("\n")) {
    let line = raw;
    const box = /\[\s*([^\]]*?)\s*\]/.exec(line);
    if (box) {
      if (box[1]) firewall = box[1];
      line = line.replace(box[0], " ");
    }
    const arrow = line.lastIndexOf("►");
    if (arrow !== -1) {
      const m = ZONE.exec(line.slice(arrow + 1).trim());
      if (!m) return null;
      zones.push({ zone: m[1]!, host: m[2]!, address: m[3]!, note: m[4] ?? null });
      continue;
    }
    const rest = line.replace(BOX_DRAWING, " ").replace(/\s+/g, " ").trim();
    if (!rest) continue;
    const m = SOURCE.exec(rest);
    sources.push(m && m[1] ? { name: m[1], address: m[2]! } : { name: rest, address: null });
  }
  if (!sources.length || !zones.length) return null;
  return { firewall, sources, zones };
}

export type DiagramBox = {
  kind: "source" | "firewall" | "zone";
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  subtitle: string | null;
};
export type DiagramLayout = { width: number; height: number; boxes: DiagramBox[]; links: string[] };

const BOX_H = 64;
const GAP = 14;
const PAD = 10;
const FW_W = 150;

const sourceBox = (s: NetworkSource): Pick<DiagramBox, "kind" | "title" | "subtitle"> => ({
  kind: "source",
  title: s.name,
  subtitle: s.address,
});
const zoneBox = (z: NetworkZone): Pick<DiagramBox, "kind" | "title" | "subtitle"> => ({
  kind: "zone",
  title: `${z.zone} · ${z.host}`,
  subtitle: z.note ? `${z.address} · ${z.note}` : z.address,
});
const stackHeight = (n: number) => n * BOX_H + (n - 1) * GAP;

/**
 * Box positions and connector paths (SVG `d` strings) in viewBox units.
 * `wide`: sources left, firewall centre, zones right (mockup screen 04).
 * Narrow: sources on top, firewall, then the zones stacked below, so the
 * text stays at its real size on a phone.
 */
export function diagramLayout(net: NetworkDiagram, wide: boolean): DiagramLayout {
  const boxes: DiagramBox[] = [];
  const links: string[] = [];

  if (wide) {
    const width = 820;
    const rows = Math.max(net.sources.length, net.zones.length);
    const height = stackHeight(rows) + 2 * PAD;
    const mid = height / 2;
    const fw: DiagramBox = {
      kind: "firewall",
      x: 335,
      y: mid - BOX_H / 2,
      w: FW_W,
      h: BOX_H,
      title: net.firewall,
      subtitle: null,
    };
    const top = (n: number) => (height - stackHeight(n)) / 2;
    net.sources.forEach((s, i) => {
      const y = top(net.sources.length) + i * (BOX_H + GAP);
      boxes.push({ ...sourceBox(s), x: PAD, y, w: 230, h: BOX_H });
      links.push(`M${PAD + 230} ${y + BOX_H / 2} L${fw.x} ${mid}`);
    });
    net.zones.forEach((z, i) => {
      const y = top(net.zones.length) + i * (BOX_H + GAP);
      boxes.push({ ...zoneBox(z), x: 560, y, w: width - 560 - PAD, h: BOX_H });
      links.push(`M${fw.x + FW_W} ${mid} L560 ${y + BOX_H / 2}`);
    });
    boxes.push(fw);
    return { width, height, boxes, links };
  }

  const width = 340;
  const inner = width - 2 * PAD;
  const LINK = 30;
  let y = PAD;
  const side = net.sources.length <= 2; // two sources fit side by side
  const sw = side ? (inner - (net.sources.length - 1) * 12) / net.sources.length : inner;
  const fwX = (width - FW_W) / 2;
  const sourceBottoms: { x: number; y: number }[] = [];
  net.sources.forEach((s, i) => {
    const box = side
      ? { x: PAD + i * (sw + 12), y, w: sw, h: BOX_H }
      : { x: PAD, y: y + i * (BOX_H + GAP), w: inner, h: BOX_H };
    boxes.push({ ...sourceBox(s), ...box });
    sourceBottoms.push({ x: box.x + box.w / 2, y: box.y + BOX_H });
  });
  y += side ? BOX_H : stackHeight(net.sources.length);
  y += LINK;
  const fw: DiagramBox = {
    kind: "firewall",
    x: fwX,
    y,
    w: FW_W,
    h: BOX_H,
    title: net.firewall,
    subtitle: null,
  };
  for (const b of sourceBottoms) {
    links.push(
      side ? `M${b.x} ${b.y} L${width / 2} ${fw.y}` : `M${width / 2} ${b.y} L${width / 2} ${fw.y}`,
    );
  }
  y += BOX_H + LINK;
  // Zones hang off a trunk on the left so no connector runs behind a box.
  const trunkX = PAD + 8;
  const zoneX = PAD + 24;
  const elbowY = fw.y + BOX_H + LINK / 2;
  let lastMid = elbowY;
  net.zones.forEach((z, i) => {
    const zy = y + i * (BOX_H + GAP);
    boxes.push({ ...zoneBox(z), x: zoneX, y: zy, w: width - zoneX - PAD, h: BOX_H });
    links.push(`M${trunkX} ${zy + BOX_H / 2} L${zoneX} ${zy + BOX_H / 2}`);
    lastMid = zy + BOX_H / 2;
  });
  links.push(
    `M${width / 2} ${fw.y + BOX_H} L${width / 2} ${elbowY} L${trunkX} ${elbowY} L${trunkX} ${lastMid}`,
  );
  boxes.push(fw);
  const height = y + stackHeight(net.zones.length) + PAD;
  return { width, height, boxes, links };
}

/** Text alternative for the drawn diagram (the SVG's accessible name). */
export function describeDiagram(net: NetworkDiagram): string {
  const from = net.sources.map((s) => (s.address ? `${s.name} (${s.address})` : s.name));
  const to = net.zones.map(
    (z) => `${z.zone}: ${z.host} ${z.address}${z.note ? ` (${z.note})` : ""}`,
  );
  return `${from.join(" and ")} connect through the ${net.firewall.toLowerCase()} to ${to.join("; ")}.`;
}
