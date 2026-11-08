<script setup lang="ts">
// /tutor (LLD §14.1, mockup screen 09): the tutor's classes, live, with
// "New class" (name, version, extra time) and each class code ready to copy
// (CL-1). Creating a class opens its page. Calls `classes.mine`.
import { computed, ref } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useMinuteClock } from "~/composables/useMinuteClock";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { tutorErrorMessage } from "~/lib/tutor";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Classes" });

const now = useMinuteClock();
const { data, error, loading } = useStaffQuery(api.classes.mine, {});
const formOpen = ref(false);

const openCount = computed(() => data.value?.filter((c) => c.status === "open").length ?? 0);

async function created({ classId }: { classId: Id<"classes"> }) {
  await navigateTo(`/tutor/classes/${classId}`);
}
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <section
      class="flex flex-col gap-3.5 rounded-[28px] bg-brand-soft p-5 sm:flex-row sm:items-center sm:px-[22px]"
      aria-labelledby="new-class-heading"
    >
      <div class="flex flex-1 items-center gap-3.5">
        <span
          class="grid size-11 flex-none place-items-center rounded-[14px] bg-brand text-white"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-users" class="size-5" />
        </span>
        <div class="flex flex-col gap-0.5">
          <h2 id="new-class-heading" class="m-0 text-base font-extrabold text-brand-ink">
            Run a class
          </h2>
          <p class="m-0 text-[13px] text-muted-fg">
            Each class gets a code like SEC-4K7Q. Results appear here as students submit.
          </p>
        </div>
      </div>
      <UButton
        size="xl"
        icon="i-lucide-plus"
        label="New class"
        class="h-[50px] justify-center px-[22px]"
        @click="formOpen = true"
      />
    </section>

    <section
      class="flex flex-col gap-1 rounded-[28px] bg-surface px-4 py-3.5"
      aria-labelledby="classes-heading"
    >
      <h2 id="classes-heading" class="m-0 px-2 pt-1.5 pb-2.5 text-base font-extrabold">
        Your classes
        <span v-if="data" class="font-semibold text-muted-fg">
          · {{ data.length }}<template v-if="data.length > 0"> ({{ openCount }} open)</template>
        </span>
      </h2>

      <p v-if="loading" class="m-0 px-2 py-2.5 text-sm text-muted-fg">Loading classes…</p>
      <p v-else-if="error" class="m-0 px-2 py-2.5 text-sm font-semibold text-bad" role="alert">
        {{ tutorErrorMessage(error, "load") }}
      </p>
      <div
        v-else-if="data?.length === 0"
        class="flex flex-col items-start gap-3 px-2 py-2.5 text-sm text-muted-fg"
      >
        <p class="m-0">No classes yet. Create one and share its code with your students.</p>
        <UButton
          color="neutral"
          variant="soft"
          icon="i-lucide-plus"
          label="New class"
          @click="formOpen = true"
        />
      </div>
      <TutorClassTable v-else-if="data" :classes="data" :now="now" />
    </section>

    <TutorClassForm v-model:open="formOpen" @created="created" />
  </div>
</template>
