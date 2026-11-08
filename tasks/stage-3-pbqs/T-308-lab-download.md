# T-308 · Lab download: build-lab.sh and Lab D instructions

| | |
| --- | --- |
| Stage | 3 · Interactive PBQs |
| Depends on | [T-001](../stage-0-decisions/T-001-add-source-content.md) |
| Requirements | `LB-9` |
| Design refs | PRD Scope table; LLD §14.1 (`/lab`) |
| Status | Tracked in [TRACKER.md](../TRACKER.md) |

## Goal

Ship the lab script as a download for the MVP.

## Steps

- Serve `build-lab.sh` and Lab D instructions from a server route with `Content-Disposition: attachment`.
- Show a warning to scan only machines you own.
- Simple `/lab` page with download + instructions (terminal comes in Stage 7).

## Files

- `server/routes/downloads/build-lab.sh.get.ts`
- `app/pages/lab.vue`

## Acceptance criteria

- [x] Download works; warning visible before the link.

## Notes

- LB-9 moved to Stage 3 in the PRD release plan (2026-11-08), so it ships with the MVP.
- `build-lab.sh` is bundled as a Nitro server asset (`nitro.serverAssets`, base `lab`, `pattern: "build-lab.sh"`), so it works on Netlify functions and the exam markdown with its answer key is never bundled (SE-1). The production bundle stores `.sh` as bytes, so the route reads it with `getItemRaw` and decodes it. Checked with `npm run build` + `node .output/server/index.mjs`: body matches the source byte for byte.
- Lab instructions (Labs A–D, no answers, Lab C pass values left out) are hand-written in `shared/lab.ts` from Part 5. The page renders them, and `/downloads/lab-instructions.md` serves the same text as a Markdown download.
- Extra file: `app/components/lab/InlineCode.vue` renders `backtick` code in instruction text.
