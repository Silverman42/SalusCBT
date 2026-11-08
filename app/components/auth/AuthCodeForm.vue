<script setup lang="ts">
// Code entry for /sign-in and /invite/[token] (mockup screen 08, AU-1 to AU-3).
// The parent has just requested a code for `email`; this form checks it,
// offers a resend after the cooldown and emits `verified` once signed in.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from "vue";
import { useAuth } from "~/composables/useAuth";
import {
  CODE_LENGTH,
  codeResentText,
  isCompleteCode,
  needsNewCode,
  RESEND_AFTER_S,
  formatCountdown,
  sanitizeCode,
  sendCodeErrorMessage,
  verifyErrorMessage,
} from "~/lib/signIn";

const props = withDefaults(
  defineProps<{
    email: string;
    /** Seconds before "Resend code" is offered; the parent just sent one. */
    initialCooldownS?: number;
    /** An error to show straight away (e.g. the first send was rate limited). */
    initialError?: string;
  }>(),
  { initialCooldownS: RESEND_AFTER_S, initialError: "" },
);

const emit = defineEmits<{ verified: [] }>();

const auth = useAuth();
const inputId = useId();
const errorId = useId();
const noticeId = useId();
const input = ref<HTMLInputElement | null>(null);

const code = ref("");
const busy = ref(false);
const resending = ref(false);
const error = ref(props.initialError);
const notice = ref("");
/** The code that last failed, so a complete code isn't auto-submitted twice. */
const lastTried = ref("");
const focused = ref(false);

const cooldown = ref(Math.max(0, props.initialCooldownS));
let timer: ReturnType<typeof setInterval> | null = null;

function startCooldown(seconds: number) {
  cooldown.value = Math.max(0, seconds);
  if (timer) clearInterval(timer);
  if (cooldown.value === 0) return;
  timer = setInterval(() => {
    cooldown.value = Math.max(0, cooldown.value - 1);
    if (cooldown.value === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  }, 1000);
}

const cooldownText = computed(() => formatCountdown(cooldown.value));

const digits = computed(() => Array.from({ length: CODE_LENGTH }, (_, i) => code.value[i] ?? ""));
/** Box that shows the caret: the next empty one, or the last when full. */
const activeIndex = computed(() => Math.min(code.value.length, CODE_LENGTH - 1));

function focusInput(select = false) {
  void nextTick(() => {
    input.value?.focus();
    if (select) input.value?.select();
  });
}

function onInput(event: Event) {
  const el = event.target as HTMLInputElement;
  const clean = sanitizeCode(el.value);
  code.value = clean;
  // Keep the DOM value in step when letters or extra digits were dropped.
  if (el.value !== clean) el.value = clean;
  if (isCompleteCode(clean) && clean !== lastTried.value && !busy.value) void verify();
}

async function verify() {
  if (busy.value) return;
  if (!isCompleteCode(code.value)) {
    error.value = `Enter the ${CODE_LENGTH}-digit code from the email.`;
    focusInput();
    return;
  }
  busy.value = true;
  error.value = "";
  notice.value = "";
  const tried = code.value;
  try {
    const { error: failure, retryAfterS } = await auth.verifyCode(props.email, tried);
    if (!failure) {
      emit("verified");
      return;
    }
    lastTried.value = tried;
    error.value = verifyErrorMessage(failure, retryAfterS);
    if (needsNewCode(failure)) {
      code.value = "";
      // A dead code: let them ask for a new one now if the cooldown allows.
    }
  } catch {
    lastTried.value = tried;
    error.value = verifyErrorMessage({}, null);
  } finally {
    busy.value = false;
  }
  focusInput(true);
}

async function resend() {
  if (cooldown.value > 0 || resending.value) return;
  resending.value = true;
  error.value = "";
  notice.value = "";
  try {
    const { error: failure, retryAfterS } = await auth.sendCode(props.email);
    if (failure) {
      error.value = sendCodeErrorMessage(failure, retryAfterS);
      startCooldown(retryAfterS ?? RESEND_AFTER_S);
    } else {
      code.value = "";
      lastTried.value = "";
      notice.value = codeResentText(props.email);
      startCooldown(RESEND_AFTER_S);
    }
  } catch {
    error.value = sendCodeErrorMessage({}, null);
  } finally {
    resending.value = false;
  }
  focusInput();
}

onMounted(() => {
  startCooldown(cooldown.value);
  focusInput();
});

onBeforeUnmount(() => {
  if (timer) clearInterval(timer);
});

defineExpose({ focus: focusInput });
</script>

<template>
  <form class="flex flex-col gap-6" novalidate @submit.prevent="verify">
    <div class="flex flex-col gap-2">
      <label :for="inputId" class="text-sm font-semibold">Sign-in code</label>
      <!-- One real input (paste, autofill, screen readers) over six display boxes. -->
      <div class="relative">
        <div class="grid grid-cols-6 gap-2 sm:gap-2.5" aria-hidden="true">
          <div
            v-for="(digit, i) in digits"
            :key="i"
            class="grid h-14 place-items-center rounded-[18px] text-2xl font-extrabold tabular-nums sm:h-16 sm:text-[28px]"
            :class="[
              digit || (focused && i === activeIndex) ? 'bg-surface' : 'bg-surface-2',
              focused && i === activeIndex ? 'ring-2 ring-brand ring-inset' : '',
            ]"
          >
            <span v-if="digit">{{ digit }}</span>
            <span
              v-else-if="focused && i === activeIndex"
              class="h-7 w-0.5 animate-pulse bg-brand"
            />
          </div>
        </div>
        <input
          :id="inputId"
          ref="input"
          :value="code"
          type="text"
          name="code"
          inputmode="numeric"
          autocomplete="one-time-code"
          pattern="[0-9]*"
          :maxlength="CODE_LENGTH + 8"
          spellcheck="false"
          :aria-invalid="error ? 'true' : undefined"
          :aria-describedby="
            [error ? errorId : '', notice ? noticeId : ''].join(' ').trim() || undefined
          "
          class="absolute inset-0 h-full w-full cursor-text rounded-[18px] bg-transparent text-transparent caret-transparent outline-none selection:bg-transparent"
          @input="onInput"
          @focus="focused = true"
          @blur="focused = false"
        />
      </div>
    </div>

    <!-- Live regions stay in the DOM; the negative margin cancels the gap while empty. -->
    <div aria-live="assertive" aria-atomic="true" class="-mb-6 has-[p]:mb-0">
      <p
        v-if="error"
        :id="errorId"
        class="m-0 flex gap-2 rounded-[16px] bg-bad-soft px-4 py-3 text-[15px] font-semibold text-bad"
      >
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
        <span>{{ error }}</span>
      </p>
    </div>
    <div aria-live="polite" aria-atomic="true" class="-mb-6 has-[p]:mb-0">
      <p
        v-if="notice"
        :id="noticeId"
        class="m-0 flex gap-2 rounded-[16px] bg-ok-soft px-4 py-3 text-[15px] font-semibold text-ok"
      >
        <UIcon name="i-lucide-mail-check" class="mt-0.5 size-[18px] flex-none" />
        <span>{{ notice }}</span>
      </p>
    </div>

    <UButton
      type="submit"
      size="xl"
      block
      :loading="busy"
      :disabled="!isCompleteCode(code) && !busy"
      label="Sign in"
    />

    <div class="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-muted-fg">
      <span v-if="cooldown > 0" aria-live="off">
        Resend code in
        <b class="font-semibold text-fg tabular-nums">{{ cooldownText }}</b>
      </span>
      <button
        v-else
        type="button"
        class="font-semibold text-brand-ink hover:underline disabled:opacity-60"
        :disabled="resending"
        @click="resend"
      >
        {{ resending ? "Sending…" : "Resend code" }}
      </button>
      <slot name="secondary" />
    </div>
  </form>
</template>
