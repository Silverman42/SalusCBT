<script setup lang="ts">
// Soft status pill (mockup screen 10: "Active", "Removed").
import { BADGE_CLASSES, type Badge } from "~/lib/admin";

defineProps<{ badge: Badge }>();
</script>

<template>
  <span
    class="inline-flex rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap"
    :class="BADGE_CLASSES[badge.tone]"
  >
    {{ badge.label }}
  </span>
</template>
