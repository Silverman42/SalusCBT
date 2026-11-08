<script setup lang="ts">
// "Tutors · N" card (mockup screen 10, AU-4, AU-5): every tutor, active and
// removed, with Remove (asks first) or Restore.
import type { FunctionReturnType } from "convex/server";
import { ref } from "vue";
import { api } from "~~/convex/_generated/api";
import { useAdminAction } from "~/composables/useAdminAction";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { adminErrorMessage, displayName, initials, tutorStatusBadge } from "~/lib/admin";

type Tutor = FunctionReturnType<typeof api.admin.tutors>[number];

const { $convex } = useNuxtApp();
const { data, error, loading } = useStaffQuery(api.admin.tutors, {});
const removeAction = useAdminAction();
const restoreAction = useAdminAction();

const toRemove = ref<Tutor | null>(null);
const confirmOpen = ref(false);
const restoring = ref<string | null>(null);

function askRemove(tutor: Tutor) {
  toRemove.value = tutor;
  confirmOpen.value = true;
}

async function remove() {
  const tutor = toRemove.value;
  if (!tutor) return;
  await removeAction.run(
    "remove",
    () => $convex.mutation(api.admin.removeTutor, { profileId: tutor.profileId }),
    () => `${displayName(tutor.name, tutor.email)} removed and signed out everywhere.`,
  );
  confirmOpen.value = false;
}

async function restore(tutor: Tutor) {
  restoring.value = tutor.profileId;
  await restoreAction.run(
    "restore",
    () => $convex.mutation(api.admin.restoreTutor, { profileId: tutor.profileId }),
    () => `${displayName(tutor.name, tutor.email)} restored. They can sign in by code again.`,
  );
  restoring.value = null;
}
</script>

<template>
  <section
    class="flex flex-1 flex-col gap-0.5 rounded-[28px] bg-surface px-4 py-3.5"
    aria-labelledby="tutors-heading"
  >
    <h2 id="tutors-heading" class="m-0 px-2 pt-1.5 pb-2.5 text-base font-extrabold">
      Tutors
      <span v-if="data" class="font-semibold text-muted-fg">· {{ data.length }}</span>
    </h2>

    <p v-if="loading" class="m-0 px-2 py-2.5 text-sm text-muted-fg">Loading tutors…</p>
    <p v-else-if="error" class="m-0 px-2 py-2.5 text-sm font-semibold text-bad" role="alert">
      {{ adminErrorMessage(error, "load") }}
    </p>
    <p v-else-if="data?.length === 0" class="m-0 px-2 py-2.5 text-sm text-muted-fg">
      No tutors yet. Invited tutors appear here once they accept.
    </p>
    <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li
        v-for="tutor in data"
        :key="tutor.profileId"
        class="flex items-center gap-3 rounded-[14px] px-2 py-2.5"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-full bg-brand-soft text-[13px] font-extrabold text-brand-ink"
          :class="{ 'opacity-60': tutor.status === 'removed' }"
          aria-hidden="true"
        >
          {{ initials(tutor.name, tutor.email) }}
        </span>
        <div
          class="flex min-w-0 flex-1 flex-col"
          :class="{ 'opacity-60': tutor.status === 'removed' }"
        >
          <span class="truncate text-sm font-bold">{{ displayName(tutor.name, tutor.email) }}</span>
          <span v-if="tutor.name" class="truncate text-[13px] text-muted-fg">
            {{ tutor.email }}
          </span>
          <AdminStatusBadge
            :badge="tutorStatusBadge(tutor.status)"
            class="mt-1 self-start sm:hidden"
          />
        </div>
        <AdminStatusBadge :badge="tutorStatusBadge(tutor.status)" class="max-sm:hidden" />
        <UButton
          v-if="tutor.status === 'active'"
          color="neutral"
          variant="soft"
          size="sm"
          label="Remove"
          :aria-label="`Remove ${displayName(tutor.name, tutor.email)}`"
          class="w-[78px] justify-center font-bold"
          @click="askRemove(tutor)"
        />
        <UButton
          v-else
          color="neutral"
          variant="soft"
          size="sm"
          label="Restore"
          :aria-label="`Restore ${displayName(tutor.name, tutor.email)}`"
          :loading="restoring === tutor.profileId"
          class="w-[78px] justify-center font-bold"
          @click="restore(tutor)"
        />
      </li>
    </ul>

    <AdminConfirmDialog
      v-model:open="confirmOpen"
      :title="toRemove ? `Remove ${displayName(toRemove.name, toRemove.email)}?` : 'Remove tutor?'"
      description="They're signed out everywhere straight away and can't sign in until you restore them. Their classes and attempts stay."
      confirm-label="Remove tutor"
      cancel-label="Keep tutor"
      :busy="removeAction.busy.value"
      @confirm="remove"
    />
  </section>
</template>
