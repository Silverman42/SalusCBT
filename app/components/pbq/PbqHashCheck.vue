<script setup lang="ts">
// PBQ 3 / B3: installer integrity (T-304). Contract in components/exam/QuestionPbq.vue.
// Layout after mockup screen 03: artefact left, answer panel right (420 px).
// The vendor and computed hashes are lined up by file name, each hash in full
// (it wraps, never truncates) one above the other at the same width; nothing
// marks which pair differs. Parts: 3a pick a file, 3b/3c MCQ in paper order.
//
// Slot `part-mark` ({ part }) after each part is for review marks (T-309).
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, McqPart, PayloadOf } from "~~/shared/content";
import { alignHashes, parseHashListing } from "~/lib/pbq/hashCheck";
import { mcqPartOptions, partText, withPartText } from "~/lib/pbq/partAnswers";

const props = defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();

const payload = computed(() => props.question.payload as PayloadOf<"hashCheck">);
const uid = computed(() => `pbq-${props.question.questionId}`);

const rows = computed(() => alignHashes(payload.value.vendorHashes, payload.value.computed));
const commands = computed(() => [
  parseHashListing(payload.value.vendorHashes).command,
  parseHashListing(payload.value.computed).command,
]);
const raw = computed(() => [
  { title: "vendor_hashes.txt", text: payload.value.vendorHashes },
  { title: "sha256sum", text: payload.value.computed },
]);

const textOf = (id: string) => partText(props.modelValue, id);
function set(id: string, value: string) {
  emit("update:modelValue", withPartText(props.modelValue, id, value));
}
const optionsOf = (part: McqPart) => mcqPartOptions(part);
const selectValue = (e: Event) => (e.target as HTMLSelectElement).value;

const fieldClass =
  "w-full min-w-0 rounded-[16px] border-2 border-transparent bg-surface-2 px-3.5 text-sm text-fg focus:border-brand focus:outline-none disabled:opacity-70";
</script>

<template>
  <div class="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
    <!-- Artefact -->
    <section
      v-if="rows"
      :id="`${uid}-hashes`"
      tabindex="0"
      role="region"
      aria-label="Vendor and computed SHA-256 hashes"
      class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand lg:self-start"
    >
      <div class="flex items-center gap-3 px-5 pt-4 pb-2">
        <UIcon name="i-lucide-file-check" class="size-[18px] flex-none" />
        <span class="min-w-0 truncate font-mono text-sm font-semibold">SHA-256 check</span>
        <span class="text-xs whitespace-nowrap text-code-muted">{{ rows.length }} files</span>
      </div>
      <div
        class="flex flex-col gap-0.5 px-5 pb-3 font-mono text-[12px] leading-relaxed text-code-muted"
      >
        <span v-for="(cmd, i) in commands" :key="i" class="break-all">
          <template v-if="cmd">$ {{ cmd }}</template>
        </span>
      </div>
      <ul class="m-0 flex list-none flex-col gap-2 px-3 pb-3">
        <li
          v-for="row in rows"
          :key="row.file"
          class="flex min-w-0 flex-col gap-2 rounded-[20px] bg-white/5 px-3 py-3 sm:px-4"
        >
          <span class="font-mono text-[13px] font-semibold break-all">{{ row.file }}</span>
          <dl class="m-0 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
            <dt
              class="pt-px text-[11px] font-bold tracking-[0.05em] text-code-fg uppercase opacity-90"
            >
              Vendor
            </dt>
            <dd class="m-0 font-mono text-[12.5px] leading-relaxed break-all">
              {{ row.vendor ?? "(not listed)" }}
            </dd>
            <dt
              class="pt-px text-[11px] font-bold tracking-[0.05em] text-code-fg uppercase opacity-90"
            >
              Computed
            </dt>
            <dd class="m-0 font-mono text-[12.5px] leading-relaxed break-all">
              {{ row.computed ?? "(not computed)" }}
            </dd>
          </dl>
        </li>
      </ul>
    </section>

    <!-- Fallback: the listings as given when they can't be lined up. -->
    <div v-else class="flex min-w-0 flex-col gap-4 sm:gap-5">
      <section
        v-for="art in raw"
        :key="art.title"
        class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg"
      >
        <div class="flex items-center gap-3 px-5 py-4">
          <UIcon name="i-lucide-file-text" class="size-[18px] flex-none" />
          <span class="min-w-0 truncate font-mono text-sm font-semibold">{{ art.title }}</span>
        </div>
        <pre
          tabindex="0"
          :aria-label="art.title"
          class="m-0 max-h-[60vh] min-w-0 overflow-auto px-5 pt-1 pb-4 font-mono text-[12.5px] leading-[2] whitespace-pre-wrap break-all focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-salus-300"
          >{{ art.text }}</pre>
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
        <template v-if="part.kind === 'pick'">
          <label :for="`${uid}-${part.id}`" class="text-sm font-semibold">
            {{ part.id }} · <ExamInlineText :text="part.prompt" />
          </label>
          <select
            :id="`${uid}-${part.id}`"
            :value="textOf(part.id)"
            :disabled="readOnly"
            :class="fieldClass"
            class="h-12 font-mono [&>option]:bg-surface [&>option]:text-fg"
            @change="set(part.id, selectValue($event))"
          >
            <option value="">Choose a file</option>
            <option v-for="c in part.choices" :key="c" :value="c">{{ c }}</option>
          </select>
        </template>

        <fieldset v-else class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend class="mb-2 p-0 text-sm font-semibold">
            {{ part.id }} · <ExamInlineText :text="part.prompt" />
          </legend>
          <label
            v-for="opt in optionsOf(part)"
            :key="opt.id"
            class="flex items-center gap-3 rounded-[16px] border-2 px-3 py-2.5 text-[15px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
            :class="[
              textOf(part.id) === opt.id ? 'border-brand bg-brand-soft' : 'border-line',
              readOnly ? 'cursor-default' : 'cursor-pointer',
            ]"
          >
            <input
              type="radio"
              class="sr-only"
              :name="`${uid}-${part.id}`"
              :value="opt.id"
              :checked="textOf(part.id) === opt.id"
              :disabled="readOnly"
              @change="set(part.id, opt.id)"
            />
            <span
              class="grid size-7 flex-none place-items-center rounded-[8px] text-[13px] font-bold"
              :class="
                textOf(part.id) === opt.id ? 'bg-brand text-white' : 'bg-surface-2 text-muted-fg'
              "
              aria-hidden="true"
              >{{ opt.letter }}</span
            >
            <span class="min-w-0 flex-1"><ExamInlineText :text="opt.text" /></span>
          </label>
        </fieldset>

        <slot name="part-mark" :part="part" />
      </div>

      <slot name="footer" />
    </section>
  </div>
</template>
