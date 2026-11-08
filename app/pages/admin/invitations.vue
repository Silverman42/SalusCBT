<script setup lang="ts">
// /admin/invitations (LLD §14.1; AU-5): invite form and every invitation,
// newest first, with resend/cancel on open ones. A table from md up, cards
// on phones. Same look as the cards on mockup screen 10.
import { computed } from "vue";
import { api } from "~~/convex/_generated/api";
import { useMinuteClock } from "~/composables/useMinuteClock";
import { useStaffQuery } from "~/composables/useStaffQuery";
import {
  adminErrorMessage,
  effectiveInvitationStatus,
  expiryLabel,
  formatDate,
  invitationStatusBadge,
  isOpenInvitation,
} from "~/lib/admin";

definePageMeta({ middleware: "admin", layout: "staff", title: "Invitations" });

const { data, error, loading } = useStaffQuery(api.invitations.list, {});
const now = useMinuteClock();

const rows = computed(() =>
  (data.value ?? []).map((inv) => {
    const status = effectiveInvitationStatus(inv, now.value);
    return {
      inv,
      badge: invitationStatusBadge(status),
      sent: formatDate(inv.createdAt, now.value),
      detail:
        inv.status === "accepted" && inv.acceptedAt !== null
          ? `Accepted ${formatDate(inv.acceptedAt, now.value)}`
          : isOpenInvitation(inv)
            ? expiryLabel(inv.expiresAt, now.value)
            : null,
    };
  }),
);
const openCount = computed(() => (data.value ?? []).filter(isOpenInvitation).length);
</script>

<template>
  <div class="flex min-h-0 flex-1 flex-col gap-[18px]">
    <AdminInviteForm />

    <section
      class="flex flex-col gap-0.5 rounded-[28px] bg-surface px-4 py-3.5"
      aria-labelledby="all-invitations-heading"
    >
      <h2 id="all-invitations-heading" class="m-0 px-2 pt-1.5 pb-2.5 text-base font-extrabold">
        All invitations
        <span v-if="data" class="font-semibold text-muted-fg">
          · {{ data.length }} ({{ openCount }} open)
        </span>
      </h2>

      <p v-if="loading" class="m-0 px-2 py-2.5 text-sm text-muted-fg">Loading invitations…</p>
      <p v-else-if="error" class="m-0 px-2 py-2.5 text-sm font-semibold text-bad" role="alert">
        {{ adminErrorMessage(error, "load") }}
      </p>
      <p v-else-if="rows.length === 0" class="m-0 px-2 py-2.5 text-sm text-muted-fg">
        No invitations yet. Invite a tutor above.
      </p>
      <template v-else>
        <!-- md and up: a real table -->
        <table class="hidden w-full border-collapse text-sm md:table">
          <caption class="sr-only">
            Invitations, newest first
          </caption>
          <thead>
            <tr class="text-left text-xs font-bold tracking-[0.05em] text-muted-fg uppercase">
              <th scope="col" class="px-2.5 py-2 font-bold">Email</th>
              <th scope="col" class="px-2.5 py-2 font-bold">Status</th>
              <th scope="col" class="px-2.5 py-2 font-bold">Sent</th>
              <th scope="col" class="px-2.5 py-2 font-bold">Expiry</th>
              <th scope="col" class="px-2.5 py-2 text-right font-bold">
                <span class="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in rows" :key="row.inv.invitationId" class="border-t border-line">
              <th scope="row" class="max-w-0 truncate px-2.5 py-3 text-left font-semibold">
                {{ row.inv.email }}
              </th>
              <td class="px-2.5 py-3"><AdminStatusBadge :badge="row.badge" /></td>
              <td class="px-2.5 py-3 whitespace-nowrap text-muted-fg">{{ row.sent }}</td>
              <td class="px-2.5 py-3 whitespace-nowrap text-muted-fg">{{ row.detail ?? "—" }}</td>
              <td class="px-2.5 py-2">
                <div class="flex justify-end">
                  <AdminInvitationActions :invitation="row.inv" />
                </div>
              </td>
            </tr>
          </tbody>
        </table>

        <!-- phones: cards -->
        <ul class="m-0 flex list-none flex-col gap-2 p-0 md:hidden">
          <li
            v-for="row in rows"
            :key="row.inv.invitationId"
            class="flex flex-col gap-2 rounded-[18px] border border-line p-3.5"
          >
            <div class="flex items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-sm font-semibold">{{ row.inv.email }}</span>
              <AdminStatusBadge :badge="row.badge" />
            </div>
            <p class="m-0 text-[13px] text-muted-fg">
              Sent {{ row.sent }}<template v-if="row.detail"> · {{ row.detail }}</template>
            </p>
            <AdminInvitationActions :invitation="row.inv" class="justify-end" />
          </li>
        </ul>
      </template>
    </section>
  </div>
</template>
