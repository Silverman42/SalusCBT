<script setup lang="ts">
// Pre-submit review (mockup screen 05, EX-12): counts, the flagged and
// unanswered questions (each opens that question), then Submit exam.
import {
  REVIEW_STATE_LABEL,
  type ReviewItem,
  type RunnerSummary,
  type SubmitProblem,
} from "~/lib/examRunner";

const props = defineProps<{
  summary: RunnerSummary;
  items: ReviewItem[];
  readOnly: boolean;
  submitting: boolean;
  problem: SubmitProblem | null;
}>();
defineEmits<{ back: []; jump: [index: number]; submit: [force: boolean]; result: [] }>();

const heading = ref<HTMLElement | null>(null);
onMounted(() => heading.value?.focus());

const chipClass = (item: ReviewItem) =>
  item.state === "unanswered" || item.state === "flaggedUnanswered"
    ? item.state === "flaggedUnanswered"
      ? "bg-warn text-canvas"
      : "bg-bad text-white dark:text-canvas"
    : item.state === "flagged"
      ? "bg-warn text-canvas"
      : "bg-brand-soft text-brand-ink";
const stateClass = (item: ReviewItem) =>
  item.state === "unanswered" || item.state === "flaggedUnanswered"
    ? "text-bad"
    : item.state === "flagged"
      ? "text-warn"
      : "text-brand-ink";

const pendingText = computed(() =>
  props.problem?.kind === "pending"
    ? `${props.problem.count} ${props.problem.count === 1 ? "answer is" : "answers are"} still saving.`
    : "",
);
</script>

<template>
  <div class="flex justify-center px-0 py-4 sm:px-5 sm:py-9">
    <div class="flex w-full max-w-[760px] min-w-0 flex-col gap-[22px]">
      <div class="flex flex-col gap-2">
        <h1
          ref="heading"
          tabindex="-1"
          class="m-0 text-[28px] font-extrabold tracking-[-0.03em] outline-none sm:text-4xl"
        >
          {{ readOnly ? "Exam submitted" : "Ready to submit?" }}
        </h1>
        <p class="m-0 text-base text-muted-fg">
          <template v-if="readOnly">This exam is closed. Answers can no longer change.</template>
          <template v-else>
            Marking happens straight away. You can't change answers after submitting.
          </template>
        </p>
      </div>

      <div class="grid grid-cols-3 gap-2 sm:gap-3">
        <div class="flex flex-col gap-1 rounded-[24px] bg-surface px-4 py-4 sm:px-[22px] sm:py-5">
          <span class="text-[28px] font-extrabold tracking-[-0.03em] sm:text-4xl">
            {{ summary.answered }}
          </span>
          <span class="text-sm text-muted-fg">Answered</span>
        </div>
        <div class="flex flex-col gap-1 rounded-[24px] bg-warn-soft px-4 py-4 sm:px-[22px] sm:py-5">
          <span class="text-[28px] font-extrabold tracking-[-0.03em] text-warn sm:text-4xl">
            {{ summary.flagged }}
          </span>
          <span class="text-sm font-semibold">Flagged</span>
        </div>
        <div class="flex flex-col gap-1 rounded-[24px] bg-bad-soft px-4 py-4 sm:px-[22px] sm:py-5">
          <span class="text-[28px] font-extrabold tracking-[-0.03em] text-bad sm:text-4xl">
            {{ summary.unanswered }}
          </span>
          <span class="text-sm font-semibold">Unanswered · score zero</span>
        </div>
      </div>

      <div v-if="items.length" class="rounded-[28px] bg-surface p-2.5">
        <h2 class="sr-only">Questions to check</h2>
        <ul class="m-0 flex list-none flex-col p-0">
          <li v-for="item in items" :key="item.index">
            <button
              type="button"
              class="flex w-full min-w-0 items-center gap-3 rounded-[18px] px-3 py-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-brand sm:gap-3.5 sm:px-4 sm:py-3.5"
              @click="$emit('jump', item.index)"
            >
              <span
                class="grid h-[34px] w-[52px] flex-none place-items-center rounded-[12px] text-[13px] font-extrabold"
                :class="chipClass(item)"
              >
                {{ item.label }}
              </span>
              <span class="min-w-0 flex-1 truncate text-[15px]">{{ item.preview }}</span>
              <span
                class="hidden flex-none text-[13px] font-semibold sm:inline"
                :class="stateClass(item)"
              >
                {{ REVIEW_STATE_LABEL[item.state] }}
              </span>
              <span class="sr-only sm:hidden">, {{ REVIEW_STATE_LABEL[item.state] }}</span>
              <UIcon name="i-lucide-chevron-right" class="size-[18px] flex-none text-muted-fg" />
            </button>
          </li>
        </ul>
      </div>
      <p v-else class="m-0 rounded-[28px] bg-surface px-5 py-4 text-[15px] text-muted-fg">
        Every question has an answer and nothing is flagged.
      </p>

      <div
        v-if="problem?.kind === 'pending'"
        role="alert"
        class="flex flex-col gap-3 rounded-[24px] bg-warn-soft px-5 py-4 sm:flex-row sm:items-center"
      >
        <UIcon name="i-lucide-cloud-off" class="size-5 flex-none text-warn" />
        <p class="m-0 flex-1 text-[15px]">
          <strong class="font-bold">{{ pendingText }}</strong>
          Check your connection and try again. If you submit anyway, unsaved answers score zero.
        </p>
        <div class="flex flex-wrap gap-2">
          <button
            type="button"
            class="h-11 rounded-full bg-surface px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            :disabled="submitting"
            @click="$emit('submit', false)"
          >
            Try again
          </button>
          <button
            type="button"
            class="h-11 rounded-full border-[1.5px] border-warn px-4 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            :disabled="submitting"
            @click="$emit('submit', true)"
          >
            Submit anyway
          </button>
        </div>
      </div>
      <p
        v-else-if="problem?.kind === 'error'"
        role="alert"
        class="m-0 flex items-center gap-3 rounded-[24px] bg-bad-soft px-5 py-4 text-[15px]"
      >
        <UIcon name="i-lucide-triangle-alert" class="size-5 flex-none text-bad" />
        {{ problem.message }}
      </p>

      <div class="flex flex-wrap gap-2.5">
        <button
          v-if="!readOnly"
          type="button"
          class="flex h-[54px] items-center gap-2 rounded-full bg-surface-2 px-6 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          @click="$emit('back')"
        >
          <UIcon name="i-lucide-arrow-left" class="size-[18px]" />
          Back to exam
        </button>
        <div class="flex-1" />
        <button
          v-if="readOnly"
          type="button"
          class="flex h-[54px] items-center gap-2.5 rounded-full bg-brand px-7 text-base font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          @click="$emit('result')"
        >
          See your result
          <UIcon name="i-lucide-arrow-right" class="size-[18px]" />
        </button>
        <button
          v-else
          type="button"
          class="flex h-[54px] items-center gap-2.5 rounded-full bg-brand px-7 text-base font-bold text-white hover:bg-salus-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-70"
          :disabled="submitting"
          :aria-busy="submitting"
          @click="$emit('submit', false)"
        >
          <UIcon
            :name="submitting ? 'i-lucide-loader-circle' : 'i-lucide-send'"
            class="size-[18px]"
            :class="submitting ? 'animate-spin' : ''"
          />
          {{ submitting ? "Submitting…" : "Submit exam" }}
        </button>
      </div>
    </div>
  </div>
</template>
