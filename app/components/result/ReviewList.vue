<script setup lang="ts">
// Read-only review with the All / Wrong / Flagged filters of mockup screen 07
// (EX-17, EX-18). With `byDomain` (the student review page, T-216) it also
// shows the "All domains" select; the two filters combine and the pill
// counts follow the chosen domain.
import {
  queryReview,
  reviewDomains,
  type DomainFilter,
  type ReviewEntry,
  type ReviewFilter,
} from "~/lib/resultView";

const props = defineProps<{ items: ReviewEntry[]; byDomain?: boolean }>();

const filter = defineModel<ReviewFilter>("filter", { default: "all" });
const domain = defineModel<DomainFilter>("domain", { default: "all" });

const domains = computed(() => reviewDomains(props.items));
const shown = computed(() => queryReview(props.items, filter.value, domain.value));
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
    count: queryReview(props.items, value, domain.value).length,
  })),
);

function onDomain(event: Event) {
  domain.value = (event.target as HTMLSelectElement).value as DomainFilter;
}
</script>

<template>
  <section aria-labelledby="answer-review" class="flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center gap-3">
      <h2
        id="answer-review"
        class="m-0 flex-1 text-xl font-extrabold tracking-[-0.01em] whitespace-nowrap"
      >
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
      <div v-if="byDomain" class="relative w-full min-w-0 sm:w-auto">
        <label for="review-domain" class="sr-only">Domain</label>
        <select
          id="review-domain"
          :value="domain"
          class="h-[42px] w-full max-w-full min-w-0 cursor-pointer appearance-none truncate rounded-full border-[1.5px] border-line bg-transparent pr-10 pl-4 text-sm font-semibold text-fg sm:w-[300px]"
          @change="onDomain"
        >
          <option value="all">All domains</option>
          <option v-for="d in domains" :key="d.domain" :value="d.domain">
            {{ d.label }} ({{ d.count }})
          </option>
        </select>
        <UIcon
          name="i-lucide-chevron-down"
          class="pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2 text-muted-fg"
          aria-hidden="true"
        />
      </div>
    </div>

    <p class="sr-only" role="status" aria-live="polite">
      {{ shown.length }} question{{ shown.length === 1 ? "" : "s" }} shown
    </p>
    <ResultReviewItem v-for="item in shown" :key="item.questionId" :item="item" />
    <p
      v-if="shown.length === 0"
      class="m-0 rounded-[28px] bg-surface px-6 py-8 text-center text-muted-fg"
    >
      No questions match {{ byDomain && domain !== "all" ? "these filters" : "this filter" }}.
    </p>
  </section>
</template>
