<script setup lang="ts">
// The "Why" box of a reviewed question (mockup screen 07); nothing when empty.
defineProps<{ text: string }>();
</script>

<template>
  <div
    v-if="text"
    class="flex max-w-[760px] flex-col gap-2 rounded-[22px] bg-brand-soft px-5 py-5 sm:px-[22px]"
  >
    <span class="flex items-center gap-2 font-extrabold text-brand-ink">
      <UIcon name="i-lucide-circle-help" class="size-[18px]" />Why
    </span>
    <p class="m-0 text-[15px] leading-[1.6] text-pretty whitespace-pre-line">
      <LabInlineCode :text="text" />
    </p>
  </div>
</template>
