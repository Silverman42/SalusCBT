<script setup lang="ts">
// Staff layout for /admin/** and /tutor/** (mockup screens 09 and 10): a
// 248px sidebar on wide screens, a top bar with a menu sheet on phones, and
// the page title with the theme toggle above the content. Pages opt in with
// `definePageMeta({ layout: "staff", title: "…" })`. Client-rendered only.
import { computed, ref, watch } from "vue";
import { ROLE_LABEL, staffAreaOf } from "~/lib/staffNav";

const route = useRoute();
const title = computed(() => (typeof route.meta.title === "string" ? route.meta.title : ""));
const area = computed(() => staffAreaOf(route.path));
const menuOpen = ref(false);

watch(
  () => route.fullPath,
  () => (menuOpen.value = false),
);

useHead({
  title: () => (title.value ? `${title.value} · ${ROLE_LABEL[area.value]} · Salus` : "Salus"),
  meta: [{ name: "robots", content: "noindex" }],
});
</script>

<template>
  <div class="flex min-h-dvh bg-canvas text-fg">
    <aside
      class="sticky top-0 hidden h-dvh w-[248px] flex-none flex-col bg-surface px-4 py-6 lg:flex"
    >
      <StaffSidebar />
    </aside>

    <div class="flex min-w-0 flex-1 flex-col">
      <header class="flex h-16 flex-none items-center gap-3 bg-surface px-4 lg:hidden">
        <NuxtLink to="/" class="flex items-center gap-2 text-fg">
          <span class="grid size-8 place-items-center rounded-[10px] bg-brand text-white">
            <UIcon name="i-lucide-shield" class="size-4" />
          </span>
          <span class="text-lg font-extrabold tracking-[-0.02em]">Salus</span>
          <span class="sr-only">home</span>
        </NuxtLink>
        <span class="text-sm font-semibold text-muted-fg">{{ ROLE_LABEL[area] }}</span>
        <div class="flex-1" />
        <ThemeToggle />
        <USlideover v-model:open="menuOpen" side="left" title="Menu" :ui="{ content: 'max-w-72' }">
          <button
            type="button"
            class="grid size-[42px] place-items-center rounded-full bg-surface-2 text-fg"
            aria-label="Open menu"
          >
            <UIcon name="i-lucide-menu" class="size-5" />
          </button>
          <template #content>
            <div class="h-full bg-surface px-4 py-6">
              <StaffSidebar @navigate="menuOpen = false" />
            </div>
          </template>
        </USlideover>
      </header>

      <main class="flex min-w-0 flex-1 flex-col gap-[18px] px-4 py-5 sm:px-7 sm:py-7">
        <div class="flex items-center gap-4">
          <h1 class="m-0 flex-1 text-[26px] font-extrabold tracking-[-0.03em] sm:text-[32px]">
            {{ title }}
          </h1>
          <div class="hidden lg:block">
            <ThemeToggle />
          </div>
        </div>
        <slot />
      </main>
    </div>
  </div>
</template>
