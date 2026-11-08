<script setup lang="ts">
// Question text with `code` and **bold** only, built as Vue nodes (SE-6: no v-html).
import { parseInline } from "~/lib/examRunner";

const props = withDefaults(defineProps<{ text: string; codeClass?: string }>(), {
  codeClass: "bg-surface-2 text-fg",
});
const tokens = computed(() => parseInline(props.text));
</script>

<template>
  <template v-for="(t, i) in tokens" :key="i">
    <code
      v-if="t.type === 'code'"
      class="rounded-[6px] px-1.5 py-0.5 font-mono text-[0.87em] break-words"
      :class="codeClass"
      >{{ t.value }}</code
    >
    <strong v-else-if="t.type === 'bold'" class="font-extrabold">{{ t.value }}</strong>
    <template v-else>{{ t.value }}</template>
  </template>
</template>
