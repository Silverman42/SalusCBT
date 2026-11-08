// Shell builtins for the terminal lab (T-702): cd, pwd, echo, clear, help,
// true, false. Error wording follows bash (`bash: cd: …`).

import type { CommandContext, CommandSpec } from "../command";
import { VfsError } from "../vfs";

function bashError(ctx: CommandContext, message: string, code = 1): number {
  ctx.stderr.write(`bash: ${ctx.name}: ${message}\n`);
  return code;
}

export const cd: CommandSpec = {
  name: "cd",
  summary: "change directory (cd, cd ~, cd .., cd -)",
  run(ctx) {
    const args = [...ctx.args];
    if (args[0] === "--") args.shift();
    if (args.length > 1) return bashError(ctx, "too many arguments");
    const arg = args[0];
    if (arg !== undefined && arg.length > 1 && arg.startsWith("-")) {
      bashError(ctx, `${arg.slice(0, 2)}: invalid option`, 2);
      ctx.stderr.write("cd: usage: cd [-L|[-P [-e]] [-@]] [dir]\n");
      return 2;
    }
    if (arg === "") return 0; // bash: `cd ""` does nothing
    let target: string;
    if (arg === undefined) {
      const home = ctx.env.get("HOME");
      if (!home) return bashError(ctx, "HOME not set");
      target = home;
    } else if (arg === "-") {
      const old = ctx.env.get("OLDPWD");
      if (!old) return bashError(ctx, "OLDPWD not set");
      target = old;
    } else {
      target = arg;
    }
    const before = ctx.vfs.cwd;
    try {
      ctx.vfs.chdir(target);
    } catch (err) {
      if (err instanceof VfsError) return bashError(ctx, `${target}: ${err.message}`);
      throw err;
    }
    ctx.env.set("OLDPWD", before);
    if (arg === "-") ctx.stdout.write(`${ctx.vfs.cwd}\n`);
    return 0;
  },
};

export const pwd: CommandSpec = {
  name: "pwd",
  summary: "print the current directory",
  run(ctx) {
    const bad = ctx.args.find((a) => a.startsWith("-") && a !== "-L" && a !== "-P");
    if (bad) {
      bashError(ctx, `${bad.slice(0, 2)}: invalid option`, 2);
      ctx.stderr.write("pwd: usage: pwd [-LP]\n");
      return 2;
    }
    ctx.stdout.write(`${ctx.vfs.cwd}\n`);
    return 0;
  },
};

const SIMPLE_ESCAPES: Record<string, string> = {
  "\\": "\\",
  a: "\x07",
  b: "\b",
  e: "\x1b",
  E: "\x1b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
  v: "\v",
};

/** bash `echo -e` escapes. Returns the text and whether `\c` stopped output. */
function unescape(s: string): { text: string; stop: boolean } {
  let out = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    const n = s[i + 1];
    if (c !== "\\" || n === undefined) {
      out += c;
      continue;
    }
    if (n === "c") return { text: out, stop: true };
    const simple = SIMPLE_ESCAPES[n];
    if (simple !== undefined) {
      out += simple;
      i++;
    } else if (n === "0") {
      const m = /^[0-7]{0,3}/.exec(s.slice(i + 2))![0];
      out += String.fromCharCode(parseInt(m || "0", 8));
      i += 1 + m.length;
    } else if (n === "x" && /^[0-9A-Fa-f]/.test(s.slice(i + 2))) {
      const m = /^[0-9A-Fa-f]{1,2}/.exec(s.slice(i + 2))![0];
      out += String.fromCharCode(parseInt(m, 16));
      i += 1 + m.length;
    } else {
      out += c;
    }
  }
  return { text: out, stop: false };
}

export const echo: CommandSpec = {
  name: "echo",
  summary: "print its arguments (-n, -e)",
  run(ctx) {
    const args = [...ctx.args];
    let newline = true;
    let escapes = false;
    // Like bash: leading words made only of n/e/E after `-` are options.
    while (args[0] !== undefined && /^-[neE]+$/.test(args[0])) {
      for (const c of args.shift()!.slice(1)) {
        if (c === "n") newline = false;
        else escapes = c === "e";
      }
    }
    let text = args.join(" ");
    if (escapes) {
      const r = unescape(text);
      text = r.text;
      if (r.stop) newline = false;
    }
    ctx.stdout.write(newline ? `${text}\n` : text);
    return 0;
  },
};

export const clear: CommandSpec = {
  name: "clear",
  summary: "clear the screen",
  run(ctx) {
    ctx.shell.clear();
    return 0;
  },
};

export const help: CommandSpec = {
  name: "help",
  summary: "list the commands in this lab",
  run(ctx) {
    const specs = ctx.shell.commands();
    const width = Math.max(...specs.map((s) => s.name.length));
    const lines = [
      "Commands in this lab:",
      ...specs.map((s) => `  ${s.name.padEnd(width)}  ${s.summary}`),
      "",
      "Shell features: pipes (a | b), a ; b, a && b, a || b, > >> < 2> redirects,",
      "'single' and \"double\" quotes, * ? [...] globs, ~, $HOME and $?.",
      "Use the up and down arrows to recall earlier commands.",
    ];
    ctx.stdout.write(lines.join("\n") + "\n");
    return 0;
  },
};

export const trueCommand: CommandSpec = {
  name: "true",
  summary: "do nothing, successfully",
  run: () => 0,
};

export const falseCommand: CommandSpec = {
  name: "false",
  summary: "do nothing, unsuccessfully",
  run: () => 1,
};

export const BUILTINS: CommandSpec[] = [cd, pwd, echo, clear, help, trueCommand, falseCommand];
