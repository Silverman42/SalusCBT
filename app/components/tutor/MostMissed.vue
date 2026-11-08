<script setup lang="ts">
// "Most missed" card (mockup screen 09, CL-6): the 10 questions the class
// missed most, with domain, miss rate and a bar. Unanswered counts as missed.
import type { FunctionReturnType } from "convex/server";
import type { api } from "~~/convex/_generated/api";
import { attemptCount, DOMAIN_NAMES, formatPercent, missedLabel } from "~/lib/tutor";
import { plainText } from "~/lib/examRunner";

type Stats = FunctionReturnType<typeof api.classes.stats>;

defineProps<{ stats: Stats }>();
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-[28px] bg-surface px-[22px] py-5"
    aria-labelledby="missed-heading"
  >
    <h2 id="missed-heading" class="m-0 text-base font-extrabold">Most missed</h2>
    <p v-if="stats.mostMissed.length === 0" class="m-0 text-sm text-muted-fg">
      {{
        stats.submittedCount === 0
          ? "Shows once students submit."
          : "Nobody has missed a question yet."
      }}
    </p>
    <ol v-else class="m-0 flex list-none flex-col gap-3 p-0">
      <li v-for="m in stats.mostMissed" :key="m.questionId" class="flex flex-col gap-1.5">
        <div class="flex items-baseline justify-between gap-2 text-[13px]">
          <span class="min-w-0 truncate font-bold" :title="plainText(m.stem)">
            {{ missedLabel(m) }}
            <span class="font-medium text-muted-fg">
              {{ m.domain }}<span class="sr-only"> {{ DOMAIN_NAMES[m.domain] }}</span>
            </span>
            <span class="ml-1 font-normal text-muted-fg">{{ plainText(m.stem) }}</span>
          </span>
          <span class="flex-none font-extrabold text-bad tabular-nums">
            {{ formatPercent(m.missRate) }}
            <span class="sr-only">missed, {{ m.missed }} of {{ m.sat }}</span>
          </span>
        </div>
        <div class="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
          <div class="h-full rounded-full bg-brand" :style="{ width: formatPercent(m.missRate) }" />
        </div>
      </li>
    </ol>
    <p
      v-if="stats.mostMissed.length > 0 && stats.mostMissedSample < stats.submittedCount"
      class="m-0 text-xs text-muted-fg"
    >
      Based on the newest {{ attemptCount(stats.mostMissedSample) }}.
    </p>
  </section>
</template>
