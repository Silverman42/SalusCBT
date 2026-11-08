<script setup lang="ts">
// "Flag for review" toggle (EX-7). A toggle button: aria-pressed carries the state.
withDefaults(defineProps<{ flagged: boolean; disabled?: boolean; compact?: boolean }>(), {
  disabled: false,
  compact: false,
});
defineEmits<{ toggle: [] }>();
</script>

<template>
  <button
    type="button"
    :aria-pressed="flagged"
    :disabled="disabled"
    class="flex h-12 items-center gap-2 rounded-full border-[1.5px] px-4 text-[15px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
    :class="
      flagged
        ? 'border-warn bg-warn-soft text-fg'
        : 'border-line text-muted-fg hover:border-warn hover:text-fg'
    "
    @click="$emit('toggle')"
  >
    <UIcon
      :name="flagged ? 'i-lucide-flag-triangle-right' : 'i-lucide-flag'"
      class="size-[18px] flex-none"
      :class="flagged ? 'text-warn' : ''"
    />
    <!-- The label stays the same; aria-pressed and the colour show the state. -->
    <template v-if="compact">Flag</template>
    <template v-else>
      <span class="sm:hidden">Flag</span>
      <span class="hidden sm:inline">Flag for review</span>
    </template>
  </button>
</template>
