<script setup lang="ts">
// Read-only review with the All / Wrong / Flagged filters of mockup screen 07
// (EX-17, EX-18).
import { filterReview, type ReviewEntry, type ReviewFilter } from "~/lib/resultView";

const props = defineProps<{ items: ReviewEntry[] }>();

const filter = ref<ReviewFilter>("all");
const shown = computed(() => filterReview(props.items, filter.value));
const tabs = computed(() =>
  (
    [
      ["all", "All"],
      ["wrong", "Wrong"],
      ["flagged", "Flagged"],
    ] as const
  ).map(([value, label]) => ({
    value,
    label,
    count: filterReview(props.items, value).length,
  })),
);
</script>

<template>
  <section aria-labelledby="answer-review" class="flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <h2 id="answer-review" class="m-0 flex-1 text-xl font-extrabold tracking-[-0.01em]">
        Answer review
      </h2>
      <div
        role="group"
        aria-label="Filter questions"
        class="flex gap-1.5 rounded-full bg-surface-2 p-[5px]"
      >
        <button
          v-for="tab in tabs"
          :key="tab.value"
          type="button"
          class="rounded-full px-3.5 py-2 text-sm transition-colors sm:px-4"
          :class="
            filter === tab.value
              ? 'bg-brand font-bold text-white'
              : 'font-semibold text-muted-fg hover:text-fg'
          "
          :aria-pressed="filter === tab.value"
          @click="filter = tab.value"
        >
          {{ tab.label }} {{ tab.count }}
        </button>
      </div>
    </div>

    <ResultReviewItem v-for="item in shown" :key="item.questionId" :item="item" />
    <p
      v-if="shown.length === 0"
      class="m-0 rounded-[28px] bg-surface px-6 py-8 text-center text-muted-fg"
    >
      No questions match this filter.
    </p>
  </section>
</template>
