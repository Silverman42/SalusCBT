<script setup lang="ts">
// /admin/attempts (PRD PR-5): the admin can delete any attempt, including
// ones with no class. There is no admin attempt list yet, so attempts are
// named by id or by their link (…/exam/<id>), up to 100 at a time, and the
// deletion is confirmed first. Calls `admin.deleteAttempts`.
import { computed, ref, useId } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useAdminAction } from "~/composables/useAdminAction";
import { useAuth } from "~/composables/useAuth";
import { deletedMessage, MAX_DELETE_ATTEMPTS, parseAttemptIds } from "~/lib/admin";

definePageMeta({ middleware: "admin", layout: "staff", title: "Delete attempts" });

useAuth();
const { $convex } = useNuxtApp();
const action = useAdminAction();

const fieldId = useId();
const hintId = useId();
const problemId = useId();
const text = ref("");
const confirmOpen = ref(false);

const parsed = computed(() => parseAttemptIds(text.value));
const tooMany = computed(() => parsed.value.ids.length > MAX_DELETE_ATTEMPTS);
const problem = computed(() => {
  if (tooMany.value) return `Delete at most ${MAX_DELETE_ATTEMPTS} attempts at a time.`;
  if (parsed.value.invalid.length > 0) {
    const shown = parsed.value.invalid.slice(0, 3).join(", ");
    const more =
      parsed.value.invalid.length > 3 ? ` and ${parsed.value.invalid.length - 3} more` : "";
    return `These don't look like attempt IDs: ${shown}${more}.`;
  }
  return "";
});
const canDelete = computed(() => parsed.value.ids.length > 0 && !problem.value);
const countLabel = computed(() =>
  parsed.value.ids.length === 1 ? "1 attempt" : `${parsed.value.ids.length} attempts`,
);

async function remove() {
  const ids = parsed.value.ids;
  const result = await action.run(
    "deleteAttempts",
    () =>
      $convex.mutation(api.admin.deleteAttempts, {
        attemptIds: ids as Id<"attempts">[],
      }),
    ({ deleted }) => deletedMessage(ids.length, deleted),
  );
  confirmOpen.value = false;
  if (result) text.value = "";
}
</script>

<template>
  <section
    class="flex max-w-[760px] flex-col gap-4 rounded-[28px] bg-surface px-[22px] py-5"
    aria-labelledby="delete-heading"
  >
    <div class="flex items-start gap-3.5">
      <span
        class="grid size-11 flex-none place-items-center rounded-[14px] bg-bad-soft text-bad"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-trash-2" class="size-5" />
      </span>
      <div class="flex flex-col gap-1">
        <h2 id="delete-heading" class="m-0 text-base font-extrabold">Delete any attempt</h2>
        <p :id="hintId" class="m-0 text-sm leading-normal text-muted-fg">
          Paste attempt IDs or links (like <span class="font-mono">…/exam/&lt;id&gt;/result</span>),
          one per line or separated by commas. Up to {{ MAX_DELETE_ATTEMPTS }} at a time. Tutors
          delete attempts in their own classes from the class page.
        </p>
      </div>
    </div>

    <form class="flex flex-col gap-3" novalidate @submit.prevent="confirmOpen = canDelete">
      <label :for="fieldId" class="text-sm font-semibold">Attempts</label>
      <UTextarea
        :id="fieldId"
        v-model="text"
        :rows="5"
        autoresize
        spellcheck="false"
        autocapitalize="off"
        placeholder="j57a8…"
        class="w-full"
        :ui="{ base: 'bg-surface-2 font-mono text-sm ring-0' }"
        :aria-invalid="problem ? 'true' : undefined"
        :aria-describedby="problem ? `${hintId} ${problemId}` : hintId"
      />
      <div aria-live="polite">
        <p v-if="problem" :id="problemId" class="m-0 text-sm font-semibold text-bad">
          {{ problem }}
        </p>
        <p v-else-if="parsed.ids.length > 0" class="m-0 text-sm text-muted-fg">
          {{ countLabel }} ready to delete.
        </p>
      </div>
      <div class="flex justify-end">
        <UButton
          type="submit"
          color="error"
          icon="i-lucide-trash-2"
          :label="parsed.ids.length > 0 ? `Delete ${countLabel}` : 'Delete'"
          :disabled="!canDelete"
          :loading="action.busy.value"
        />
      </div>
    </form>

    <AdminConfirmDialog
      v-model:open="confirmOpen"
      :title="`Delete ${countLabel}?`"
      description="Their answers, scores and share links are deleted too. This can't be undone."
      :confirm-label="`Delete ${countLabel}`"
      cancel-label="Keep them"
      :busy="action.busy.value"
      @confirm="remove"
    />
  </section>
</template>
