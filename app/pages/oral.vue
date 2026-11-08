<script setup lang="ts">
// /oral (LLD §14.1; PRD CL-10): the tutor reads the oral questions one at a
// time and reveals each model answer on click. Tutor area (the "Oral
// questions" sidebar item in mockup screen 09); the mockup has no screen of
// its own, so the card follows the exam runner's question layout.
// `?version=<id>` picks a version (e.g. a class's); none means the default
// exam's current version. Convex checks the tutor role (SE-2).
import { computed } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { oralVersionLabel } from "~/lib/oral";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Oral questions" });

const route = useRoute();
const router = useRouter();
const { data: versions } = useStaffQuery(api.editor.myVersions, {});

const versionId = computed(() => {
  const q = route.query.version;
  return typeof q === "string" && q.length > 0 ? (q as Id<"examVersions">) : undefined;
});

const options = computed(() => {
  const list = (versions.value ?? []).map((v) => ({
    value: v.versionId as string,
    label: oralVersionLabel(v),
  }));
  // Keep an unlisted `?version=` selectable, so the select shows what's open.
  if (versionId.value && !list.some((o) => o.value === versionId.value)) {
    list.unshift({ value: versionId.value, label: "Linked version" });
  }
  return list;
});

function pick(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  void router.replace({ query: value ? { version: value } : {} });
}
</script>

<template>
  <div class="flex max-w-[860px] flex-col gap-4">
    <label class="flex flex-col gap-1.5 sm:max-w-[420px]">
      <span class="text-sm font-semibold text-muted-fg">Exam version</span>
      <select
        :value="versionId ?? ''"
        class="h-[46px] w-full min-w-0 rounded-[16px] border-2 border-transparent bg-surface px-3.5 text-sm font-bold text-fg focus:border-brand focus:outline-none"
        @change="pick"
      >
        <option value="">Default exam (current version)</option>
        <option v-for="o in options" :key="o.value" :value="o.value">{{ o.label }}</option>
      </select>
    </label>
    <OralQuestionDeck :key="versionId ?? 'default'" :version-id="versionId" />
  </div>
</template>
