# T-303 · PbqNmap component (insecure services)

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-213](../stage-2-exam-engine/T-213-exam-runner-ui.md) |
| Requirements | `PB-1`, `QA-2` |
| Design refs | LLD §14.4 |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

nmap output where each port row can be picked.

## Steps

- Render `nmap -sV` output as a table.
- Click or Enter on a row fills the focused answer.
- `portPair` parts get two inputs (cleartext first, secure second).

## Files

- `app/components/pbq/PbqNmap.vue`

## Acceptance criteria

- [x] Row picking works with keyboard only.

## Notes

- `app/components/pbq/PbqNmap.vue`. The mockup has no nmap screen, so it follows screen 03: the scan in the dark panel (title taken from the prompt line, e.g. `nmap -sV 10.0.5.20`, and "N open ports"), answers on the right. The text before and after the PORT table stays as monospace text; the rows are parsed by `parseNmapScan` (`app/lib/pbq/nmap.ts`). With no PORT table the whole scan shows as text and ports are typed.
- Picking: the target is the answer input focused last (the first input at the start), shown with a brand border and named in the hint above the scan ("…to fill 2b"). Click a row, or Enter / Space on its port button, to write the port there; the target then moves to the next empty input (wrapping). The rows are one Tab stop (roving tabindex; ↑ ↓ Home End). A polite live region says "Port 23 entered in 2a. Next: 2b." Rows holding an answer are tinted and show badges (`2a`, `B2a secure`).
- `portPair` parts (B2a, B2b) get two inputs, "Cleartext port" then "Secure port", each labelled by the part prompt plus its side (`aria-labelledby`). The answer is `[cleartext, secure]`, `[]` once both are cleared, and the whole value is `null` when every input is empty. Ports can always be typed, since a secure port in the answer may not be open on the host (B2a: 995).
- Typing emits `{ debounce: true }`; picks emit without debounce. No client-side trimming (marking normalises). `readOnly` disables inputs and turns the rows into plain text; the scan region is then focusable (`tabindex="0"`) for keyboard scrolling.
- Tests: `tests/unit/pbq-nmap.test.ts` (seed scans A and B parsed, fallback without a table, slot order, portPair ordering and emptying, next-target logic, row badges).
