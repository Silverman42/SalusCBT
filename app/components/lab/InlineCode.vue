<script setup lang="ts">
// Renders a sentence where `backticks` mark inline code (lab instructions, LB-9).
const props = defineProps<{ text: string }>();
const parts = computed(() =>
  props.text.split("`").map((value, i) => ({ value, code: i % 2 === 1 })),
);
</script>

<template>
  <template v-for="(part, i) in parts" :key="i">
    <code
      v-if="part.code"
      class="rounded-md bg-surface-2 px-1.5 py-0.5 font-mono text-[0.87em] whitespace-nowrap text-fg"
      >{{ part.value }}</code
    >
    <template v-else>{{ part.value }}</template>
  </template>
</template>
