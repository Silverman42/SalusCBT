<script setup lang="ts">
// A field's error (red) or publish hint (amber) under a PBQ form field. The
// field points at it with `aria-describedby`; `id` is the field's DOM id.
defineProps<{ id: string; error?: string | null; hint?: string | null }>();
</script>

<template>
  <p v-if="error" :id="`${id}-error`" class="m-0 text-[13px] font-semibold text-bad">
    {{ error }}
  </p>
  <p
    v-else-if="hint"
    :id="`${id}-hint`"
    class="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-warn"
  >
    <UIcon name="i-lucide-triangle-alert" class="size-4 flex-none" />
    {{ hint }}
  </p>
</template>
