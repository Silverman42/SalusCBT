<script setup lang="ts">
useHead({
  htmlAttrs: { lang: "en" },
  link: [{ rel: "icon", type: "image/svg+xml", href: "/favicon.svg" }],
});

/** Set before each navigation by app/plugins/page-direction.ts. */
const transitionName = useState("page-transition-name", () => "page-fade");
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage :transition="{ name: transitionName, mode: 'out-in' }" />
    </NuxtLayout>
  </UApp>
</template>
