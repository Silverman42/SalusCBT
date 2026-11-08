<script setup lang="ts">
// Countdown pill for the runner header (mockup screens 02–05, EX-3), plus
// the assertive live region for time calls and pacing alerts (EX-4, EX-5).
// The clock itself is `role="timer"` (not live), so it isn't read out every
// second; screen-reader users hear each call once, when it fires.
import { formatClock } from "~/lib/examRunner";

const props = defineProps<{
  remainingMs: number | null;
  /** Latest call or alert text; announced when it changes. */
  announcement?: string;
}>();

/** Warn colour for the last 10 minutes (as T-213). */
const LOW_MS = 10 * 60_000;

const clock = computed(() =>
  props.remainingMs === null ? "--:--" : formatClock(props.remainingMs),
);
const low = computed(() => props.remainingMs !== null && props.remainingMs < LOW_MS);
const spoken = computed(() => {
  if (props.remainingMs === null) return "loading";
  const min = Math.ceil(props.remainingMs / 60_000);
  return min <= 1 ? "less than a minute" : `about ${min} minutes`;
});
</script>

<template>
  <div
    role="timer"
    :aria-label="`Time remaining: ${spoken}`"
    class="flex items-center gap-2 rounded-full px-3 py-2 text-base font-extrabold tabular-nums motion-safe:transition-colors sm:px-[18px] sm:py-[9px] sm:text-lg"
    :class="low ? 'bg-warn-soft text-warn' : 'bg-brand-soft text-brand-ink'"
  >
    <UIcon name="i-lucide-clock" class="size-[18px]" aria-hidden="true" />
    <span aria-hidden="true">{{ clock }}</span>
  </div>
  <div class="sr-only" aria-live="assertive" aria-atomic="true">{{ announcement }}</div>
</template>
