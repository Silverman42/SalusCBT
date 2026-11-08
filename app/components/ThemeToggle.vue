<script setup lang="ts">
const colorMode = useColorMode();
const isDark = computed(() => colorMode.value === "dark");

function toggle() {
  colorMode.preference = isDark.value ? "light" : "dark";
}
</script>

<template>
  <ClientOnly>
    <button
      type="button"
      class="grid size-[42px] place-items-center rounded-full bg-surface-2 text-muted-fg transition-colors hover:text-fg"
      :aria-label="isDark ? 'Switch to light theme' : 'Switch to dark theme'"
      @click="toggle"
    >
      <UIcon :name="isDark ? 'i-lucide-sun' : 'i-lucide-moon'" class="size-[18px]" />
    </button>
    <template #fallback>
      <span class="size-[42px] rounded-full bg-surface-2" />
    </template>
  </ClientOnly>
</template>
