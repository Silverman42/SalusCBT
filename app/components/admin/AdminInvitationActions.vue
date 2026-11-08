<script setup lang="ts">
// "Resend" and "Cancel" for one invitation (mockup screen 10, AU-5).
// Cancelling asks first; resending sends a new link at once.
import type { FunctionReturnType } from "convex/server";
import { ref } from "vue";
import { api } from "~~/convex/_generated/api";
import { useAdminAction } from "~/composables/useAdminAction";
import { useAuth } from "~/composables/useAuth";
import { formatDate, invitationActions } from "~/lib/admin";

type Invitation = FunctionReturnType<typeof api.invitations.list>[number];

const props = defineProps<{ invitation: Invitation }>();

useAuth();
const { $convex } = useNuxtApp();
const resendAction = useAdminAction();
const cancelAction = useAdminAction();
const confirmOpen = ref(false);

async function resend() {
  await resendAction.run(
    "resend",
    () => $convex.mutation(api.invitations.resend, { invitationId: props.invitation.invitationId }),
    ({ expiresAt }) =>
      `New link sent to ${props.invitation.email}, valid until ${formatDate(expiresAt, Date.now())}. The old link no longer works.`,
  );
}

async function cancel() {
  await cancelAction.run(
    "cancel",
    () => $convex.mutation(api.invitations.cancel, { invitationId: props.invitation.invitationId }),
    () => `Invitation to ${props.invitation.email} cancelled.`,
  );
  // Close on errors too (e.g. NOT_PENDING): the toast explains, the live list has moved on.
  confirmOpen.value = false;
}
</script>

<template>
  <div v-if="invitationActions(invitation).resend" class="flex flex-none items-center gap-1">
    <UButton
      color="neutral"
      variant="soft"
      size="sm"
      label="Resend"
      :loading="resendAction.busy.value"
      :aria-label="`Resend invitation to ${invitation.email}`"
      class="px-3.5 font-bold"
      @click="resend"
    />
    <UButton
      color="error"
      variant="ghost"
      size="sm"
      label="Cancel"
      :aria-label="`Cancel invitation to ${invitation.email}`"
      class="px-3.5 font-bold"
      @click="confirmOpen = true"
    />
    <AdminConfirmDialog
      v-model:open="confirmOpen"
      :title="`Cancel the invitation to ${invitation.email}?`"
      description="The link in their email stops working. You can invite them again later."
      confirm-label="Cancel invitation"
      cancel-label="Keep invitation"
      :busy="cancelAction.busy.value"
      @confirm="cancel"
    />
  </div>
</template>
