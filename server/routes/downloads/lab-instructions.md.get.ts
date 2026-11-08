import { labInstructionsMarkdown } from "#shared/lab";

// LB-9: the lab instructions (Labs A–D, no answers) as a Markdown download.
export default defineEventHandler((event) => {
  setResponseHeaders(event, {
    "Content-Type": "text/markdown; charset=utf-8",
    "Content-Disposition": 'attachment; filename="secplus-lab-instructions.md"',
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
  });
  return labInstructionsMarkdown();
});
