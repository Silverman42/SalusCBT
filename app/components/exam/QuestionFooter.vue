<script setup lang="ts">
// Previous / Flag for review / Next (EX-7, mockup screens 02–04).
withDefaults(
  defineProps<{
    canPrev: boolean;
    nextLabel: string;
    flagged: boolean;
    readOnly: boolean;
    compact?: boolean;
  }>(),
  { compact: false },
);
defineEmits<{ prev: []; next: []; flag: [] }>();
</script>

<template>
  <div class="flex flex-wrap items-center gap-2 sm:gap-2.5">
    <button
      type="button"
      :disabled="!canPrev"
      aria-label="Previous question"
      class="flex h-12 items-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
      @click="$emit('prev')"
    >
      <UIcon name="i-lucide-arrow-left" class="size-[18px]" />
      <span v-if="!compact" class="hidden sm:inline">Previous</span>
    </button>
    <ExamFlagButton
      :flagged="flagged"
      :disabled="readOnly"
      :compact="compact"
      @toggle="$emit('flag')"
    />
    <button
      type="button"
      class="ml-auto flex h-12 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold whitespace-nowrap text-white hover:bg-salus-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-6"
      @click="$emit('next')"
    >
      {{ nextLabel }}
      <UIcon name="i-lucide-arrow-right" class="size-[18px]" />
    </button>
  </div>
</template>
