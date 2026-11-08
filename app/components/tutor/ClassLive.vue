<script setup lang="ts">
// The live part of a class page (CL-5, CL-6): subscribes to
// `classes.stats` and `classes.attempts` for one class, so a submit shows up
// as soon as it commits. Mounted only once the class is known to be the
// tutor's, and keyed by class so a new id gets fresh subscriptions.
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { tutorErrorMessage } from "~/lib/tutor";

const props = defineProps<{ classId: Id<"classes">; className: string; now: number }>();

const stats = useStaffQuery(api.classes.stats, { classId: props.classId });
const attempts = useStaffQuery(api.classes.attempts, { classId: props.classId });
</script>

<template>
  <p
    v-if="stats.error.value || attempts.error.value"
    class="m-0 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
    role="alert"
  >
    {{ tutorErrorMessage(stats.error.value ?? attempts.error.value, "load") }}
  </p>
  <p v-else-if="stats.loading.value || attempts.loading.value" class="m-0 text-sm text-muted-fg">
    Loading results…
  </p>
  <template v-else-if="stats.data.value && attempts.data.value">
    <TutorClassStats :stats="stats.data.value" />
    <p v-if="stats.data.value.truncated" class="m-0 text-[13px] text-muted-fg">
      This class has more attempts than the dashboard reads at once; figures cover the newest ones.
    </p>
    <div class="grid min-w-0 gap-3.5 xl:grid-cols-[minmax(0,1fr)_290px]">
      <TutorAttemptTable
        :rows="attempts.data.value"
        :class-id="classId"
        :class-name="className"
        :pass-scaled="stats.data.value.passScaled"
        :now="now"
      />
      <TutorMostMissed :stats="stats.data.value" class="self-start" />
    </div>
  </template>
</template>
