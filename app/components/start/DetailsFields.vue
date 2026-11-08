<script setup lang="ts">
// Display name and class code fields (T-211, T-508; PRD EX-1, CL-4, PR-1).
// Used by the landing form and /start. The class code is looked up as it is
// typed (`classes.lookupCode`, debounced) and the result is reported through
// `v-model:class-state`; the parent decides whether the form can start.
import { computed, onScopeDispose, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import {
  CLASS_CODE_EXAMPLE,
  CLASS_CODE_INPUT_MAX,
  CLASS_LOOKUP_DEBOUNCE_MS,
  START_DISPLAY_NAME_MAX,
  classCodeMessage,
  classCodeState,
  isCompleteClassCode,
  normaliseClassCodeInput,
  type ClassCodeState,
  type ClassLookupResult,
  type StartFormErrors,
} from "~/lib/start";

const props = defineProps<{
  errors?: StartFormErrors;
  disabled?: boolean;
  /** One column at every width (the narrow form on /start). */
  stacked?: boolean;
}>();

const displayName = defineModel<string>("displayName", { required: true });
const classCode = defineModel<string>("classCode", { required: true });
const classState = defineModel<ClassCodeState>("classState", { required: true });

const nameId = useId();
const nameHelpId = useId();
const nameErrorId = useId();
const codeId = useId();
const codeMsgId = useId();

const nameInput = ref<{ inputRef?: HTMLInputElement } | null>(null);
const codeInput = ref<{ inputRef?: HTMLInputElement } | null>(null);

/** Lookup answers by normalised code, so retyping a code doesn't query again. */
const cache = new Map<string, ClassLookupResult>();
const lookup = ref<ClassLookupResult | "error" | undefined>(undefined);
let timer: ReturnType<typeof setTimeout> | null = null;
let seq = 0;
const nuxtApp = useNuxtApp();

function clearTimer() {
  if (timer) clearTimeout(timer);
  timer = null;
}

async function runLookup(code: string, mySeq: number) {
  try {
    const result = await nuxtApp.$convex.query(api.classes.lookupCode, { code });
    cache.set(code, result);
    if (mySeq === seq) lookup.value = result;
  } catch {
    if (mySeq === seq) lookup.value = "error";
  }
}

watch(
  () => normaliseClassCodeInput(classCode.value),
  (code) => {
    clearTimer();
    const mySeq = ++seq;
    if (!isCompleteClassCode(code)) {
      lookup.value = undefined;
      return;
    }
    if (cache.has(code)) {
      lookup.value = cache.get(code) ?? null;
      return;
    }
    lookup.value = undefined;
    if (!import.meta.client) return;
    timer = setTimeout(() => void runLookup(code, mySeq), CLASS_LOOKUP_DEBOUNCE_MS);
  },
  { immediate: true },
);
onScopeDispose(clearTimer);

watch(
  () => classCodeState(normaliseClassCodeInput(classCode.value), lookup.value),
  (state) => {
    classState.value = state;
  },
  { immediate: true },
);

/** Show the stored form of the code (`4k7q` → `SEC-4K7Q`) once the student leaves the field. */
function tidyCode() {
  const code = normaliseClassCodeInput(classCode.value);
  if (code !== classCode.value) classCode.value = code;
}

const nameRequired = computed(() => normaliseClassCodeInput(classCode.value).length > 0);
const codeLookupMessage = computed(() => {
  // Don't nag while the student is still typing the first characters.
  if (classState.value.kind === "invalid" && classCode.value.trim().length < 8) return null;
  return classCodeMessage(classState.value);
});
const codeMessage = computed(() =>
  props.errors?.classCode
    ? { text: props.errors.classCode, tone: "bad" as const }
    : codeLookupMessage.value,
);

const toneClass = {
  ok: "text-ok",
  bad: "text-bad",
  muted: "text-muted-fg",
} as const;
const toneIcon = {
  ok: "i-lucide-circle-check",
  bad: "i-lucide-circle-alert",
  muted: "i-lucide-info",
} as const;

defineExpose({
  focusName: () => nameInput.value?.inputRef?.focus(),
  focusCode: () => codeInput.value?.inputRef?.focus(),
});
</script>

<template>
  <div class="grid gap-3" :class="{ 'sm:grid-cols-2': !stacked }">
    <div class="flex flex-col gap-1.5">
      <label :for="nameId" class="text-[13px] font-semibold text-muted-fg">
        Display name
        <span class="font-normal">· {{ nameRequired ? "required for a class" : "optional" }}</span>
      </label>
      <UInput
        :id="nameId"
        ref="nameInput"
        v-model="displayName"
        name="displayName"
        autocomplete="nickname"
        :maxlength="START_DISPLAY_NAME_MAX + 10"
        :required="nameRequired"
        :disabled="disabled"
        size="xl"
        placeholder="e.g. Amara"
        :aria-invalid="errors?.displayName ? 'true' : undefined"
        :aria-describedby="errors?.displayName ? `${nameErrorId} ${nameHelpId}` : nameHelpId"
        class="w-full"
        :ui="{ base: 'h-12 rounded-[16px] bg-surface-2 ring-0 text-[15px]' }"
      />
      <p :id="nameHelpId" class="sr-only">
        Up to {{ START_DISPLAY_NAME_MAX }} characters. Shown to your tutor if you join a class.
        Don't use your full name if you'd rather not.
      </p>
      <p
        v-if="errors?.displayName"
        :id="nameErrorId"
        class="m-0 flex gap-1.5 text-[13px] leading-snug font-semibold text-bad"
      >
        <UIcon name="i-lucide-circle-alert" class="mt-px size-4 flex-none" />
        <span>{{ errors.displayName }}</span>
      </p>
    </div>

    <div class="flex flex-col gap-1.5">
      <label :for="codeId" class="text-[13px] font-semibold text-muted-fg">
        Class code <span class="font-normal">· optional</span>
      </label>
      <UInput
        :id="codeId"
        ref="codeInput"
        v-model="classCode"
        name="classCode"
        autocomplete="off"
        autocapitalize="characters"
        spellcheck="false"
        :maxlength="CLASS_CODE_INPUT_MAX"
        :disabled="disabled"
        size="xl"
        :placeholder="CLASS_CODE_EXAMPLE"
        :aria-invalid="errors?.classCode || codeMessage?.tone === 'bad' ? 'true' : undefined"
        :aria-describedby="codeMsgId"
        class="w-full"
        :ui="{
          base: 'h-12 rounded-[16px] bg-surface-2 ring-0 font-mono text-[15px] uppercase placeholder:normal-case',
        }"
        @blur="tidyCode"
      />
      <div :id="codeMsgId" aria-live="polite" aria-atomic="true">
        <p
          v-if="codeMessage"
          class="m-0 flex gap-1.5 text-[13px] leading-snug font-semibold"
          :class="toneClass[codeMessage.tone]"
        >
          <UIcon :name="toneIcon[codeMessage.tone]" class="mt-px size-4 flex-none" />
          <span>{{ codeMessage.text }}</span>
        </p>
      </div>
    </div>
  </div>
</template>
