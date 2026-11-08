<script setup lang="ts">
// PBQ 1 / B1 · SSH brute-force alert (T-302, LLD §14.4, PB-1, PB-2).
// Contract in components/exam/QuestionPbq.vue. Layout after mockup screen 03:
// the auth.log viewer (line numbers, search with highlight and match count)
// on the left, the scenario and answer fields 1a–1d on the right.
//
// The log is about 140 lines, so every line is rendered (no virtual list):
// browser find, selection and screen readers then see the whole log.
// Search: type to highlight; Enter / Shift+Enter jump to the next / previous
// match (wrapping); Escape clears. It stays usable when `readOnly`.
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, TextPart } from "~~/shared/content";
import { setPbqPart } from "~/lib/examRunner";
import { matchLabel, searchLog, splitLog, stepMatch } from "~/lib/pbq/sshLog";

const props = defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();

const payload = computed(() =>
  props.question.payload.template === "sshLog" ? props.question.payload : null,
);
const parts = computed<TextPart[]>(() => payload.value?.parts ?? []);
const uid = computed(() => `pbq-${props.question.questionId}`);
const LOG_TITLE = "/var/log/auth.log";

// --- log and search --------------------------------------------------------

const rawLines = computed(() => splitLog(payload.value?.log ?? ""));
const query = ref("");
const current = ref<number | null>(null);
const result = computed(() => searchLog(rawLines.value, query.value));
const count = computed(() => result.value.count);
const label = computed(() => matchLabel(current.value, count.value));
const announcement = computed(() => {
  if (query.value === "") return "";
  if (count.value === 0 || current.value !== null) return label.value;
  return `${label.value}. Enter for the next match, Shift+Enter for the previous.`;
});
const logEl = ref<HTMLElement | null>(null);

watch(query, () => {
  current.value = null;
});

function jump(dir: 1 | -1) {
  current.value = stepMatch(current.value, count.value, dir);
  if (current.value === null) return;
  const i = current.value;
  void nextTick(() => {
    logEl.value
      ?.querySelector(`[data-match="${i}"]`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  });
}
function onSearchKey(e: KeyboardEvent) {
  if (e.key === "Enter") {
    e.preventDefault();
    jump(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape" && query.value !== "") {
    e.preventDefault();
    query.value = "";
  }
}

// --- answers ---------------------------------------------------------------

function textOf(id: string): string {
  const a = props.modelValue?.kind === "pbq" ? props.modelValue.parts[id] : undefined;
  return typeof a === "string" ? a : "";
}
function setText(id: string, e: Event) {
  const v = (e.target as HTMLInputElement | HTMLTextAreaElement).value;
  emit("update:modelValue", setPbqPart(props.modelValue, id, v), { debounce: true });
}

const INPUT_MODE: Record<TextPart["kind"], "numeric" | "text" | "decimal"> = {
  ip: "decimal",
  integer: "numeric",
  octal: "numeric",
  text: "text",
  directive: "text",
  path: "text",
};
const PLACEHOLDER: Partial<Record<TextPart["kind"], string>> = {
  ip: "e.g. 192.0.2.10",
  integer: "e.g. 12",
  text: "e.g. username",
};

const fieldClass =
  "w-full min-w-0 rounded-[16px] border-2 border-transparent bg-surface-2 px-3.5 font-mono text-sm text-fg placeholder:text-muted-fg focus:border-brand focus:outline-none disabled:opacity-70";
</script>

<template>
  <div class="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
    <!-- auth.log viewer -->
    <section
      class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg lg:max-h-[calc(100dvh-160px)] lg:min-h-[520px]"
      :aria-labelledby="`${uid}-log-title`"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-4">
        <UIcon name="i-lucide-file-text" class="size-[18px] flex-none" />
        <span :id="`${uid}-log-title`" class="min-w-0 truncate font-mono text-sm font-semibold">
          {{ LOG_TITLE }}
        </span>
        <span class="text-xs whitespace-nowrap text-code-muted">{{ rawLines.length }} lines</span>
        <div class="hidden flex-1 sm:block" />
        <div
          class="flex h-10 w-full min-w-0 items-center gap-2 rounded-full bg-white/8 px-3.5 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-salus-300 sm:w-[260px]"
        >
          <UIcon name="i-lucide-search" class="size-4 flex-none" />
          <label :for="`${uid}-search`" class="sr-only">Search the log</label>
          <input
            :id="`${uid}-search`"
            v-model="query"
            type="search"
            :aria-describedby="`${uid}-count`"
            aria-keyshortcuts="Enter Shift+Enter Escape"
            placeholder="Search"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength="100"
            class="min-w-0 flex-1 bg-transparent font-mono text-[13px] text-code-fg placeholder:text-code-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
            @keydown="onSearchKey"
          />
          <span
            v-if="query !== ''"
            class="flex-none rounded-full px-2 py-[3px] text-xs font-bold tabular-nums"
            :class="count > 0 ? 'bg-salus-500 text-white' : 'bg-white/10 text-code-muted'"
            aria-hidden="true"
          >
            {{ current === null ? count : `${current + 1}/${count}` }}
          </span>
        </div>
        <span :id="`${uid}-count`" class="sr-only" aria-live="polite" aria-atomic="true">
          {{ announcement }}
        </span>
      </div>

      <div
        ref="logEl"
        tabindex="0"
        role="region"
        :aria-label="`${LOG_TITLE}, ${rawLines.length} lines`"
        class="relative max-h-[60vh] min-h-0 min-w-0 flex-1 overflow-auto pt-1 pb-4 font-mono text-[12.5px] leading-[2] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-salus-300 lg:max-h-none"
      >
        <div class="min-w-max">
          <div
            v-for="line in result.lines"
            :key="line.n"
            class="flex gap-4 px-5"
            :class="line.hit ? 'bg-salus-500/15' : ''"
          >
            <span class="w-9 flex-none text-right text-code-muted select-none" aria-hidden="true">
              {{ line.n }}
            </span>
            <span class="whitespace-pre"
              ><template v-for="(seg, si) in line.segments" :key="si"
                ><mark
                  v-if="seg.match !== null"
                  :data-match="seg.match"
                  class="rounded-[5px] bg-salus-500 px-[3px] py-px text-white"
                  :class="seg.match === current ? 'outline-2 outline-offset-1 outline-white' : ''"
                  >{{ seg.text }}</mark
                ><template v-else>{{ seg.text }}</template></template
              ></span
            >
          </div>
        </div>
      </div>
    </section>

    <!-- Scenario and answers -->
    <section class="flex min-w-0 flex-col gap-5 rounded-[28px] bg-surface p-5 sm:p-7 lg:self-start">
      <slot name="heading" />
      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-bold tracking-[0.04em] text-brand-ink uppercase">
          Scenario
        </span>
        <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
          <ExamInlineText :text="payload?.intro ?? ''" />
        </p>
      </div>

      <div v-for="part in parts" :key="part.id" class="flex min-w-0 flex-col gap-2">
        <label
          :for="`${uid}-${part.id}`"
          class="flex flex-wrap items-center gap-2 text-sm font-semibold"
        >
          <span>{{ part.id }} · <ExamInlineText :text="part.prompt" /></span>
          <span
            v-if="!part.scored"
            class="rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] font-bold text-muted-fg"
          >
            Practice · not scored
          </span>
        </label>
        <textarea
          v-if="!part.scored"
          :id="`${uid}-${part.id}`"
          :value="textOf(part.id)"
          :disabled="readOnly"
          :class="fieldClass"
          class="min-h-[72px] py-3 text-[13px]"
          rows="2"
          placeholder='grep "Failed password" auth.log | …'
          spellcheck="false"
          autocapitalize="off"
          autocomplete="off"
          maxlength="200"
          @input="setText(part.id, $event)"
        />
        <input
          v-else
          :id="`${uid}-${part.id}`"
          :value="textOf(part.id)"
          :disabled="readOnly"
          :class="fieldClass"
          class="h-12"
          :inputmode="INPUT_MODE[part.kind]"
          :placeholder="PLACEHOLDER[part.kind]"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          maxlength="200"
          @input="setText(part.id, $event)"
        />
      </div>

      <slot name="footer" />
    </section>
  </div>
</template>
