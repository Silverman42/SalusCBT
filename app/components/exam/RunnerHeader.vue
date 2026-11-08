<script setup lang="ts">
// Runner top bar (mockup screens 02–05): logo, context chip, save state,
// timer slot (T-214 puts <ExamTimer> there), theme toggle, Review & submit.
withDefaults(defineProps<{ chip?: string | null; showReview?: boolean }>(), {
  chip: null,
  showReview: true,
});
defineEmits<{ review: [] }>();
</script>

<template>
  <header
    class="flex h-[68px] flex-none items-center gap-2 bg-surface px-3 sm:h-[76px] sm:gap-4 sm:px-7"
  >
    <div class="flex items-center gap-2.5">
      <span class="grid size-9 flex-none place-items-center rounded-[12px] bg-brand text-white">
        <UIcon name="i-lucide-shield" class="size-[18px]" />
      </span>
      <span class="hidden text-xl font-extrabold tracking-[-0.02em] sm:inline">Salus</span>
    </div>
    <span
      v-if="chip"
      class="hidden rounded-full bg-surface-2 px-3 py-[7px] text-[13px] whitespace-nowrap text-muted-fg md:inline"
    >
      {{ chip }}
    </span>
    <div class="flex-1" />
    <slot name="status" />
    <slot name="timer" />
    <ThemeToggle />
    <button
      v-if="showReview"
      type="button"
      class="rounded-full bg-brand px-4 py-[11px] text-sm font-bold whitespace-nowrap text-white hover:bg-salus-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand sm:px-5"
      @click="$emit('review')"
    >
      <span class="sm:hidden">Review</span>
      <span class="hidden sm:inline">Review &amp; submit</span>
    </button>
  </header>
</template>
