<script setup lang="ts">
// "Invite a tutor" banner (mockup screen 10, AU-5): email + "Send invite".
// Errors (bad email, already active, daily limit) show inline.
import { nextTick, ref, useId } from "vue";
import { api } from "~~/convex/_generated/api";
import { useAuth } from "~/composables/useAuth";
import { adminErrorMessage, formatDate, isSessionError } from "~/lib/admin";
import { SIGN_IN_PATH } from "~/lib/authGuard";
import { looksLikeEmail, normalizeEmail } from "~/lib/signIn";

useAuth();
const { $convex } = useNuxtApp();
const toast = useToast();
const route = useRoute();

const headingId = useId();
const emailId = useId();
const hintId = useId();
const errorId = useId();
const input = ref<{ inputRef?: HTMLInputElement } | null>(null);
const email = ref("");
const error = ref("");
const sending = ref(false);

function focusInput() {
  void nextTick(() => input.value?.inputRef?.focus());
}

async function invite() {
  if (sending.value) return;
  error.value = "";
  const address = normalizeEmail(email.value);
  if (!looksLikeEmail(address)) {
    error.value = "Enter a valid email address, like name@school.org.";
    focusInput();
    return;
  }
  sending.value = true;
  try {
    const { expiresAt } = await $convex.mutation(api.invitations.create, { email: address });
    email.value = "";
    toast.add({
      title: `Invitation sent to ${address}`,
      description: `The link works once and expires on ${formatDate(expiresAt, Date.now())}.`,
      color: "success",
      icon: "i-lucide-send",
    });
  } catch (err) {
    error.value = adminErrorMessage(err, "invite");
    if (isSessionError(err)) {
      await navigateTo(`${SIGN_IN_PATH}?redirect=${encodeURIComponent(route.fullPath)}`, {
        replace: true,
      });
      return;
    }
    focusInput();
  } finally {
    sending.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <section
      class="flex flex-col gap-3.5 rounded-[28px] bg-brand-soft p-5 sm:px-[22px] md:flex-row md:items-center"
      :aria-labelledby="headingId"
    >
      <div class="flex items-center gap-3.5 md:w-[278px] md:flex-none">
        <span
          class="grid size-11 flex-none place-items-center rounded-[14px] bg-brand text-white"
          aria-hidden="true"
        >
          <UIcon name="i-lucide-user-plus" class="size-5" />
        </span>
        <div class="flex flex-col gap-0.5">
          <h2 :id="headingId" class="m-0 text-base font-extrabold text-brand-ink">
            Invite a tutor
          </h2>
          <p :id="hintId" class="m-0 text-[13px] text-muted-fg">
            Link works once, expires in 7 days
          </p>
        </div>
      </div>

      <form
        class="flex min-w-0 flex-1 flex-col gap-2.5 sm:flex-row"
        novalidate
        @submit.prevent="invite"
      >
        <label :for="emailId" class="sr-only">Tutor's email</label>
        <UInput
          :id="emailId"
          ref="input"
          v-model="email"
          type="email"
          name="email"
          autocomplete="off"
          inputmode="email"
          autocapitalize="off"
          spellcheck="false"
          placeholder="tutor@school.edu"
          size="xl"
          class="min-w-0 flex-1"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="error ? `${hintId} ${errorId}` : hintId"
          :ui="{ base: 'h-[50px] rounded-full bg-surface px-5 ring-0' }"
        />
        <UButton
          type="submit"
          size="xl"
          icon="i-lucide-send"
          label="Send invite"
          :loading="sending"
          class="h-[50px] justify-center px-[22px]"
        />
      </form>
    </section>
    <div aria-live="assertive" aria-atomic="true">
      <p
        v-if="error"
        :id="errorId"
        class="m-0 flex gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-[15px] font-semibold text-bad"
      >
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
        <span>{{ error }}</span>
      </p>
    </div>
  </div>
</template>
