<script setup lang="ts">
// /start (T-211, T-508; LLD §7.1, §14.1; PRD EX-1, EX-2, CL-4, PR-1).
// Instructions, the optional display name and class code (looked up as it is
// typed; `?class=SEC-XXXX` pre-fills it), then Start: POST
// /api/attempts/start, record the server clock (LLD §14.2) and open the
// runner. The identity lives in localStorage, so the form waits for it.
import { ref, watch } from "vue";
import { recordAttemptStart } from "~/composables/useAttempt";
import {
  buildStartBody,
  classCodeFromQuery,
  hasErrors,
  normaliseClassCodeInput,
  parseStartError,
  parseStartSuccess,
  retryAfterHeaderMs,
  startErrorMessage,
  validateStartForm,
  type ClassCodeState,
  type StartFormErrors,
} from "~/lib/start";

useSeoMeta({
  title: "Start the mock exam · Salus",
  description: "Instructions for the Security+ style practice exam. The timer starts when you do.",
});

const route = useRoute();
const identity = useAnonIdentity();

const displayName = ref("");
const classCode = ref(classCodeFromQuery(route.query.class));
const classState = ref<ClassCodeState>({ kind: "none" });
const errors = ref<StartFormErrors>({});
const formError = ref("");
const starting = ref(false);
const fields = ref<{ focusName: () => void; focusCode: () => void } | null>(null);
const formErrorId = useId();

watch(
  identity.ready,
  (ready) => {
    if (ready && !displayName.value) displayName.value = identity.displayName.value ?? "";
  },
  { immediate: true },
);
watch(
  () => route.query.class,
  (value) => {
    const code = classCodeFromQuery(value);
    if (code) classCode.value = code;
  },
);
watch(displayName, () => {
  if (errors.value.displayName) errors.value = { ...errors.value, displayName: undefined };
});
watch(classCode, () => {
  if (errors.value.classCode) errors.value = { ...errors.value, classCode: undefined };
});

function showError(field: "displayName" | "classCode" | null, message: string) {
  if (field === "displayName") {
    errors.value = { ...errors.value, displayName: message };
    fields.value?.focusName();
  } else if (field === "classCode") {
    errors.value = { ...errors.value, classCode: message };
    fields.value?.focusCode();
  } else {
    formError.value = message;
  }
}

async function start() {
  if (starting.value) return;
  formError.value = "";
  const token = identity.token.value;
  if (!token) return;
  const code = normaliseClassCodeInput(classCode.value);
  const found = validateStartForm({
    displayName: displayName.value,
    classCode: code,
    classState: classState.value,
  });
  errors.value = found;
  if (hasErrors(found)) {
    if (found.displayName) fields.value?.focusName();
    else fields.value?.focusCode();
    return;
  }

  starting.value = true;
  identity.setDisplayName(displayName.value.trim() || null);
  const body = buildStartBody({
    anonToken: token,
    displayName: displayName.value,
    classCode: code,
  });
  const sentAt = Date.now();
  let res;
  try {
    res = await $fetch.raw("/api/attempts/start", {
      method: "POST",
      body,
      headers: { "content-type": "application/json" },
      ignoreResponseError: true,
      retry: 0,
    });
  } catch {
    showError(null, startErrorMessage(null, { network: true }).message);
    starting.value = false;
    return;
  }
  const receivedAt = Date.now();

  const ok = res.status === 200 ? parseStartSuccess(res._data) : null;
  if (ok) {
    recordAttemptStart(ok.attemptId, ok.serverNow, sentAt, receivedAt);
    // `starting` stays true until the runner replaces this page (no double start).
    await navigateTo(`/exam/${encodeURIComponent(ok.attemptId)}`);
    return;
  }

  const { code: errCode, retryAfterMs } = parseStartError(res._data);
  const msg = startErrorMessage(errCode, {
    retryAfterMs: retryAfterMs ?? retryAfterHeaderMs(res.headers.get("retry-after")),
  });
  showError(msg.field, msg.message);
  starting.value = false;
}
</script>

<template>
  <div class="mx-auto flex w-full max-w-[1120px] flex-col gap-8 px-4 pt-4 pb-12 sm:px-12">
    <div class="flex flex-col gap-3">
      <NuxtLink
        to="/"
        class="flex items-center gap-1.5 self-start text-sm font-semibold text-muted-fg hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" aria-hidden="true" />
        Back
      </NuxtLink>
      <h1 class="m-0 text-[32px] leading-[1.05] font-extrabold tracking-[-0.03em] sm:text-[44px]">
        Before you start
      </h1>
      <p class="m-0 max-w-[620px] text-[17px] leading-[1.55] text-pretty text-muted-fg">
        A Security+ style practice exam: 90 questions in 90 minutes. Read the rules below, then
        press Start when you're ready.
      </p>
    </div>

    <ClientOnly>
      <LandingAttemptStatus :show-last="false" />
    </ClientOnly>

    <div class="grid items-start gap-6 lg:grid-cols-[1fr_420px]">
      <section aria-labelledby="instructions-heading" class="flex min-w-0 flex-col gap-3">
        <h2 id="instructions-heading" class="m-0 text-lg font-bold">Instructions</h2>
        <StartInstructions />
      </section>

      <form
        class="flex flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6 lg:sticky lg:top-6"
        aria-labelledby="start-heading"
        novalidate
        @submit.prevent="start"
      >
        <h2 id="start-heading" class="m-0 text-lg font-bold">Your details</h2>
        <StartDetailsFields
          ref="fields"
          v-model:display-name="displayName"
          v-model:class-code="classCode"
          v-model:class-state="classState"
          stacked
          :errors="errors"
          :disabled="starting"
        />
        <p class="m-0 text-[13px] leading-normal text-muted-fg">
          No account and no email. Join a class only if your tutor gave you a code; they'll see your
          display name and score.
        </p>

        <ClientOnly>
          <p
            v-if="identity.ready.value && !identity.persistent.value"
            class="m-0 flex gap-2 rounded-[16px] bg-warn-soft px-4 py-3 text-sm leading-snug text-warn"
            role="status"
          >
            <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-4 flex-none" />
            <span>
              This browser can't save your progress (storage is blocked, for example in a private
              window). Keep this tab open until you submit, or your answers and history will be
              lost.
            </span>
          </p>
        </ClientOnly>

        <div aria-live="assertive" aria-atomic="true">
          <p
            v-if="formError"
            :id="formErrorId"
            class="m-0 flex gap-2 rounded-[16px] bg-bad-soft px-4 py-3 text-[15px] font-semibold text-bad"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
            <span>{{ formError }}</span>
          </p>
        </div>

        <UButton
          type="submit"
          size="xl"
          block
          class="h-[54px] text-base font-bold"
          trailing-icon="i-lucide-arrow-right"
          :loading="starting || !identity.ready.value"
          :disabled="starting || !identity.ready.value"
          :aria-describedby="formError ? formErrorId : undefined"
          :label="starting ? 'Starting…' : 'Start the exam'"
        />
        <p class="m-0 text-center text-[13px] text-muted-fg">
          The 90-minute timer starts when you press Start.
        </p>
      </form>
    </div>
  </div>
</template>
