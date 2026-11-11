<script setup lang="ts">
// Routes come from LLD §14.1; the pages themselves arrive in later tasks.
const links = [
  { label: "Practice lab", to: "/lab" },
  { label: "How scoring works", to: "/#scoring" },
  { label: "Privacy", to: "/privacy" },
];

const route = useRoute();
/** Tutor and admin pages (client-rendered) get "Sign out" (AU-4). */
const onStaffPage = computed(() => /^\/(tutor|admin)(\/|$)/.test(route.path));
/** The sign-in and invite pages don't link to themselves. */
// const onAuthPage = computed(() => /^\/(sign-in|invite)(\/|$)/.test(route.path));
</script>

<template>
  <header class="flex h-20 flex-none items-center gap-3 px-4 sm:gap-8 sm:px-12">
    <AppLogo />
    <nav aria-label="Main" class="hidden gap-7 text-[15px] font-medium text-muted-fg md:flex">
      <NuxtLink v-for="link in links" :key="link.to" :to="link.to" class="hover:text-fg">
        {{ link.label }}
      </NuxtLink>
    </nav>
    <div class="flex-1" />
    <ThemeToggle />
    <ClientOnly v-if="onStaffPage">
      <AuthSignOutButton />
    </ClientOnly>
    <!-- <NuxtLink
      v-else-if="!onAuthPage"
      to="/sign-in"
      class="rounded-full border-[1.5px] border-line px-4 py-[11px] whitespace-nowrap sm:px-5 text-sm font-semibold text-fg hover:border-brand"
    >
      Staff sign in
    </NuxtLink> -->
  </header>
</template>
