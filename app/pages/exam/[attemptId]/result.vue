<script setup lang="ts">
// Student result (T-215, LLD §14.1, PRD EX-14–EX-16), after mockup screen 06.
// Client only (routeRules `/exam/**`): the anon token lives in localStorage.
// The runner navigates here right after submit; the result was marked by the
// submit mutation, so it is ready on the first query.
import { formatDate } from "~/lib/resultView";
import { modeLabel, RETAKE_START_PATH, reviewPath } from "~/lib/attemptPages";

useSeoMeta({ title: "Your result · Salus", robots: "noindex" });

const route = useRoute();
const attemptId = String(route.params.attemptId);

const { result, failure, loading, retry } = useStudentResult(attemptId);
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[1280px] min-w-0 flex-1 flex-col gap-5 px-4 pt-2 pb-12 sm:px-5"
  >
    <template v-if="result">
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <h1
          class="m-0 flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-[7px] text-[13px] font-bold text-brand-ink"
        >
          <UIcon name="i-lucide-badge-check" class="size-3.5" />Your result
        </h1>
        <span class="rounded-full bg-surface-2 px-3 py-[7px] text-muted-fg">
          {{ result.examTitle }} · {{ modeLabel(result.mode) }} ·
          {{ formatDate(result.submittedAt) }}
          <template v-if="result.submittedBy === 'timer'"> · submitted when time ran out</template>
        </span>
      </div>

      <ResultSummary :view="result">
        <template #actions>
          <UButton
            :to="reviewPath(attemptId)"
            icon="i-lucide-book-open"
            label="Review answers"
            size="xl"
            block
            class="h-14 text-base font-bold"
          />
          <!-- PB-4 seam: shown once the start flow takes a mode (T-307). -->
          <UButton
            v-if="RETAKE_START_PATH"
            :to="RETAKE_START_PATH"
            icon="i-lucide-rotate-ccw"
            label="Retake with PBQ set B"
            size="xl"
            variant="soft"
            block
            class="h-14 text-base font-bold"
          />
          <ResultShareLinkPanel :attempt-id="attemptId" />
          <HistoryRecent />
        </template>
      </ResultSummary>
    </template>

    <ResultLoadState
      v-else
      :attempt-id="attemptId"
      :failure="failure"
      :loading="loading"
      @retry="retry"
    />
  </section>
</template>
