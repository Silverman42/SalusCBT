<script setup lang="ts">
// The header of one reviewed question (mockup screen 07): label, Choose TWO,
// domain, flag and the marks chip. Shared by the MCQ and PBQ review layouts.
import { domainLabel, questionLabel, reviewStatus, type ReviewEntry } from "~/lib/resultView";

const props = defineProps<{ item: ReviewEntry }>();

const status = computed(() => reviewStatus(props.item));
// text-fg on the ok / bad tints: the tinted text is below AA there (T-309 axe).
const marksClass = computed(
  () =>
    ({
      correct: "bg-ok-soft text-fg",
      partial: "bg-warn-soft text-warn",
      wrong: "bg-bad-soft text-fg",
    })[status.value],
);
const marks = computed(
  () => `${props.item.earned} / ${props.item.max} point${props.item.max === 1 ? "" : "s"}`,
);
</script>

<template>
  <header class="flex flex-wrap items-center gap-2.5">
    <h3 class="m-0 text-[15px] font-extrabold">{{ questionLabel(item) }}</h3>
    <span
      v-if="item.kind === 'mcq' && item.chooseCount === 2"
      class="rounded-full bg-brand-soft px-3 py-[5px] text-[13px] font-bold text-brand-ink"
    >
      Choose TWO
    </span>
    <span class="rounded-full bg-surface-2 px-3 py-[5px] text-[13px] font-semibold text-muted-fg">
      {{ domainLabel(item.domain) }}
    </span>
    <span
      v-if="item.flagged"
      class="flex items-center gap-1 rounded-full bg-warn-soft px-3 py-[5px] text-[13px] font-bold text-warn"
    >
      <UIcon name="i-lucide-flag" class="size-3.5" />Flagged
    </span>
    <div class="flex-1" />
    <span class="rounded-full px-3 py-[5px] text-[13px] font-bold" :class="marksClass">
      {{ marks }}
    </span>
  </header>
</template>
