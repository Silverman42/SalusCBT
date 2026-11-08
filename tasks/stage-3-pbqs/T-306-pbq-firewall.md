# T-306 · PbqFirewall component (perimeter firewall)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-3`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Network diagram plus a rule table with Port and Action dropdowns.

## Steps

- SVG diagram drawn from the payload's text (no HTML injection).
- Rule table with native `<select>` for port and action per rule.

## Files

- `app/components/pbq/PbqFirewall.vue`

## Acceptance criteria

- [x] Dropdowns are keyboard-operable. (Native `<select>`s, one tab stop each, labelled "Rule 5a Port" / "Rule 5a Action"; visible focus ring.)
- [x] Diagram readable in dark and light themes. (Fills and text use theme tokens: `surface-2`, `brand-soft`/`brand-ink`, `brand`; checked at 375 and 1280 px in both.)

## Tests

- `tests/unit/pbq/firewall.test.ts`: PBQ 5 and B5 give one answer row per payload rule (short saved values padded); a single cell builds a full-length `{ kind: "firewall", rules }` with `null`s and clears back to `null`; rule/action labels; the diagram parser reads PBQ 5 and B5 (sources, firewall, zones with host, address, note) and returns `null` for other text; both layouts keep every box inside the view box with no overlaps; text alternative.

## Notes

- `app/components/pbq/PbqFirewall.vue` and `app/components/pbq/firewall/NetworkDiagram.vue`, wired as `firewall` in `QuestionPbq.vue`. Pure helpers in `app/lib/pbq/firewall.ts` (`firewallRows`, `ruleLabel`, `actionLabel`, `parseNetworkDiagram`, `diagramLayout`, `describeDiagram`); cell edits reuse `setFirewallCell` from `app/lib/examRunner.ts`.
- Diagram: the payload's ASCII art is parsed (lines with `►` are zones: `zone  host  address  (note)`; other text lines are sources; `[ … ]` names the firewall) and drawn as SVG boxes and dashed links as in mockup 04. All labels are SVG text nodes. Two layouts chosen by container width (`@container`, 42 rem): wide (sources | firewall | zones) and a stacked one that keeps text at real size on a phone. The SVG has `role="img"` with a sentence describing the network; the figure is a focusable region; "Diagram as text" shows the original ASCII. Unparseable text falls back to the ASCII `<pre>`.
- Rule table: a real `<table>` with a caption, `th scope="col"` headers and `th scope="row"` rule labels (5a…, B5a… in a retake). Columns Rule / Source / Destination / Protocol / Port / Action (the mockup's "Requirement" column doesn't exist in the payload; requirements are listed in the network card). Under 48 rem of container width the rows become stacked cards; explicit ARIA table roles keep the table semantics when CSS changes `display`.
- Selects show "Choose port" / "Choose action" (dashed) when unset; values are exactly the payload's `portChoices` / `actionChoices` (actions displayed as Allow / Deny). Chosen port is brand-tinted; Allow / Deny get an ok / bad border and soft fill with `text-fg` text (tinted text on the soft fills is below AA, see T-213 notes). Selects emit without `debounce`.
- Hint under the table: "A rule scores only if both port and action are correct" (matches PB-3 in `convex/marking/score.ts`).
- Layout uses container queries rather than viewport breakpoints so it follows the width the runner gives it.
- Read-only disables the selects. Slot `rule-mark` (`{ index }`) adds a Result column for T-309.
