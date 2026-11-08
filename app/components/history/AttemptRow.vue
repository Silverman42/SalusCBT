<script setup lang="ts">
// One attempt in the student history (T-217, EX-19), after the "Attempt
// history" card of mockup screen 06. `compact` drops the links (the result
// page's recent list links the whole row instead).
import type { HistoryRow, RowTone } from "~/lib/history";

const props = defineProps<{ row: HistoryRow; compact?: boolean }>();

const TONES: Record<RowTone, string> = {
  ok: "bg-ok-soft text-fg",
  bad: "bg-bad-soft text-fg",
  brand: "bg-brand-soft text-brand-ink",
  muted: "bg-surface-2 text-muted-fg",
};
const toneClass = computed(() => TONES[props.row.badge.tone]);
</script>

<template>
  <div v-if="compact" class="flex min-w-0 items-center gap-3 text-sm">
    <NuxtLink
      v-if="row.links[0]"
      :to="row.links[0].to"
      class="min-w-0 flex-1 truncate text-muted-fg hover:text-fg hover:underline"
    >
      {{ row.title }}
    </NuxtLink>
    <span v-else class="min-w-0 flex-1 truncate text-muted-fg">{{ row.title }}</span>
    <span v-if="row.score" class="font-extrabold tabular-nums">{{ row.score }}</span>
    <span class="flex-none rounded-full px-2.5 py-1 text-xs font-bold" :class="toneClass">
      {{ row.badge.label }}
    </span>
  </div>

  <li
    v-else
    class="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3 rounded-[22px] bg-surface px-5 py-4 sm:px-6"
  >
    <div class="flex min-w-0 flex-1 basis-[220px] flex-col gap-0.5">
      <span class="text-[15px] font-bold">{{ row.title }}</span>
      <span v-if="row.points" class="text-[13px] text-muted-fg tabular-nums">{{ row.points }}</span>
    </div>
    <div class="flex items-center gap-2.5">
      <span v-if="row.score" class="text-2xl font-extrabold tracking-[-0.02em] tabular-nums">
        {{ row.score }}
      </span>
      <span class="rounded-full px-2.5 py-1 text-xs font-bold" :class="toneClass">
        {{ row.badge.label }}
      </span>
    </div>
    <div v-if="row.links.length" class="flex w-full gap-2 sm:w-auto">
      <UButton
        v-for="link in row.links"
        :key="link.to"
        :to="link.to"
        :icon="link.icon"
        :label="link.label"
        :variant="link.primary ? 'solid' : 'soft'"
        :aria-label="`${link.label}: ${row.title}`"
        class="flex-1 justify-center rounded-full sm:flex-none"
      />
    </div>
  </li>
</template>
