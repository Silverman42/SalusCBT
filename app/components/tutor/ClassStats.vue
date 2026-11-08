<script setup lang="ts">
// Stat tiles (mockup screen 09, CL-6): attempts, average score, pass rate and
// the class domain breakdown (bars below the 81% target turn amber). Scores
// cover submitted attempts only.
import type { FunctionReturnType } from "convex/server";
import { computed } from "vue";
import type { api } from "~~/convex/_generated/api";
import { DOMAIN_NAMES, domainBarHeight, formatPercent, formatScore } from "~/lib/tutor";

type Stats = FunctionReturnType<typeof api.classes.stats>;

const props = defineProps<{ stats: Stats }>();

const tiles = computed(() => {
  const s = props.stats;
  return [
    {
      label: "Attempts",
      value: String(s.attemptCount),
      note:
        s.inProgressCount > 0
          ? `${s.inProgressCount} in progress · ${s.submittedCount} submitted`
          : `${s.submittedCount} submitted`,
    },
    {
      label: "Average score",
      value: formatScore(s.avgScaled),
      note:
        s.medianScaled === null
          ? `Pass mark ${s.passScaled}`
          : `Median ${formatScore(s.medianScaled)}`,
    },
    {
      label: "Pass rate",
      value: formatPercent(s.passRate),
      note:
        s.submittedCount > 0 ? `${s.passedCount} of ${s.submittedCount} passed` : "No results yet",
    },
  ];
});
</script>

<template>
  <section
    aria-label="Class statistics"
    class="grid grid-cols-2 gap-3 sm:gap-3.5 lg:grid-cols-[repeat(3,1fr)_1.4fr]"
  >
    <div
      v-for="tile in tiles"
      :key="tile.label"
      class="flex flex-col gap-1 rounded-[24px] bg-surface px-5 py-[18px]"
    >
      <span class="text-[13px] text-muted-fg">{{ tile.label }}</span>
      <span class="text-[30px] leading-tight font-extrabold tracking-[-0.02em] tabular-nums">
        {{ tile.value }}
      </span>
      <span class="text-xs text-muted-fg">{{ tile.note }}</span>
    </div>

    <figure
      class="col-span-2 m-0 flex flex-col justify-center gap-[7px] rounded-[24px] bg-surface px-5 py-4 lg:col-span-1"
    >
      <figcaption class="text-[13px] text-muted-fg">
        Class domains
        <span class="sr-only">(target {{ formatPercent(stats.domainTarget) }})</span>
      </figcaption>
      <div class="flex h-[60px] items-end gap-2" aria-hidden="true">
        <div
          v-for="d in stats.domains"
          :key="d.domain"
          class="flex h-full flex-1 flex-col items-center justify-end gap-1"
          :title="`${d.domain} ${DOMAIN_NAMES[d.domain] ?? ''}: ${formatPercent(d.share)}`"
        >
          <div
            class="w-full rounded-[8px]"
            :class="d.share === null ? 'bg-surface-2' : d.belowTarget ? 'bg-warn' : 'bg-brand'"
            :style="{ height: `${domainBarHeight(d.share) * 0.7}%` }"
          />
          <span class="text-[10px] font-bold text-muted-fg">{{ d.domain }}</span>
        </div>
      </div>
      <ul class="sr-only">
        <li v-for="d in stats.domains" :key="d.domain">
          Domain {{ d.domain }} {{ DOMAIN_NAMES[d.domain] }}:
          {{ d.share === null ? "no results yet" : formatPercent(d.share)
          }}{{ d.belowTarget ? ", below target" : "" }}
        </li>
      </ul>
    </figure>
  </section>
</template>
