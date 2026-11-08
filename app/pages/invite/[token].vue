<script setup lang="ts">
// /invite/[token] (LLD §9.3, §14.1): peek → read-only email → accept →
// send a sign-in code to the email `accept` returns → code entry → /tutor.
// Client-rendered (`routeRules`). Every link that doesn't work (unknown,
// expired, cancelled, used) gets the same message.
import { nextTick, onMounted, ref, useId } from "vue";
import { api } from "~~/convex/_generated/api";
import { errorCodeOf } from "~~/convex/lib/errors";
import { useAuth } from "~/composables/useAuth";
import {
  CODE_LENGTH,
  CODE_TTL_MIN,
  DEAD_INVITE_TEXT,
  RESEND_AFTER_S,
  sendCodeErrorMessage,
} from "~/lib/signIn";

useSeoMeta({ title: "Accept invitation · Salus", robots: "noindex" });

const route = useRoute();
const { $convex } = useNuxtApp();
const auth = useAuth();

const token = String(route.params.token ?? "");
const emailId = useId();
const heading = ref<HTMLElement | null>(null);

type Step = "loading" | "dead" | "ready" | "code";
const step = ref<Step>("loading");
const email = ref("");
const accepting = ref(false);
const error = ref("");
/** Passed to the code form when the first code request was refused. */
const codeError = ref("");
const cooldownS = ref(RESEND_AFTER_S);

function focusHeading() {
  void nextTick(() => heading.value?.focus());
}

async function load() {
  step.value = "loading";
  error.value = "";
  try {
    const result = await $convex.query(api.invitations.peek, { token });
    if (result.valid && result.email) {
      email.value = result.email;
      step.value = "ready";
    } else {
      step.value = "dead";
    }
  } catch {
    step.value = "ready";
    error.value = "We couldn't load this invitation. Check your connection and try again.";
  }
  focusHeading();
}

async function accept() {
  if (accepting.value) return;
  accepting.value = true;
  error.value = "";
  let address: string;
  try {
    ({ email: address } = await $convex.action(api.invitations.accept, { token }));
  } catch (err) {
    accepting.value = false;
    if (errorCodeOf(err) === "NOT_FOUND") {
      step.value = "dead";
      focusHeading();
    } else {
      error.value =
        "We couldn't accept the invitation just now. Check your connection and try again.";
    }
    return;
  }

  // The account exists now; from here on it's an ordinary sign-in.
  email.value = address;
  try {
    const { error: failure, retryAfterS } = await auth.sendCode(address);
    if (failure) {
      codeError.value = sendCodeErrorMessage(failure, retryAfterS);
      cooldownS.value = retryAfterS ?? RESEND_AFTER_S;
    }
  } catch {
    codeError.value = sendCodeErrorMessage({}, null);
    cooldownS.value = 0;
  } finally {
    accepting.value = false;
  }
  step.value = "code";
}

async function done() {
  await navigateTo("/tutor", { replace: true });
}

onMounted(load);
</script>

<template>
  <AuthShell tagline="You've been invited to set up classes and follow your students' mock exams.">
    <template v-if="step === 'loading'">
      <div class="flex items-center gap-3 text-muted-fg" role="status">
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" />
        Checking your invitation…
      </div>
    </template>

    <template v-else-if="step === 'dead'">
      <span
        class="grid size-14 place-items-center rounded-[18px] bg-bad-soft text-bad"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-link-2-off" class="size-6" />
      </span>
      <div class="flex flex-col gap-2">
        <h1
          ref="heading"
          tabindex="-1"
          class="m-0 text-[28px] font-extrabold tracking-[-0.03em] outline-none sm:text-[34px]"
        >
          This invitation link doesn't work
        </h1>
        <p class="m-0 text-base leading-[1.55] text-pretty text-muted-fg">
          {{ DEAD_INVITE_TEXT }}
        </p>
      </div>
      <div class="rounded-[24px] bg-surface px-5 py-4 text-[15px] leading-normal">
        Already accepted your invitation? Sign in with your email instead.
      </div>
      <div class="flex flex-wrap gap-2">
        <UButton
          to="/sign-in"
          size="xl"
          label="Go to sign in"
          trailing-icon="i-lucide-arrow-right"
        />
        <UButton to="/" size="xl" variant="soft" label="Salus home" />
      </div>
    </template>

    <template v-else-if="step === 'ready'">
      <span
        class="grid size-14 place-items-center rounded-[18px] bg-brand-soft text-brand-ink"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-mail-open" class="size-6" />
      </span>
      <div class="flex flex-col gap-2">
        <h1
          ref="heading"
          tabindex="-1"
          class="m-0 text-[28px] font-extrabold tracking-[-0.03em] outline-none sm:text-[34px]"
        >
          You're invited to Salus
        </h1>
        <p class="m-0 text-base leading-[1.55] text-pretty text-muted-fg">
          Accept to create your tutor account. We'll then email you a {{ CODE_LENGTH }}-digit code
          to sign in. No password needed.
        </p>
      </div>

      <form class="flex flex-col gap-6" novalidate @submit.prevent="accept">
        <div v-if="email" class="flex flex-col gap-2">
          <label :for="emailId" class="text-sm font-semibold">Invited email</label>
          <UInput
            :id="emailId"
            :model-value="email"
            type="email"
            readonly
            size="xl"
            icon="i-lucide-lock"
            class="w-full"
            :ui="{ base: 'h-14 bg-surface-2 text-fg' }"
          />
          <span class="text-sm text-muted-fg">
            Wrong address? Ask the Salus admin to invite the right one.
          </span>
        </div>

        <div aria-live="assertive" aria-atomic="true" class="-mb-6 has-[p]:mb-0">
          <p
            v-if="error"
            class="m-0 flex gap-2 rounded-[16px] bg-bad-soft px-4 py-3 text-[15px] font-semibold text-bad"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
            <span>{{ error }}</span>
          </p>
        </div>

        <UButton
          v-if="email"
          type="submit"
          size="xl"
          block
          :loading="accepting"
          label="Accept and send code"
        />
        <UButton v-else type="button" size="xl" block label="Try again" @click="load" />
      </form>
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
          <template v-if="codeError">
            Your account for <b class="font-semibold text-fg">{{ email }}</b> is ready. Ask for a
            sign-in code below.
          </template>
          <template v-else>
            Your account is ready. We've sent a {{ CODE_LENGTH }}-digit code to
            <b class="font-semibold text-fg">{{ email }}</b
            >. It expires in {{ CODE_TTL_MIN }} minutes.
          </template>
        </p>
      </div>
      <AuthCodeForm
        :email="email"
        :initial-cooldown-s="cooldownS"
        :initial-error="codeError"
        @verified="done"
      >
        <template #secondary>
          <NuxtLink to="/sign-in" class="font-semibold text-brand-ink hover:underline">
            Sign in later
          </NuxtLink>
        </template>
      </AuthCodeForm>
    </template>
  </AuthShell>
</template>
