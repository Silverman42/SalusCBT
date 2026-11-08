<script setup lang="ts">
// The lab terminal (T-702, LB-1, mockup screen 12). A native text input for the
// command line (works with screen readers, mobile keyboards and IMEs) under a
// scrollback rendered as text nodes only (no v-html). Keys: Enter runs, ↑/↓
// history, Tab completes, Esc then Tab leaves, Ctrl+L clears, Ctrl+C cancels
// the line (or copies when text is selected).
//
// Screen readers: the visible scrollback is a focusable, labelled log that is
// not live; a separate visually hidden live log announces each command's new
// output, cut to a few lines (screen.ts `announcement`).
import { markRaw, nextTick, onMounted, reactive, ref, shallowRef, useId, watch } from "vue";
import { complete } from "~/lib/terminal/complete";
import { CommandHistory } from "~/lib/terminal/history";
import type { RunResult, Shell } from "~/lib/terminal/runner";
import { announcement, Screen } from "~/lib/terminal/screen";

const props = defineProps<{
  shell: Shell;
  /** Printed when the terminal starts and whenever `shell` changes (reset). */
  banner?: string;
}>();

const emit = defineEmits<{ ran: [line: string, result: RunResult] }>();

const id = useId();
const inputId = `${id}-input`;
const hintId = `${id}-hint`;

const screen = reactive(new Screen());
const history = markRaw(new CommandHistory());
const line = ref("");
const prompt = ref(props.shell.prompt());
const busy = ref(false);
const announcements = ref<{ id: number; text: string }[]>([]);
let announceId = 0;
let tabLeaves = false;

const inputEl = ref<HTMLInputElement>();
const outputEl = ref<HTMLElement>();
const shellRef = shallowRef(props.shell);

function announce(text: string) {
  if (!text) return;
  announcements.value = [...announcements.value.slice(-2), { id: ++announceId, text }];
}

async function scrollToEnd() {
  await nextTick();
  const el = outputEl.value;
  if (el) el.scrollTop = el.scrollHeight;
}

function start() {
  screen.clear();
  if (props.banner)
    screen.output("stdout", props.banner.endsWith("\n") ? props.banner : `${props.banner}\n`);
  prompt.value = shellRef.value.prompt();
  line.value = "";
  history.reset();
  void scrollToEnd();
}

watch(
  () => props.shell,
  (shell) => {
    shellRef.value = shell;
    start();
    if (props.banner) announce(props.banner);
  },
);
onMounted(start);

function setLine(value: string, cursor = value.length) {
  line.value = value;
  void nextTick(() => inputEl.value?.setSelectionRange(cursor, cursor));
}

async function submit() {
  if (busy.value) return;
  const text = line.value;
  line.value = "";
  screen.command(prompt.value, text);
  history.push(text);
  if (text.trim() === "") {
    void scrollToEnd();
    return;
  }
  busy.value = true;
  void scrollToEnd();
  const shell = shellRef.value;
  let result: RunResult;
  try {
    result = await shell.run(text);
  } catch (e) {
    const message = `bash: internal error: ${e instanceof Error ? e.message : String(e)}\n`;
    result = {
      code: 1,
      chunks: [{ type: "text", stream: "stderr", text: message }],
      stdout: "",
      stderr: message,
      cleared: false,
      truncated: false,
    };
  }
  // A reset during the run replaced the shell: drop the stale output.
  if (shell !== shellRef.value) {
    busy.value = false;
    return;
  }
  const shown = screen.apply(result.chunks);
  prompt.value = shell.prompt();
  busy.value = false;
  announce(result.cleared && shown === "" ? "Screen cleared." : announcement(shown));
  emit("ran", text, result);
  await scrollToEnd();
  inputEl.value?.focus();
}

function clearScreen() {
  screen.clear();
  announce("Screen cleared.");
  inputEl.value?.focus();
}

function onTab(e: KeyboardEvent) {
  if (tabLeaves) {
    tabLeaves = false;
    return; // let the browser move focus
  }
  const el = inputEl.value;
  if (!el || busy.value) return;
  const cursor = el.selectionStart ?? line.value.length;
  const shell = shellRef.value;
  const result = complete(
    line.value,
    cursor,
    shell.vfs,
    shell.registry.list().map((c) => c.name),
  );
  if (!result) return; // nothing to complete: Tab moves focus as usual
  e.preventDefault();
  if (result.line !== line.value) {
    setLine(result.line, result.cursor);
  } else if (result.matches.length > 1) {
    screen.command(prompt.value, line.value);
    screen.output("stdout", `${result.matches.join("  ")}\n`);
    announce(`${result.matches.length} matches: ${result.matches.join(", ")}`);
    void scrollToEnd();
  } else if (result.matches.length === 0) {
    announce("No matches. Press Escape, then Tab, to leave the terminal.");
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.isComposing) return;
  const plain = !e.ctrlKey && !e.metaKey && !e.altKey;
  if (e.key === "Tab" && plain && !e.shiftKey) return onTab(e);
  if (e.key !== "Escape") tabLeaves = false;

  if (e.key === "Enter" && plain) {
    e.preventDefault();
    void submit();
  } else if (e.key === "ArrowUp" && plain) {
    e.preventDefault();
    if (busy.value) return;
    const prev = history.up(line.value);
    if (prev !== undefined) setLine(prev);
  } else if (e.key === "ArrowDown" && plain) {
    e.preventDefault();
    if (busy.value) return;
    const next = history.down();
    if (next !== undefined) setLine(next);
  } else if (e.key === "Escape") {
    tabLeaves = true;
  } else if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "l") {
    e.preventDefault();
    clearScreen();
  } else if (e.ctrlKey && !e.metaKey && !e.altKey && e.key.toLowerCase() === "c") {
    const el = inputEl.value;
    if (el && el.selectionStart !== el.selectionEnd) return; // copy the selection
    e.preventDefault();
    if (busy.value) return;
    screen.command(prompt.value, `${line.value}^C`);
    line.value = "";
    history.reset();
    void scrollToEnd();
  }
}

/** Clicking the terminal focuses the input, unless the student is selecting text. */
function onPointerUp(e: MouseEvent) {
  if ((e.target as HTMLElement | null)?.closest("button, a, input")) return;
  const selection = window.getSelection();
  if (selection && !selection.isCollapsed) return;
  inputEl.value?.focus({ preventScroll: true });
}

const toast = useToast();
async function copyOutput() {
  try {
    await navigator.clipboard.writeText(screen.text());
    toast.add({ title: "Terminal output copied", color: "success", icon: "i-lucide-copy-check" });
  } catch {
    toast.add({
      title: "Couldn't copy. Select the text and copy it yourself.",
      color: "error",
      icon: "i-lucide-circle-alert",
    });
  }
}

defineExpose({
  focus: () => inputEl.value?.focus(),
});
</script>

<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div
      class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg"
      @mouseup="onPointerUp"
    >
      <div class="flex items-center gap-3 px-5 pt-4 pb-2 sm:px-6">
        <span class="flex flex-none gap-1.5" aria-hidden="true">
          <span class="size-2.5 rounded-full bg-salus-300" />
          <span class="size-2.5 rounded-full bg-salus-400" />
          <span class="size-2.5 rounded-full bg-salus-500" />
        </span>
        <span class="min-w-0 flex-1 truncate font-mono text-[12.5px] text-code-muted">
          bash · in-browser lab
        </span>
        <button
          type="button"
          class="inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-code-fg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-salus-300"
          @click="copyOutput"
        >
          <UIcon name="i-lucide-copy" class="size-3.5" />
          Copy<span class="sr-only"> terminal output</span>
        </button>
        <button
          type="button"
          class="inline-flex h-8 flex-none items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold text-code-fg hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-salus-300"
          @click="clearScreen"
        >
          <UIcon name="i-lucide-eraser" class="size-3.5" />
          Clear<span class="sr-only"> the screen</span>
        </button>
      </div>

      <div
        ref="outputEl"
        role="log"
        aria-live="off"
        aria-label="Terminal output"
        :aria-busy="busy"
        tabindex="0"
        data-testid="terminal-output"
        class="h-[360px] min-w-0 overflow-auto px-5 font-mono text-[13.5px] leading-[1.75] whitespace-pre focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-salus-300 sm:h-[440px] sm:px-6"
      >
        <template v-for="entry in screen.entries" :key="entry.id">
          <div v-if="entry.kind === 'command'" class="min-h-[1lh]">
            <span class="font-semibold text-salus-400" v-text="entry.prompt" />
            <span v-text="entry.text" />
          </div>
          <div
            v-else
            class="min-h-[1lh]"
            :class="entry.stream === 'stderr' ? 'text-[#ff8a93]' : undefined"
            v-text="entry.text.endsWith('\n') ? entry.text.slice(0, -1) : entry.text"
          />
        </template>
      </div>

      <div
        class="flex min-w-0 flex-wrap items-center gap-x-1 px-5 pt-1 pb-4 font-mono text-[16px] leading-[1.75] focus-within:outline-2 focus-within:-outline-offset-2 focus-within:outline-salus-300 sm:px-6 sm:text-[13.5px]"
      >
        <label :for="inputId" class="font-semibold break-all text-salus-400">
          <span class="sr-only">Command line, </span>{{ prompt }}
        </label>
        <input
          :id="inputId"
          ref="inputEl"
          v-model="line"
          type="text"
          class="min-w-[8rem] flex-1 border-0 bg-transparent p-0 text-code-fg caret-salus-300 outline-none"
          autocomplete="off"
          autocapitalize="off"
          autocorrect="off"
          spellcheck="false"
          enterkeyhint="send"
          data-testid="terminal-input"
          :readonly="busy"
          :aria-describedby="hintId"
          @keydown="onKeydown"
          @input="tabLeaves = false"
        />
        <span
          v-if="busy"
          class="inline-flex items-center gap-1.5 font-sans text-[13px] text-code-muted"
          data-testid="terminal-busy"
        >
          <UIcon name="i-lucide-loader-circle" class="size-4 motion-safe:animate-spin" />
          Running…
        </span>
      </div>
    </div>

    <p :id="hintId" class="m-0 text-[13px] leading-normal text-muted-fg">
      Enter runs a command. ↑ and ↓ go through your history. Tab completes commands and file names
      (press Esc, then Tab, to leave the terminal). Ctrl+L clears the screen and Ctrl+C cancels the
      line.
    </p>

    <!-- Bounded announcements of new output (the scrollback itself is not live). -->
    <div
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="Terminal announcements"
      class="sr-only"
    >
      <p v-for="a in announcements" :key="a.id" v-text="a.text" />
    </div>
  </div>
</template>
