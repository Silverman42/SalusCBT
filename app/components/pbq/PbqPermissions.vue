<script setup lang="ts">
// PBQ 4 / B4: file permissions and SSH hardening (T-305). Contract in
// components/exam/QuestionPbq.vue. Layout after mockup screen 03: the
// `ls -l` listings and the `sshd_config` excerpt as read-only terminal blocks
// on the left (prompts and `#` comments styled, nothing else highlighted),
// answer panel on the right. Parts: path, two octal modes, directive name.
// Answers are stored as typed; marking normalises them (`640` = `0640`).
//
// Slot `part-mark` ({ part }) after each part is for review marks (T-309).
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, PayloadOf, TextPart } from "~~/shared/content";
import { partText, withPartText } from "~/lib/pbq/partAnswers";
import { catTarget, terminalLines } from "~/lib/pbq/shellPrompt";

const props = defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();

const payload = computed(() => props.question.payload as PayloadOf<"permissions">);
const uid = computed(() => `pbq-${props.question.questionId}`);

const artefacts = computed(() => [
  {
    key: "listings",
    title: "File listings",
    icon: "i-lucide-folder-tree",
    lines: terminalLines(payload.value.listings),
  },
  {
    key: "sshd",
    title: catTarget(payload.value.sshdConfig) ?? "sshd_config",
    icon: "i-lucide-file-text",
    lines: terminalLines(payload.value.sshdConfig),
  },
]);

const textOf = (id: string) => partText(props.modelValue, id);
function set(id: string, e: Event) {
  const value = (e.target as HTMLInputElement).value;
  emit("update:modelValue", withPartText(props.modelValue, id, value), { debounce: true });
}

const INPUT_MODE: Partial<Record<TextPart["kind"], "numeric" | "text">> = { octal: "numeric" };
const PLACEHOLDER: Partial<Record<TextPart["kind"], string>> = {
  path: "e.g. /etc/example",
  octal: "e.g. 0755",
  directive: "Directive name",
};
const MAX_LENGTH: Partial<Record<TextPart["kind"], number>> = { octal: 8 };
const isPractice = (part: TextPart) => !part.scored;

const fieldClass =
  "h-12 w-full min-w-0 rounded-[16px] border-2 border-transparent bg-surface-2 px-3.5 font-mono text-sm text-fg placeholder:text-muted-fg focus:border-brand focus:outline-none disabled:opacity-70";
</script>

<template>
  <div class="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
    <!-- Artefacts -->
    <div class="flex min-w-0 flex-col gap-4 sm:gap-5">
      <section
        v-for="art in artefacts"
        :key="art.key"
        class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg"
      >
        <div class="flex items-center gap-3 px-5 py-4">
          <UIcon :name="art.icon" class="size-[18px] flex-none" />
          <span
            :id="`${uid}-${art.key}-title`"
            class="min-w-0 truncate font-mono text-sm font-semibold"
          >
            {{ art.title }}
          </span>
          <span class="text-xs whitespace-nowrap text-code-muted"
            >{{ art.lines.length }} lines</span
          >
        </div>
        <!-- Each line keeps its spacing (whitespace-pre); the block scrolls inside itself. -->
        <div
          tabindex="0"
          role="region"
          :aria-labelledby="`${uid}-${art.key}-title`"
          class="max-h-[60vh] min-w-0 overflow-auto px-5 pt-1 pb-4 font-mono text-[12.5px] leading-[1.9] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-salus-300"
        >
          <div v-for="(line, i) in art.lines" :key="i">
            <span v-if="line.kind === 'prompt'" class="whitespace-pre">
              <span class="text-salus-300">{{ `${line.prompt} ` }}</span>
              <span class="font-semibold text-white">{{ line.command }}</span>
            </span>
            <span v-else-if="line.kind === 'comment'" class="whitespace-pre text-code-muted">{{
              line.text
            }}</span>
            <span v-else class="whitespace-pre">{{ line.text || " " }}</span>
          </div>
        </div>
      </section>
    </div>

    <!-- Answers -->
    <section class="flex min-w-0 flex-col gap-5 rounded-[28px] bg-surface p-5 sm:p-7 lg:self-start">
      <slot name="heading" />
      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-bold tracking-[0.04em] text-brand-ink uppercase">
          Scenario
        </span>
        <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
          <ExamInlineText :text="payload.intro" />
        </p>
      </div>

      <div v-for="part in payload.parts" :key="part.id" class="flex min-w-0 flex-col gap-2">
        <label
          :for="`${uid}-${part.id}`"
          class="flex flex-wrap items-center gap-2 text-sm font-semibold"
        >
          <span>{{ part.id }} · <ExamInlineText :text="part.prompt" /></span>
          <span
            v-if="isPractice(part)"
            class="rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] font-bold text-muted-fg"
          >
            Practice · not scored
          </span>
        </label>
        <input
          :id="`${uid}-${part.id}`"
          :value="textOf(part.id)"
          :disabled="readOnly"
          :class="fieldClass"
          :inputmode="INPUT_MODE[part.kind] ?? 'text'"
          :placeholder="PLACEHOLDER[part.kind]"
          :maxlength="MAX_LENGTH[part.kind] ?? 200"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          @input="set(part.id, $event)"
        />
        <slot name="part-mark" :part="part" />
      </div>

      <slot name="footer" />
    </section>
  </div>
</template>
