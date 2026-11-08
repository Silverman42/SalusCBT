<script setup lang="ts">
// /sign-in (LLD §9.1, §14.1; AU-1 to AU-3): email, then a 6-digit code.
// Client-rendered (`routeRules`). The page never says whether an email has an
// account: every code request gets the same "If … belongs to an active
// account" answer.
import { nextTick, onMounted, ref, useId } from "vue";
import { useAuth } from "~/composables/useAuth";
import {
  CODE_LENGTH,
  CODE_TTL_MIN,
  looksLikeEmail,
  normalizeEmail,
  postSignInPath,
  RESEND_AFTER_S,
  sendCodeErrorMessage,
} from "~/lib/signIn";

useSeoMeta({ title: "Staff sign in · Salus", robots: "noindex" });

const route = useRoute();
const auth = useAuth();

const emailId = useId();
const emailErrorId = useId();
const emailInput = ref<{ inputRef?: HTMLInputElement } | null>(null);

const step = ref<"email" | "code">("email");
const email = ref("");
/** The address the code was requested for (what the code form uses). */
const sentTo = ref("");
const sending = ref(false);
const emailError = ref("");
const finishing = ref(false);

function focusEmail() {
  void nextTick(() => emailInput.value?.inputRef?.focus());
}

async function goHome() {
  finishing.value = true;
  let role = null;
  try {
    role = await auth.fetchRole();
  } catch {
    // The guard on the target page checks again.
  }
  await navigateTo(postSignInPath(role, route.query.redirect), { replace: true });
}

async function sendCode() {
  if (sending.value) return;
  emailError.value = "";
  const address = normalizeEmail(email.value);
  if (!looksLikeEmail(address)) {
    emailError.value = "Enter a valid email address, like name@school.org.";
    focusEmail();
    return;
  }
  sending.value = true;
  try {
    const { error, retryAfterS } = await auth.sendCode(address);
    if (error) {
      emailError.value = sendCodeErrorMessage(error, retryAfterS);
      focusEmail();
      return;
    }
    sentTo.value = address;
    step.value = "code";
  } catch {
    emailError.value = sendCodeErrorMessage({}, null);
    focusEmail();
  } finally {
    sending.value = false;
  }
}

function useDifferentEmail() {
  step.value = "email";
  focusEmail();
}

onMounted(async () => {
  focusEmail();
  // Already signed in (e.g. the back button): go straight on.
  try {
    if ((await auth.fetchSession())?.session) await goHome();
  } catch {
    // Signed out or offline: stay on the form.
  }
});
</script>

<template>
  <AuthShell>
    <template v-if="step === 'email'">
      <span
        class="grid size-14 place-items-center rounded-[18px] bg-brand-soft text-brand-ink"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-key-round" class="size-6" />
      </span>
      <div class="flex flex-col gap-2">
        <h1 class="m-0 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[34px]">
          Staff sign in
        </h1>
        <p class="m-0 text-base leading-[1.55] text-pretty text-muted-fg">
          For tutors and the admin. Enter your email and we'll send you a one-time code. Students
          don't need to sign in.
        </p>
      </div>

      <form class="flex flex-col gap-6" novalidate @submit.prevent="sendCode">
        <div class="flex flex-col gap-2">
          <label :for="emailId" class="text-sm font-semibold">Email</label>
          <UInput
            :id="emailId"
            ref="emailInput"
            v-model="email"
            type="email"
            name="email"
            autocomplete="email"
            inputmode="email"
            autocapitalize="off"
            spellcheck="false"
            required
            size="xl"
            placeholder="name@school.org"
            icon="i-lucide-mail"
            :aria-invalid="emailError ? 'true' : undefined"
            :aria-describedby="emailError ? emailErrorId : undefined"
            class="w-full"
            :ui="{ base: 'h-14 bg-surface' }"
          />
        </div>

        <div aria-live="assertive" aria-atomic="true" class="-mb-6 has-[p]:mb-0">
          <p
            v-if="emailError"
            :id="emailErrorId"
            class="m-0 flex gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-[15px] font-semibold text-bad"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
            <span>{{ emailError }}</span>
          </p>
        </div>

        <UButton type="submit" size="xl" block :loading="sending" label="Send code" />
      </form>

      <p class="m-0 text-sm leading-normal text-muted-fg">
        New tutor? Use the link in your invitation email. There's no public sign-up.
      </p>
    </template>

    <template v-else>
      <span
        class="grid size-14 place-items-center rounded-[18px] bg-brand-soft text-brand-ink"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-mail" class="size-6" />
      </span>
      <div class="flex flex-col gap-2">
        <h1 class="m-0 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[34px]">
          Check your email
        </h1>
        <p class="m-0 text-base leading-[1.55] text-pretty break-words text-muted-fg" role="status">
          If <b class="font-semibold text-fg">{{ sentTo }}</b> belongs to an active account, we've
          sent a {{ CODE_LENGTH }}-digit code. It expires in {{ CODE_TTL_MIN }} minutes.
        </p>
      </div>

      <AuthCodeForm :email="sentTo" :initial-cooldown-s="RESEND_AFTER_S" @verified="goHome">
        <template #secondary>
          <button
            type="button"
            class="font-semibold text-brand-ink hover:underline"
            @click="useDifferentEmail"
          >
            Use a different email
          </button>
        </template>
      </AuthCodeForm>

      <p v-if="finishing" class="m-0 text-sm text-muted-fg" role="status">Signing you in…</p>
    </template>
  </AuthShell>
</template>
