// Runs command lines in the terminal lab (T-702, LLD §13.1).
//
// `Shell.run(line)` parses the line (lexer.ts), expands each word (variables,
// `~`, globs), wires redirections and pipes, and runs each command from the
// registry with stdin → stdout/stderr and an exit status. Pipeline stages run
// one after another (each sees the previous stage's whole output), which gives
// the same results as bash for the lab's commands. Commands may be async
// (sha256sum uses Web Crypto).
//
// Everything is bounded by ShellLimits: line length, commands per line, stages
// per pipeline, arguments, glob matches, bytes per pipe/file and bytes shown on
// screen. Nothing here can reach a real shell or the network.

import { CommandRegistry, type CommandContext, type CommandSpec, type ShellEnv } from "./command";
import { DEFAULT_COMMANDS } from "./commands";
import { expandGlob, GlobLimitError, hasGlob, type PatternChar } from "./glob";
import {
  BufferOutput,
  Input,
  NULL_OUTPUT,
  OutputLimitError,
  TerminalOutput,
  type Output,
  type TerminalChunk,
} from "./io";
import {
  parse,
  ShellSyntaxError,
  wordText,
  type Pipeline,
  type Redirect,
  type SimpleCommand,
  type Word,
} from "./lexer";
import { VfsError, type Vfs } from "./vfs";

export interface ShellLimits {
  /** Characters in one command line. */
  maxLineLength: number;
  /** Simple commands run for one line (across ;, && and ||). */
  maxCommandsPerLine: number;
  /** Commands in one pipeline. */
  maxPipeline: number;
  /** Arguments to one command after expansion. */
  maxArgs: number;
  /** Matches from one glob. */
  maxGlobMatches: number;
  /** Bytes through one pipe or into one redirected file. */
  maxPipeBytes: number;
  /** Bytes shown on screen for one command line. */
  maxTerminalBytes: number;
}

export const DEFAULT_LIMITS: ShellLimits = {
  maxLineLength: 4096,
  maxCommandsPerLine: 32,
  maxPipeline: 16,
  maxArgs: 1024,
  maxGlobMatches: 1000,
  // The Lab B installers are 2 MiB, so `cat x.exe | sha256sum` must fit.
  maxPipeBytes: 8 * 1024 * 1024,
  maxTerminalBytes: 256 * 1024,
};

/**
 * Real commands the lab doesn't have: LB-3 says these get a clear "not
 * available in this lab" message rather than bash's "command not found".
 * A registered command always wins, so the LB-2 names listed here (until
 * T-703/T-704 add them) need no clean-up later.
 */
const KNOWN_UNSUPPORTED = new Set(
  (
    "apt apt-get awk bash cat chmod cp cut grep head ls sed sort stat tail uniq wc chgrp chown cksum crontab curl date df diff dig du env exit " +
    "export file find gawk gzip history hostname id ifconfig ip kill less ln locate make man md5sum " +
    "mkdir more mv nano nc netstat nmap openssl perl ping printf ps python python3 rm rmdir scp " +
    "sh sha1sum sha512sum shuf ss ssh sudo su tac tar tee top touch tr unzip vi vim wget which " +
    "whoami xargs zip"
  ).split(" "),
);

export interface RunResult {
  /** Exit status of the last pipeline (what `$?` now holds). */
  code: number;
  /** Screen output in write order; a `clear` chunk means clear first. */
  chunks: TerminalChunk[];
  /** Convenience: stdout and stderr text after the last clear. */
  stdout: string;
  stderr: string;
  /** True if `clear` ran. */
  cleared: boolean;
  /** True if the screen budget ran out and output was cut. */
  truncated: boolean;
}

export interface ShellOptions {
  vfs: Vfs;
  /** Commands to offer; defaults to DEFAULT_COMMANDS. */
  commands?: CommandRegistry | Iterable<CommandSpec>;
  /** Extra or overriding environment variables. */
  env?: Record<string, string>;
  limits?: Partial<ShellLimits>;
  /** Host name for the prompt. */
  hostname?: string;
}

/** A word that can't be expanded (too many matches, ambiguous redirect). */
class ExpansionError extends Error {}

/** Collects a redirected file's output; written when the command ends. */
class FileOutput extends BufferOutput {
  constructor(
    limit: number,
    readonly path: string,
    readonly append: boolean,
  ) {
    super(limit);
  }
}

const NAME_ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

export class Shell {
  readonly vfs: Vfs;
  readonly registry: CommandRegistry;
  readonly limits: ShellLimits;
  readonly hostname: string;
  /** `$?`. */
  status = 0;
  private readonly vars = new Map<string, string>();
  /** Screen of the line being run. */
  private term: TerminalOutput | undefined;
  readonly env: ShellEnv;

  constructor(options: ShellOptions) {
    this.vfs = options.vfs;
    this.registry =
      options.commands instanceof CommandRegistry
        ? options.commands
        : new CommandRegistry(options.commands ?? DEFAULT_COMMANDS);
    this.limits = { ...DEFAULT_LIMITS, ...options.limits };
    this.hostname = options.hostname ?? "lab";
    const vfs = this.vfs;
    this.vars.set("HOME", vfs.home);
    this.vars.set("USER", vfs.owner);
    this.vars.set("LOGNAME", vfs.owner);
    this.vars.set("SHELL", "/bin/bash");
    this.vars.set("PATH", "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin");
    for (const [k, v] of Object.entries(options.env ?? {})) this.vars.set(k, v);
    this.env = {
      get: (name) =>
        name === "PWD" ? this.vfs.cwd : name === "?" ? String(this.status) : this.vars.get(name),
      set: (name, value) => {
        this.vars.set(name, value);
      },
    };
  }

  /** e.g. `root@lab:~/secplus-lab# ` */
  prompt(): string {
    const user = this.vars.get("USER") ?? "user";
    return `${user}@${this.hostname}:${this.vfs.displayCwd}${user === "root" ? "#" : "$"} `;
  }

  /**
   * Run one command line. Never throws for anything the user types. Await
   * each call before the next (the terminal runs one line at a time).
   */
  async run(line: string): Promise<RunResult> {
    const term = new TerminalOutput(this.limits.maxTerminalBytes);
    let cleared = false;
    this.term = term;

    try {
      await this.runLine(line, term, () => {
        cleared = true;
        term.clear();
      });
    } catch (err) {
      if (!(err instanceof OutputLimitError)) throw err;
    } finally {
      this.term = undefined;
    }
    if (term.truncated) {
      term.note(
        "stderr",
        `\n[output cut: the lab shows at most ${this.limits.maxTerminalBytes} bytes]\n`,
      );
    }
    return {
      code: this.status,
      chunks: term.chunks,
      stdout: term.text("stdout"),
      stderr: term.text("stderr"),
      cleared,
      truncated: term.truncated,
    };
  }

  private async runLine(line: string, term: TerminalOutput, clear: () => void): Promise<void> {
    const err = term.stream("stderr");
    if (line.length > this.limits.maxLineLength) {
      err.write(
        `bash: command line too long (the lab limit is ${this.limits.maxLineLength} characters)\n`,
      );
      this.status = 2;
      return;
    }
    let script;
    try {
      script = parse(line);
    } catch (e) {
      if (!(e instanceof ShellSyntaxError)) throw e;
      err.write(`bash: ${e.message}\n`);
      this.status = 2;
      return;
    }

    const budget = { commands: 0 };
    const shell = {
      clear,
      commands: () => this.registry.list(),
    };
    for (const list of script.lists) {
      await this.runPipeline(list.first, term, shell, budget);
      for (const { op, pipeline } of list.rest) {
        if ((op === "&&") === (this.status === 0)) {
          await this.runPipeline(pipeline, term, shell, budget);
        }
      }
    }
  }

  private async runPipeline(
    pipeline: Pipeline,
    term: TerminalOutput,
    shell: CommandContext["shell"],
    budget: { commands: number },
  ): Promise<void> {
    const err = term.stream("stderr");
    if (pipeline.commands.length > this.limits.maxPipeline) {
      err.write(`bash: pipelines are limited to ${this.limits.maxPipeline} commands in this lab\n`);
      this.status = 2;
      return;
    }
    budget.commands += pipeline.commands.length;
    if (budget.commands > this.limits.maxCommandsPerLine) {
      err.write(
        `bash: one line can run at most ${this.limits.maxCommandsPerLine} commands in this lab\n`,
      );
      this.status = 2;
      return;
    }

    let stdin = new Input("", true);
    let status = 0;
    for (const [i, cmd] of pipeline.commands.entries()) {
      const last = i === pipeline.commands.length - 1;
      const pipe = last ? undefined : new BufferOutput(this.limits.maxPipeBytes);
      status = await this.runCommand(cmd, stdin, pipe ?? term.stream("stdout"), err, shell);
      if (term.truncated) break;
      if (pipe) stdin = new Input(pipe.content(), false);
    }
    this.status = status;
  }

  /** Run one simple command; returns its exit status. */
  private async runCommand(
    cmd: SimpleCommand,
    stdin: Input,
    stdout: Output,
    stderr: Output,
    shell: CommandContext["shell"],
  ): Promise<number> {
    let argv: string[];
    const fds: { in: Input; out: Output; err: Output } = { in: stdin, out: stdout, err: stderr };
    const files: FileOutput[] = [];
    try {
      argv = [];
      for (const word of cmd.words) {
        argv.push(...this.expandWord(word));
        if (argv.length > this.limits.maxArgs + 1) {
          throw new ExpansionError(
            `argument list too long (the lab limit is ${this.limits.maxArgs})`,
          );
        }
      }
      for (const r of cmd.redirects) this.applyRedirect(r, fds, files);
    } catch (e) {
      if (e instanceof ExpansionError) {
        stderr.write(`bash: ${e.message}\n`);
        return 1;
      }
      if (e instanceof VfsError) {
        stderr.write(`bash: ${e.path}: ${e.message}\n`);
        return 1;
      }
      throw e;
    }

    const name = argv[0];
    if (name === undefined) return 0; // only redirections, e.g. `> file`
    const first = cmd.words[0]!;
    if (first[0]?.kind === "text" && !first[0].quoted && NAME_ASSIGNMENT.test(first[0].text)) {
      fds.err.write("bash: variable assignment (NAME=value) is not available in this lab\n");
      return 2;
    }

    const spec = name.includes("/") ? undefined : this.registry.get(name);
    if (!spec) {
      if (name.includes("/") || KNOWN_UNSUPPORTED.has(name)) {
        fds.err.write(
          `bash: ${name}: not available in this lab (type 'help' to list the commands)\n`,
        );
      } else {
        fds.err.write(`bash: ${name}: command not found\n`);
      }
      return 127;
    }

    const ctx: CommandContext = {
      name,
      args: argv.slice(1),
      vfs: this.vfs,
      stdin: fds.in,
      stdout: fds.out,
      stderr: fds.err,
      env: this.env,
      shell,
    };
    let code: number;
    try {
      code = await spec.run(ctx);
    } catch (e) {
      code = this.commandError(e, name, fds.err);
    }
    for (const f of files) {
      try {
        if (f.append) this.vfs.appendFile(f.path, f.content());
        else this.vfs.writeFile(f.path, f.content());
      } catch (e) {
        if (!(e instanceof VfsError)) throw e;
        fds.err.write(`bash: ${e.path}: ${e.message}\n`);
        code = 1;
      }
    }
    return Number.isInteger(code) ? code & 255 : 1;
  }

  private commandError(e: unknown, name: string, stderr: Output): number {
    if (e instanceof OutputLimitError) {
      // The screen budget ran out: stop the whole line (run() adds the notice).
      if (this.term?.truncated) throw e;
      // A pipe or redirected file went over its budget.
      stderr.write(`${name}: output too large for the lab (limit ${e.limit} bytes)\n`);
      return 1;
    }
    if (e instanceof VfsError) {
      stderr.write(`${name}: ${e.path}: ${e.message}\n`);
      return 1;
    }
    const detail = e instanceof Error ? e.message : String(e);
    stderr.write(`${name}: internal error: ${detail}\n`);
    return 1;
  }

  private applyRedirect(
    r: Redirect,
    fds: { in: Input; out: Output; err: Output },
    files: FileOutput[],
  ): void {
    const expanded = this.expandWord(r.target);
    const target = expanded[0];
    if (expanded.length !== 1 || target === undefined || target === "") {
      throw new ExpansionError(`${wordText(r.target)}: ambiguous redirect`);
    }

    if (r.op === "<") {
      if (target === "/dev/null") fds.in = new Input("", false);
      else fds.in = new Input(this.vfs.read(target), false);
      return;
    }
    if (r.op === ">&" && /^\d+$/.test(target)) {
      const from = Number(target);
      if ((from !== 1 && from !== 2) || (r.fd !== 1 && r.fd !== 2)) {
        throw new ExpansionError(`${target}: Bad file descriptor`);
      }
      const src = from === 1 ? fds.out : fds.err;
      if (r.fd === 1) fds.out = src;
      else fds.err = src;
      return;
    }
    const both = r.op === "&>" || r.op === "&>>" || r.op === ">&";
    if (!both && r.fd !== 1 && r.fd !== 2) {
      throw new ExpansionError(
        `${r.fd}${r.op}: only stdout (1) and stderr (2) can be redirected in this lab`,
      );
    }
    let out: Output;
    if (target === "/dev/null") {
      out = NULL_OUTPUT;
    } else {
      const append = r.op === ">>" || r.op === "&>>";
      if (this.vfs.isDir(target)) throw new VfsError("EISDIR", target);
      // Open now, as bash does: `>` truncates before the command runs.
      if (append) this.vfs.appendFile(target, "");
      else this.vfs.writeFile(target, "");
      const file = new FileOutput(this.limits.maxPipeBytes, target, append);
      files.push(file);
      out = file;
    }
    if (both) {
      fds.out = out;
      fds.err = out;
    } else if (r.fd === 1) fds.out = out;
    else fds.err = out;
  }

  /** Quote removal, $VAR, ~ and globs. May give 0 words (empty $VAR) or many. */
  expandWord(word: Word): string[] {
    const chars: PatternChar[] = [];
    let quoted = false;
    for (const [i, seg] of word.entries()) {
      if (seg.quoted) quoted = true;
      if (seg.kind === "var") {
        for (const ch of this.env.get(seg.name) ?? "") chars.push({ ch, active: false });
        continue;
      }
      let text = seg.text;
      if (i === 0 && !seg.quoted && (text === "~" ? word.length === 1 : text.startsWith("~/"))) {
        for (const ch of this.env.get("HOME") ?? this.vfs.home) chars.push({ ch, active: false });
        text = text.slice(1);
      }
      for (const ch of text) chars.push({ ch, active: !seg.quoted });
    }
    if (hasGlob(chars)) {
      try {
        const matches = expandGlob(this.vfs, chars, this.limits.maxGlobMatches);
        if (matches.length > 0) return matches;
      } catch (e) {
        if (e instanceof GlobLimitError)
          throw new ExpansionError(`${wordText(word)}: ${e.message}`);
        throw e;
      }
    }
    const text = chars.map((c) => c.ch).join("");
    return text === "" && !quoted ? [] : [text];
  }
}
