<script setup lang="ts">
// This browser's latest attempts (`review.myAttempts`, LLD §4): offers
// "Resume your exam" for one still running and, on the landing page, the
// last score with a history link (mockup screen 01). Client only; renders
// nothing until the anonymous identity is ready or if the query fails.
import { ref, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import {
  lastMarkedAttempt,
  resumableAttempt,
  scoreBadgeText,
  shortDate,
  type AttemptSummaryLike,
} from "~/lib/start";

withDefaults(defineProps<{ showLast?: boolean }>(), { showLast: true });

const { token } = useAnonIdentity();
const nuxtApp = useNuxtApp();
const attempts = ref<AttemptSummaryLike[]>([]);

watch(
  token,
  async (t) => {
    attempts.value = [];
    if (!import.meta.client || !t) return;
    try {
      const page = await nuxtApp.$convex.query(api.review.myAttempts, {
        anonToken: t,
        paginationOpts: { numItems: 5, cursor: null },
      });
      if (token.value === t) attempts.value = page.page;
    } catch {
      // Offline or a bad token: the landing page works without it.
    }
  },
  { immediate: true },
);

const resume = computed(() => resumableAttempt(attempts.value, Date.now()));
const last = computed(() => lastMarkedAttempt(attempts.value));
</script>

<template>
  <div v-if="resume || (showLast && last)" class="flex flex-col gap-3">
    <div
      v-if="resume"
      class="flex flex-wrap items-center gap-x-4 gap-y-3 rounded-[20px] bg-warn-soft px-4 py-3 text-[15px]"
      role="status"
    >
      <UIcon name="i-lucide-hourglass" class="size-5 flex-none text-warn" aria-hidden="true" />
      <span class="min-w-0 flex-1 font-semibold">
        You have an exam in progress, started {{ shortDate(resume.startedAt) }}. The timer is still
        running.
      </span>
      <UButton
        :to="`/exam/${encodeURIComponent(resume.attemptId)}`"
        size="md"
        trailing-icon="i-lucide-arrow-right"
        label="Resume your exam"
      />
    </div>
    <p
      v-if="showLast && last"
      class="m-0 flex flex-wrap items-center gap-x-3.5 gap-y-2 text-sm text-muted-fg"
    >
      <span
        class="rounded-full px-3 py-1.5 font-bold"
        :class="last.passed ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'"
      >
        {{ scoreBadgeText(last) }}
      </span>
      <span>Your last attempt, {{ shortDate(last.submittedAt ?? last.startedAt) }} ·</span>
      <NuxtLink to="/history" class="font-semibold text-brand-ink hover:underline">
        View history
      </NuxtLink>
    </p>
  </div>
</template>
