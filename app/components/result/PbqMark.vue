<script setup lang="ts">
// The review mark under one PBQ part, or in a firewall rule's Result cell
// (T-309, EX-17, PB-2): ✓ / ✗ with the correct answer next to a wrong one,
// or "Practice · not scored" with the model answer (1d / B1d). Small text on
// the soft tints is `text-fg` (tinted text is below AA in light mode).
import { markLabel, type PartMark } from "~/lib/pbq/review";

// `prose`: the answer is option text (an MCQ part), not a value to show as code.
const props = defineProps<{ mark: PartMark; compact?: boolean; prose?: boolean }>();

const label = computed(() => markLabel(props.mark));
const tone = computed(() =>
  props.mark.ok === null ? "bg-surface-2" : props.mark.ok ? "bg-ok-soft" : "bg-bad-soft",
);
const chip = computed(() =>
  props.mark.ok === null
    ? "bg-surface text-muted-fg"
    : props.mark.ok
      ? "bg-ok text-white dark:text-canvas"
      : "bg-bad text-white dark:text-canvas",
);
const icon = computed(() =>
  props.mark.ok === null ? "i-lucide-pencil-line" : props.mark.ok ? "i-lucide-check" : "i-lucide-x",
);
const answerLabel = computed(() =>
  props.mark.ok === null ? "Model answer" : props.compact ? "Answer" : "Correct answer",
);
</script>

<template>
  <div
    class="flex min-w-0 flex-col gap-1.5 rounded-[14px] text-[13px] leading-snug text-fg"
    :class="[tone, compact ? 'px-2.5 py-2' : 'px-3 py-2.5']"
    data-testid="pbq-mark"
    :data-mark="mark.ok === null ? 'practice' : mark.ok ? 'correct' : 'wrong'"
  >
    <span class="flex items-center gap-2 font-bold">
      <span
        class="grid size-5 flex-none place-items-center rounded-full"
        :class="chip"
        aria-hidden="true"
      >
        <UIcon :name="icon" class="size-3.5" />
      </span>
      {{ label }}
    </span>
    <span v-if="mark.ok !== true" class="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <span class="font-semibold">{{ answerLabel }}</span>
      <span v-if="prose" class="min-w-0">{{ mark.correct }}</span>
      <code
        v-else
        class="min-w-0 font-mono text-[12.5px] font-bold break-words"
        :class="mark.ok === null ? 'break-all' : compact ? 'whitespace-nowrap' : ''"
        >{{ mark.correct }}</code
      >
    </span>
  </div>
</template>
