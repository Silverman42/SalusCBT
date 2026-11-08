<script setup lang="ts">
// Result summary card, after mockup screen 06 (EX-14–EX-16): score banner,
// domain breakdown, time used and flagged count. Used by the share page
// (T-504) and meant for the student result page (T-215): pass the
// `review.getResult` or `shareLinks.view` result; put buttons in `#actions`.
import { domainRows, formatDuration, passPoints, type ResultSummaryData } from "~/lib/resultView";

const props = defineProps<{ view: ResultSummaryData }>();

const r = computed(() => props.view.result);
const rows = computed(() => domainRows(props.view));
const targetPct = computed(() => Math.round(props.view.domainTarget * 100));
</script>

<template>
  <div class="grid min-w-0 gap-4 lg:grid-cols-[1fr_400px] lg:gap-5">
    <div class="flex min-w-0 flex-col gap-4 lg:gap-5">
      <!-- Score banner -->
      <div class="flex items-center overflow-hidden rounded-[32px] bg-salus-500 text-white">
        <div class="flex min-w-0 flex-1 flex-col gap-3 px-6 py-7 sm:px-10 sm:py-9">
          <div class="flex flex-wrap gap-2">
            <span
              v-if="r.passed"
              class="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-[7px] text-sm font-extrabold text-[#0F8F63]"
            >
              <UIcon name="i-lucide-check" class="size-3.5" />Pass
            </span>
            <span
              v-else
              class="flex items-center gap-1.5 rounded-full bg-white px-3.5 py-[7px] text-sm font-extrabold text-[#D33A47]"
            >
              <UIcon name="i-lucide-x" class="size-3.5" />Below {{ view.passScaled }}
            </span>
            <span
              v-if="r.comfortable"
              class="rounded-full bg-[#7C62FF] px-3.5 py-[7px] text-sm font-bold"
            >
              Comfortable margin
            </span>
          </div>
          <div class="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
            <span
              class="text-[72px] leading-none font-extrabold tracking-[-0.05em] tabular-nums sm:text-[104px]"
            >
              {{ r.scaled }}
            </span>
            <span class="text-lg font-semibold text-salus-200 sm:text-xl">/ 900 scaled</span>
          </div>
          <span class="text-[15px] text-salus-100 sm:text-base">
            {{ r.points }} of {{ r.totalPoints }} points · pass mark {{ view.passScaled }} ({{
              passPoints(view)
            }}
            points)
          </span>
        </div>
        <svg
          viewBox="0 0 340 280"
          class="hidden h-[280px] w-[340px] flex-none md:block"
          aria-hidden="true"
        >
          <circle cx="250" cy="60" r="130" fill="#7457FF" />
          <rect x="60" y="170" width="44" height="80" rx="16" fill="#8F7BFF" />
          <rect x="118" y="130" width="44" height="120" rx="16" fill="#A898FF" />
          <rect x="176" y="96" width="44" height="154" rx="16" fill="#C3B6FF" />
          <rect x="234" y="56" width="44" height="194" rx="16" fill="#fff" />
          <circle cx="256" cy="34" r="26" fill="#3A1FC9" />
          <path
            d="M244 34 l8 8 l16 -16"
            fill="none"
            stroke="#fff"
            stroke-width="5"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <g fill="#fff">
            <rect x="78" y="92" width="5" height="22" rx="2.5" />
            <rect x="69.5" y="100.5" width="22" height="5" rx="2.5" />
          </g>
          <circle cx="140" cy="70" r="6" fill="#C3B6FF" />
          <circle cx="310" cy="160" r="8" fill="#C3B6FF" />
        </svg>
      </div>

      <!-- Domain breakdown (EX-15) -->
      <section
        aria-labelledby="domain-breakdown"
        class="flex flex-col gap-4 rounded-[28px] bg-surface px-5 py-6 sm:px-[30px] sm:py-[26px]"
      >
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="domain-breakdown" class="m-0 text-lg font-extrabold">Domain breakdown</h2>
          <span class="text-[13px] text-muted-fg">Highlighted under {{ targetPct }}%</span>
        </div>
        <div v-for="d in rows" :key="d.domain" class="flex flex-col gap-[7px]">
          <div class="flex items-center gap-2.5 text-sm">
            <span class="min-w-0 flex-1 font-semibold">{{ d.label }}</span>
            <span
              v-if="d.low"
              class="flex-none rounded-full bg-warn-soft px-[9px] py-[3px] text-[11px] font-bold text-warn"
            >
              Weak domain
            </span>
            <span class="flex-none text-muted-fg tabular-nums">{{ d.points }}/{{ d.max }}</span>
            <span class="w-11 flex-none text-right font-extrabold tabular-nums">{{ d.pct }}%</span>
          </div>
          <div
            class="h-2.5 overflow-hidden rounded-full bg-surface-2"
            role="meter"
            :aria-label="d.label"
            aria-valuemin="0"
            aria-valuemax="100"
            :aria-valuenow="d.pct"
          >
            <div
              class="h-full rounded-full"
              :class="d.low ? 'bg-warn' : 'bg-brand'"
              :style="{ width: `${d.pct}%` }"
            />
          </div>
        </div>
      </section>
    </div>

    <div class="flex min-w-0 flex-col gap-4 lg:gap-5">
      <div class="grid grid-cols-2 gap-3">
        <div class="flex flex-col gap-1.5 rounded-[24px] bg-surface p-5">
          <UIcon name="i-lucide-clock" class="size-5 text-brand-ink" />
          <span class="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums">
            {{ formatDuration(r.timeUsedSec) }}
          </span>
          <span class="text-[13px] text-muted-fg">Time used</span>
        </div>
        <div class="flex flex-col gap-1.5 rounded-[24px] bg-surface p-5">
          <UIcon name="i-lucide-flag" class="size-5 text-brand-ink" />
          <span class="text-[26px] font-extrabold tracking-[-0.02em] tabular-nums">
            {{ r.flaggedCount }}
          </span>
          <span class="text-[13px] text-muted-fg">Flagged</span>
        </div>
      </div>
      <slot name="actions" />
    </div>
  </div>
</template>
