<script setup lang="ts">
// /tutor/classes/[id] (LLD §14.1, mockup screen 09): the class banner with
// code, join link, edit and close/reopen; live stats, attempt table (sort,
// filter, CSV, multi-select delete) and most-missed questions. The class
// comes from `classes.mine` (there is no single-class query), so another
// tutor's class id shows "not found" without subscribing to its data.
import { computed } from "vue";
import { api } from "~~/convex/_generated/api";
import { useMinuteClock } from "~/composables/useMinuteClock";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { tutorErrorMessage } from "~/lib/tutor";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Class dashboard" });

const route = useRoute();
const now = useMinuteClock();
const classId = computed(() => String(route.params.id ?? ""));
const { data: classes, error, loading } = useStaffQuery(api.classes.mine, {});
const klass = computed(() => classes.value?.find((c) => c.classId === classId.value) ?? null);

useHead({
  title: () => (klass.value ? `${klass.value.name} · Tutor · Salus` : "Class · Tutor · Salus"),
});
</script>

<template>
  <div class="flex min-w-0 flex-col gap-[18px]">
    <NuxtLink
      to="/tutor"
      class="-mt-2 inline-flex items-center gap-1 self-start text-sm font-semibold text-muted-fg hover:text-fg"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      All classes
    </NuxtLink>

    <p v-if="loading" class="m-0 text-sm text-muted-fg">Loading class…</p>
    <p
      v-else-if="error"
      class="m-0 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
      role="alert"
    >
      {{ tutorErrorMessage(error, "load") }}
    </p>
    <section
      v-else-if="!klass"
      class="flex flex-col items-start gap-3 rounded-[28px] bg-surface px-[22px] py-5"
      aria-labelledby="missing-heading"
    >
      <h2 id="missing-heading" class="m-0 text-base font-extrabold">Class not found</h2>
      <p class="m-0 text-sm text-muted-fg">This class doesn't exist, or it isn't one of yours.</p>
      <UButton color="neutral" variant="soft" to="/tutor" label="Back to your classes" />
    </section>
    <template v-else>
      <TutorClassHeader :klass="klass" :now="now" />
      <TutorClassLive
        :key="klass.classId"
        :class-id="klass.classId"
        :class-name="klass.name"
        :now="now"
      />
    </template>
  </div>
</template>
