<script setup lang="ts">
// Landing page (T-211; LLD §14.1; PRD EX-1, QA-5; mockup screen 01). SSR.
// The form takes the optional display name and class code and goes on to
// /start, which shows the instructions (EX-2) and starts the timer. The
// display name is remembered in this browser; the class code travels as
// `?class=` (the same link tutors share, T-505). "Retake PBQs" (PB-4,
// T-307) goes to the same screen with `?mode=retake`; /start checks that set
// B is available for the exam or class.
import { ref, watch } from "vue";
import {
  EXAM_FACTS,
  hasErrors,
  normaliseClassCodeInput,
  startLocation,
  validateStartForm,
  type ClassCodeState,
  type StartFormErrors,
  type StartMode,
} from "~/lib/start";

useSeoMeta({
  title: "Salus · Security+ style mock exam",
  description:
    "Sit a full Security+ style practice exam: 5 performance-based questions and 85 multiple-choice in 90 minutes. No sign-up.",
});

const identity = useAnonIdentity();
const displayName = ref("");
const classCode = ref("");
const classState = ref<ClassCodeState>({ kind: "none" });
const errors = ref<StartFormErrors>({});
const fields = ref<{ focusName: () => void; focusCode: () => void } | null>(null);
const going = ref<StartMode | null>(null);

watch(
  identity.ready,
  (ready) => {
    if (ready && !displayName.value) displayName.value = identity.displayName.value ?? "";
  },
  { immediate: true },
);

// Clear a field's error as soon as the student edits it.
watch(displayName, () => {
  if (errors.value.displayName) errors.value = { ...errors.value, displayName: undefined };
});
watch(classCode, () => {
  if (errors.value.classCode) errors.value = { ...errors.value, classCode: undefined };
});

async function goToStart(mode: StartMode = "standard") {
  if (going.value) return;
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
  going.value = mode;
  identity.setDisplayName(displayName.value.trim() || null);
  await navigateTo(startLocation(mode, code));
  going.value = null;
}

const chips = [
  `${EXAM_FACTS.minutes} min`,
  `${EXAM_FACTS.points} points`,
  `${EXAM_FACTS.passScaled} to pass`,
];
</script>

<template>
  <div class="flex flex-1 flex-col">
    <section class="grid flex-1 gap-10 px-4 pt-4 pb-12 sm:px-12 lg:grid-cols-[1fr_520px]">
      <div class="flex min-w-0 flex-col justify-center gap-7">
        <span
          class="flex items-center gap-2 self-start rounded-full bg-brand-soft px-3.5 py-2 text-[13px] font-semibold text-brand-ink"
        >
          <UIcon name="i-lucide-zap" class="size-3.5" aria-hidden="true" />
          Security+ style practice exam · SY0-701
        </span>
        <h1
          class="m-0 text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] text-balance sm:text-[60px]"
        >
          Sit a full mock exam. No sign-up.
        </h1>
        <p class="m-0 max-w-[520px] text-[19px] leading-[1.55] text-pretty text-muted-fg">
          Five performance-based questions, then 85 multiple-choice. 90 minutes, marked the moment
          you submit.
        </p>

        <ul class="m-0 flex list-none flex-wrap gap-2 p-0 lg:hidden" aria-label="Exam at a glance">
          <li
            v-for="chip in chips"
            :key="chip"
            class="rounded-full bg-brand-soft px-3.5 py-2 text-[13px] font-bold text-brand-ink"
          >
            {{ chip }}
          </li>
        </ul>

        <form
          class="flex max-w-[560px] flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
          aria-label="Start a mock exam"
          novalidate
          @submit.prevent="goToStart()"
        >
          <StartDetailsFields
            ref="fields"
            v-model:display-name="displayName"
            v-model:class-code="classCode"
            v-model:class-state="classState"
            :errors="errors"
          />
          <div class="flex flex-wrap gap-2.5">
            <UButton
              type="submit"
              size="xl"
              class="h-[54px] min-w-[220px] flex-1 justify-center text-base font-bold"
              trailing-icon="i-lucide-arrow-right"
              :loading="going === 'standard'"
              :disabled="going !== null"
              label="Start mock exam"
            />
            <UButton
              type="button"
              size="xl"
              color="primary"
              variant="soft"
              class="h-[54px] justify-center px-[22px] text-[15px]"
              icon="i-lucide-rotate-ccw"
              :loading="going === 'retake'"
              :disabled="going !== null"
              label="Retake PBQs"
              aria-label="Retake PBQs (set B)"
              @click="goToStart('retake')"
            />
            <UButton
              to="/lab"
              size="xl"
              color="primary"
              variant="soft"
              class="h-[54px] justify-center px-[22px] text-[15px]"
              icon="i-lucide-terminal"
              label="Practice lab"
            />
          </div>
          <p class="m-0 text-[13px] leading-normal text-muted-fg">
            Next you'll see the instructions. The timer starts only when you press Start.
          </p>
        </form>

        <ClientOnly>
          <LandingAttemptStatus />
        </ClientOnly>
      </div>

      <HeroArt class="hidden min-h-[480px] lg:block" />
    </section>

    <LandingScoring />
  </div>
</template>
