// LB-9: serve the practice lab script as a download. The file is bundled as a
// Nitro server asset (see nitro.serverAssets in nuxt.config.ts), so only
// build-lab.sh is reachable here, never the exam markdown.
export default defineEventHandler(async (event) => {
  // Dev reads the file from disk (string); the production bundle stores `.sh` as
  // bytes (Uint8Array), so decode either form.
  const raw = await useStorage("assets:lab").getItemRaw<string | Uint8Array>("build-lab.sh");
  const script = raw instanceof Uint8Array ? new TextDecoder().decode(raw) : raw;
  if (typeof script !== "string" || script.length === 0) {
    throw createError({ statusCode: 404, statusMessage: "Lab script not found" });
  }

  setResponseHeaders(event, {
    "Content-Type": "text/x-shellscript; charset=utf-8",
    "Content-Disposition": 'attachment; filename="build-lab.sh"',
    "X-Content-Type-Options": "nosniff",
    "Cache-Control": "public, max-age=3600",
  });
  return script;
});
