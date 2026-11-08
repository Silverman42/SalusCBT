<script setup lang="ts">
// "Pending invitations · N" card (mockup screen 10, AU-5): open invitations
// with their expiry, Resend and Cancel. The full history is /admin/invitations.
import { computed } from "vue";
import { api } from "~~/convex/_generated/api";
import { useMinuteClock } from "~/composables/useMinuteClock";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { adminErrorMessage, expiryLabel, isOpenInvitation } from "~/lib/admin";

const { data, error, loading } = useStaffQuery(api.invitations.list, {});
const now = useMinuteClock();
const pending = computed(() => (data.value ?? []).filter(isOpenInvitation));
</script>

<template>
  <section
    class="flex flex-col gap-0.5 rounded-[28px] bg-surface px-4 py-3.5"
    aria-labelledby="pending-heading"
  >
    <div class="flex items-center gap-2 px-2 pt-1.5 pb-2.5">
      <h2 id="pending-heading" class="m-0 flex-1 text-base font-extrabold">
        Pending invitations
        <span v-if="data" class="font-semibold text-muted-fg">· {{ pending.length }}</span>
      </h2>
      <NuxtLink
        to="/admin/invitations"
        class="text-[13px] font-bold text-brand-ink hover:underline"
      >
        All invitations
      </NuxtLink>
    </div>

    <p v-if="loading" class="m-0 px-2 py-2.5 text-sm text-muted-fg">Loading invitations…</p>
    <p v-else-if="error" class="m-0 px-2 py-2.5 text-sm font-semibold text-bad" role="alert">
      {{ adminErrorMessage(error, "load") }}
    </p>
    <p v-else-if="pending.length === 0" class="m-0 px-2 py-2.5 text-sm text-muted-fg">
      No pending invitations. Invite a tutor above.
    </p>
    <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
      <li
        v-for="inv in pending"
        :key="inv.invitationId"
        class="flex items-start gap-3 rounded-[14px] px-2 py-2.5 sm:items-center"
      >
        <span
          class="grid size-9 flex-none place-items-center rounded-xl bg-surface-2 text-muted-fg"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-mail" class="size-4" />
        </span>
        <div
          class="flex min-w-0 flex-1 flex-col gap-x-3 gap-y-1 sm:flex-row sm:items-center sm:justify-between"
        >
          <span class="truncate pt-2 text-sm font-semibold sm:pt-0">{{ inv.email }}</span>
          <div class="flex flex-none items-center justify-between gap-3">
            <span
              class="text-[13px]"
              :class="inv.expiresAt <= now ? 'font-semibold text-warn' : 'text-muted-fg'"
            >
              {{ expiryLabel(inv.expiresAt, now) }}
            </span>
            <AdminInvitationActions :invitation="inv" />
          </div>
        </div>
      </li>
    </ul>
  </section>
</template>
