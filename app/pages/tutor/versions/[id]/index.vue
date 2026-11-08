<script setup lang="ts">
// /tutor/versions/[id] (LLD §14.1; ED-8, ED-9): one version in the question
// editor (mockup screen 11). Client-rendered; Convex checks ownership on
// every call, so another tutor's version shows "couldn't find".
import { computed } from "vue";
import type { Id } from "~~/convex/_generated/dataModel";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Question editor" });

const route = useRoute();
const versionId = computed(() => String(route.params.id ?? "") as Id<"examVersions">);
</script>

<template>
  <EditorVersionEditor :key="versionId" :version-id="versionId" />
</template>
