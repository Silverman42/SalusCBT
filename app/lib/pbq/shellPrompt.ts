/**
 * Shell transcript helpers shared by the hashCheck and permissions PBQs.
 * Artefacts are plain text such as `analyst@web01:~$ ls -l /etc` followed by
 * the command's output; these split them into lines to style, never to
 * render as HTML (SE-6).
 */

/** `user@host:path$ command` (or `#` for root). */
const PROMPT = /^(\S+@[^\s:]+:[^$#\n]*[$#])(?: (.*))?$/;

export function splitPrompt(line: string): { prompt: string; command: string } | null {
  const m = PROMPT.exec(line);
  return m ? { prompt: m[1] ?? "", command: m[2] ?? "" } : null;
}

export type TerminalLine =
  | { kind: "prompt"; prompt: string; command: string }
  | { kind: "comment"; text: string }
  | { kind: "output"; text: string };

/** Lines of a transcript, each tagged as a prompt, a `#` comment or output. */
export function terminalLines(text: string): TerminalLine[] {
  return text.split("\n").map((line): TerminalLine => {
    const p = splitPrompt(line);
    if (p) return { kind: "prompt", ...p };
    if (line.trimStart().startsWith("#")) return { kind: "comment", text: line };
    return { kind: "output", text: line };
  });
}

/** The file a transcript `cat`s, e.g. `/etc/ssh/sshd_config`, or null. */
export function catTarget(text: string): string | null {
  for (const line of text.split("\n")) {
    const m = /^cat\s+(\S+)\s*$/.exec(splitPrompt(line)?.command ?? "");
    if (m) return m[1] ?? null;
  }
  return null;
}
