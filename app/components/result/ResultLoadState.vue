<script setup lang="ts">
// Loading and failure states for the student result and review pages
// (T-215, T-216). An unfinished attempt offers "Return to exam".
import { examPath, LOAD_FAILURES, type LoadFailure } from "~/lib/attemptPages";

const props = defineProps<{
  attemptId: string;
  failure: LoadFailure | null;
  loading?: boolean;
  /** What is loading, for the status line ("your result", "the review"). */
  what?: string;
}>();

const emit = defineEmits<{ retry: [] }>();

const text = computed(() => (props.failure ? LOAD_FAILURES[props.failure] : null));
</script>

<template>
  <div class="flex flex-1 items-center justify-center py-10">
    <div
      v-if="text"
      role="alert"
      class="flex w-full max-w-[560px] flex-col items-center gap-4 rounded-[32px] bg-surface px-6 py-12 text-center sm:px-10"
    >
      <span class="grid size-14 place-items-center rounded-[18px] bg-brand-soft text-brand-ink">
        <UIcon :name="text.icon" class="size-6" />
      </span>
      <h1 class="m-0 text-2xl font-extrabold tracking-[-0.02em]">{{ text.title }}</h1>
      <p class="m-0 text-[15px] leading-[1.55] text-pretty text-muted-fg">{{ text.body }}</p>
      <div class="flex flex-wrap justify-center gap-2">
        <UButton
          v-if="failure === 'in_progress'"
          :to="examPath(attemptId)"
          icon="i-lucide-arrow-left"
          label="Return to exam"
          size="lg"
        />
        <UButton
          v-else-if="failure === 'network'"
          icon="i-lucide-rotate-cw"
          label="Try again"
          size="lg"
          @click="emit('retry')"
        />
        <UButton
          v-if="failure === 'not_found' || failure === 'bad_token'"
          to="/history"
          icon="i-lucide-history"
          label="Your history"
          size="lg"
        />
        <UButton to="/" label="Back to home" size="lg" variant="soft" />
      </div>
    </div>
    <span
      v-else-if="loading"
      role="status"
      aria-live="polite"
      class="flex items-center gap-3 text-[15px] font-semibold text-muted-fg"
    >
      <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
      Loading {{ what ?? "your result" }}…
    </span>
  </div>
</template>
