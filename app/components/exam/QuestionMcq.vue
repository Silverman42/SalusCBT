<script setup lang="ts">
// One multiple-choice question (mockup screen 02, EX-7, EX-9, EX-10).
// Letters follow the shuffled display order. Native radios (single answer)
// or checkboxes (Choose TWO), visually replaced, so Tab, Space and the arrow
// keys behave as usual; the page maps letter and number keys to `choose()`.
import type { AttemptPaperMcq } from "~/composables/useAttempt";
import { chooseLabel, optionLetter, toggleChoice } from "~/lib/examRunner";

const props = defineProps<{
  question: AttemptPaperMcq;
  modelValue: string[];
  readOnly: boolean;
  /** Ids for the heading and stem, so the option group is labelled by them. */
  stemId: string;
}>();
const emit = defineEmits<{ "update:modelValue": [optionIds: string[]] }>();

const multi = computed(() => props.question.chooseCount > 1);
const atLimit = computed(
  () => multi.value && props.modelValue.length >= props.question.chooseCount,
);
const limitNote = ref("");
watch(
  () => props.question.questionId,
  () => (limitNote.value = ""),
);

/** Toggle option `index` (also used for keyboard shortcuts). */
function choose(index: number) {
  const option = props.question.options[index];
  if (!option || props.readOnly) return;
  const { selected, blocked } = toggleChoice(
    props.modelValue,
    option.id,
    props.question.chooseCount,
  );
  if (blocked) {
    limitNote.value = `You've already chosen ${props.question.chooseCount}. Clear one to pick ${optionLetter(index)}.`;
    return;
  }
  limitNote.value = "";
  emit("update:modelValue", selected);
}

function onChange(index: number, e: Event) {
  const input = e.target as HTMLInputElement;
  const id = props.question.options[index]?.id;
  choose(index);
  // Keep the native control in step when the change was refused.
  nextTick(() => {
    if (id) input.checked = props.modelValue.includes(id);
  });
}

defineExpose({ choose });
</script>

<template>
  <div class="flex flex-col gap-5 sm:gap-6">
    <p
      :id="stemId"
      class="m-0 max-w-[720px] text-lg leading-[1.45] font-semibold whitespace-pre-line text-pretty sm:text-[22px]"
    >
      <ExamInlineText :text="question.stem" />
    </p>
    <div
      :role="multi ? 'group' : 'radiogroup'"
      :aria-labelledby="stemId"
      :aria-describedby="multi ? `${stemId}-choose` : undefined"
      class="flex max-w-[720px] flex-col gap-2.5"
    >
      <p v-if="multi" :id="`${stemId}-choose`" class="m-0 text-sm font-semibold text-muted-fg">
        {{ chooseLabel(question.chooseCount) }}: pick {{ question.chooseCount }} answers.
        <span class="font-normal"
          >{{ modelValue.length }} of {{ question.chooseCount }} chosen.</span
        >
      </p>
      <label
        v-for="(option, i) in question.options"
        :key="option.id"
        class="group flex items-center gap-3.5 rounded-[18px] border-2 px-4 py-3.5 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand sm:px-[18px] sm:py-4"
        :class="[
          modelValue.includes(option.id)
            ? 'border-brand bg-brand-soft'
            : 'border-line hover:border-salus-300',
          readOnly ? 'cursor-default' : 'cursor-pointer',
          atLimit && !modelValue.includes(option.id) ? 'opacity-70' : '',
        ]"
      >
        <input
          :type="multi ? 'checkbox' : 'radio'"
          :name="`q-${question.questionId}`"
          :value="option.id"
          :checked="modelValue.includes(option.id)"
          :disabled="readOnly"
          class="sr-only"
          @change="onChange(i, $event)"
        />
        <span
          class="grid size-8 flex-none place-items-center rounded-[10px] text-sm font-bold"
          :class="
            modelValue.includes(option.id) ? 'bg-brand text-white' : 'bg-surface-2 text-muted-fg'
          "
          aria-hidden="true"
        >
          {{ optionLetter(i) }}
        </span>
        <span class="sr-only">{{ optionLetter(i) }}.</span>
        <span
          class="min-w-0 flex-1 text-base break-words"
          :class="modelValue.includes(option.id) ? 'font-semibold' : ''"
        >
          <ExamInlineText :text="option.text" />
        </span>
        <UIcon
          v-if="modelValue.includes(option.id)"
          name="i-lucide-check"
          class="size-5 flex-none text-brand-ink"
          aria-hidden="true"
        />
      </label>
    </div>
    <p class="-mt-2 m-0 min-h-5 text-sm font-semibold text-warn" role="status" aria-live="polite">
      {{ limitNote }}
    </p>
  </div>
</template>
