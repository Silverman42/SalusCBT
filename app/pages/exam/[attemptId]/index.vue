<script setup lang="ts">
// Exam runner (T-213, LLD §14.1–14.2, PRD EX-6 to EX-9, EX-12, QA-2).
// Client only (routeRules `/exam/**`). Mockup screens 02 (MCQ + navigator),
// 03–04 (PBQs) and 05 (review before submitting).
//
// Keyboard: Tab through everything; A–E or 1–5 choose an MCQ option; ← and →
// go to the previous / next question when focus isn't in a form field; the
// navigator grid is one tab stop with arrow keys inside. Focus moves to the
// question heading on every question change.
import { SavesPendingError, useAttempt } from "~/composables/useAttempt";
import { useExamTimer } from "~/composables/useExamTimer";
import { errorCodeOf } from "~/lib/attemptSync";
import {
  mcqValue,
  navCellState,
  navLabel,
  nextLabel,
  optionIndexForKey,
  questionStatus,
  reviewItems,
  summarise,
  type NavigatorCell,
  type SubmitProblem,
} from "~/lib/examRunner";
import type { AnswerValue } from "~~/shared/content";

definePageMeta({ layout: false });
useSeoMeta({ title: "Exam · Salus", robots: "noindex" });

const route = useRoute();
const attemptId = String(route.params.attemptId);
const resultPath = `/exam/${encodeURIComponent(attemptId)}/result`;

const attempt = useAttempt(attemptId);
const {
  paper,
  loadError,
  status,
  readOnly: attemptReadOnly,
  remainingMs,
  currentIndex,
  responses,
  answers,
  flags,
  saving,
  online,
  persistent,
  pendingCount,
  saveError,
  syncStatus,
} = attempt;

const questions = computed(() => paper.value?.questions ?? []);
const current = computed(() => questions.value[currentIndex.value]);
const view = ref<"question" | "review">("question");

// Remember the open question across a refresh (this tab only).
const INDEX_KEY = `salus.runner.${attemptId}.index`;
watch(paper, (p) => {
  if (!p) return;
  try {
    const saved = Number(sessionStorage.getItem(INDEX_KEY));
    if (Number.isInteger(saved) && saved > 0 && saved < p.questions.length) {
      currentIndex.value = saved;
    }
  } catch {
    // Storage blocked: start at the first question.
  }
  focusHeading();
});
watch(currentIndex, (i) => {
  try {
    sessionStorage.setItem(INDEX_KEY, String(i));
  } catch {
    // Not important enough to report.
  }
});

// --- derived state -----------------------------------------------------------

const summary = computed(() => summarise(questions.value, responses.value));
const cells = computed<NavigatorCell[]>(() =>
  questions.value.map((q, i) => {
    const s = questionStatus(q, responses.value[q.questionId]);
    return { label: navLabel(questions.value, i), state: navCellState(s), partial: s.partial };
  }),
);
const items = computed(() => reviewItems(questions.value, responses.value));
const pbqCount = computed(() => questions.value.filter((q) => q.kind === "pbq").length);
const pbqNumber = computed(() => {
  const label = navLabel(questions.value, currentIndex.value);
  return label.startsWith("P") ? Number(label.slice(1)) : 0;
});

const modeLabel = computed(() =>
  paper.value?.mode === "retake" ? "SY0-701 · PBQ retake" : "SY0-701 · Standard",
);
const chip = computed(() => {
  const q = current.value;
  if (view.value === "review" || !q) return null;
  if (q.kind === "pbq") {
    return `PBQ ${pbqNumber.value} of ${pbqCount.value} · ${q.points} ${q.points === 1 ? "point" : "points"}`;
  }
  return modeLabel.value;
});

// --- timer, time calls, pacing (T-214) -------------------------------------------

const currentLabel = computed(() => {
  const q = current.value;
  if (!q) return undefined;
  return q.kind === "mcq" ? `Q${q.displayNumber}` : `PBQ ${pbqNumber.value}`;
});
const timer = useExamTimer(attempt, {
  currentLabel,
  // Submitted or expired (0:00 submit, server autoSubmit, another tab): show the result.
  onClosed: () => void navigateTo(resultPath, { replace: true }),
});
const { alerts, announcement, timeUp, phase: timeUpPhase } = timer;
const readOnly = computed(() => attemptReadOnly.value || timeUp.value);
const timeUpMessage = computed(() => {
  if (timeUpPhase.value === "submitting") return "Time is up. Submitting your exam…";
  if (timeUpPhase.value === "waiting") {
    return "Time is up. We couldn't reach the server, so it will submit your exam automatically within a minute or two. Answers already saved count. Keep this page open: your result opens when it's ready.";
  }
  return null;
});
function dismissAlert(id: Parameters<typeof timer.dismiss>[0]) {
  timer.dismiss(id);
  focusHeading();
}

const closedMessage = computed(() => {
  if (status.value === "expired") return "Time is up. Your exam was submitted automatically.";
  if (status.value === "submitted") return "This exam has been submitted.";
  if (syncStatus.value === "closed") return "This exam is closed. Answers can no longer change.";
  if (syncStatus.value === "stopped") {
    return "Saving stopped because this browser's exam ID was refused. Your answers are kept on this device.";
  }
  return null;
});
const showResultLink = computed(
  () => status.value === "submitted" || status.value === "expired" || syncStatus.value === "closed",
);

// --- navigation and focus ------------------------------------------------------

const heading = ref<HTMLElement | null>(null);
const mcqRef = ref<{ choose: (index: number) => void } | null>(null);

function focusHeading() {
  nextTick(() => heading.value?.focus());
}

function go(index: number) {
  if (index < 0 || index >= questions.value.length) return;
  currentIndex.value = index;
  view.value = "question";
  focusHeading();
}
function next() {
  if (currentIndex.value >= questions.value.length - 1) openReview();
  else go(currentIndex.value + 1);
}
function prev() {
  go(currentIndex.value - 1);
}
function openReview() {
  void attempt.flush();
  view.value = "review";
  window.scrollTo({ top: 0 });
}
function backToExam() {
  view.value = "question";
  focusHeading();
}

// --- answers ----------------------------------------------------------------------

function setMcq(optionIds: string[]) {
  const q = current.value;
  if (!q || readOnly.value) return;
  attempt.setAnswer(q.questionId, mcqValue(optionIds));
}
function setPbq(value: AnswerValue | null, opts?: { debounce?: boolean }) {
  const q = current.value;
  if (!q || readOnly.value) return;
  attempt.setAnswer(q.questionId, value, opts);
}
function toggleFlag() {
  const q = current.value;
  if (!q || readOnly.value) return;
  attempt.toggleFlag(q.questionId);
}
const currentOptionIds = computed(() => {
  const q = current.value;
  const v = q ? answers.value[q.questionId] : undefined;
  return v?.kind === "mcq" ? v.optionIds : [];
});

// --- keyboard shortcuts -------------------------------------------------------------

function isTextEntry(el: EventTarget | null) {
  if (!(el instanceof HTMLElement)) return false;
  if (
    el.isContentEditable ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement
  ) {
    return true;
  }
  return el instanceof HTMLInputElement && !["radio", "checkbox", "button"].includes(el.type);
}

function onKeydown(e: KeyboardEvent) {
  if (view.value !== "question" || !current.value) return;
  if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTextEntry(e.target)) return;
  const onChoice = e.target instanceof HTMLInputElement; // radio/checkbox: arrows are native
  if (e.key === "ArrowRight" && !onChoice) {
    e.preventDefault();
    if (currentIndex.value < questions.value.length - 1) next();
    return;
  }
  if (e.key === "ArrowLeft" && !onChoice) {
    e.preventDefault();
    prev();
    return;
  }
  const q = current.value;
  if (q.kind === "mcq" && !readOnly.value && !e.shiftKey) {
    const i = optionIndexForKey(e.key, q.options.length);
    if (i >= 0) {
      e.preventDefault();
      mcqRef.value?.choose(i);
    }
  }
}
onMounted(() => window.addEventListener("keydown", onKeydown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeydown));

// --- submit -----------------------------------------------------------------------

const submitting = ref(false);
const problem = ref<SubmitProblem | null>(null);

async function submit(force: boolean) {
  if (submitting.value) return;
  submitting.value = true;
  problem.value = null;
  try {
    await attempt.submit({ force });
    await navigateTo(resultPath);
  } catch (err) {
    if (err instanceof SavesPendingError) {
      problem.value = { kind: "pending", count: err.pending };
    } else if (errorCodeOf(err) === "ATTEMPT_CLOSED") {
      // Already closed (the timer got there first): the result is ready.
      await navigateTo(resultPath);
    } else {
      problem.value = {
        kind: "error",
        message: "Couldn't submit. Check your connection and try again. Your answers are saved.",
      };
    }
  } finally {
    submitting.value = false;
  }
}

function goToResult() {
  void navigateTo(resultPath);
}

const LOAD_ERRORS: Record<string, { title: string; body: string }> = {
  NOT_FOUND: {
    title: "We couldn't find that exam",
    body: "The link may be wrong, or the exam was started in another browser.",
  },
  BAD_TOKEN: {
    title: "This browser's exam ID isn't valid",
    body: "Start a new exam from the home page.",
  },
};
const loadErrorText = computed(() =>
  loadError.value
    ? (LOAD_ERRORS[loadError.value] ?? {
        title: "Couldn't load the exam",
        body: "Check your connection, then try again.",
      })
    : null,
);
function reload() {
  window.location.reload();
}
</script>

<template>
  <div class="flex min-h-dvh flex-col bg-canvas text-fg">
    <ExamRunnerHeader
      :chip="chip"
      :show-review="!!paper && view === 'question'"
      @review="openReview"
    >
      <template v-if="paper" #status>
        <ExamSaveStatus
          :saving="saving"
          :online="online"
          :persistent="persistent"
          :pending-count="pendingCount"
          :save-error="saveError"
          :sync-status="syncStatus"
        />
      </template>
      <template v-if="paper" #timer>
        <ExamTimer :remaining-ms="remainingMs" :announcement="announcement" />
      </template>
    </ExamRunnerHeader>

    <main class="flex min-w-0 flex-1 flex-col gap-4 p-3 sm:gap-5 sm:p-5">
      <!-- 0:00 (T-214): submitting, or waiting for the server's auto-submit -->
      <div
        v-if="timeUpMessage"
        role="status"
        class="flex items-center gap-3 rounded-[20px] bg-warn-soft px-[18px] py-3.5"
      >
        <UIcon
          :name="
            timeUpPhase === 'submitting' ? 'i-lucide-loader-circle' : 'i-lucide-alarm-clock-off'
          "
          class="size-[18px] flex-none text-warn"
          :class="timeUpPhase === 'submitting' ? 'motion-safe:animate-spin' : ''"
          aria-hidden="true"
        />
        <span class="flex-1 text-[15px] font-semibold text-fg">{{ timeUpMessage }}</span>
      </div>

      <!-- Load error -->
      <div v-if="loadErrorText && !paper" class="flex flex-1 items-center justify-center">
        <div
          role="alert"
          class="flex w-full max-w-[520px] flex-col gap-4 rounded-[28px] bg-surface p-6 sm:p-8"
        >
          <span class="grid size-11 place-items-center rounded-[16px] bg-bad-soft text-bad">
            <UIcon name="i-lucide-triangle-alert" class="size-5" />
          </span>
          <h1 class="m-0 text-2xl font-extrabold tracking-[-0.02em]">{{ loadErrorText.title }}</h1>
          <p class="m-0 text-[15px] text-muted-fg">{{ loadErrorText.body }}</p>
          <div class="flex flex-wrap gap-2">
            <UButton
              v-if="loadError !== 'NOT_FOUND' && loadError !== 'BAD_TOKEN'"
              size="lg"
              icon="i-lucide-rotate-cw"
              label="Try again"
              @click="reload"
            />
            <UButton to="/" size="lg" variant="soft" label="Back to home" />
          </div>
        </div>
      </div>

      <!-- Loading -->
      <div
        v-else-if="!paper"
        class="flex flex-1 items-center justify-center"
        role="status"
        aria-live="polite"
      >
        <span class="flex items-center gap-3 text-[15px] font-semibold text-muted-fg">
          <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
          Loading your exam…
        </span>
      </div>

      <!-- Review before submitting (screen 05) -->
      <ExamReviewSubmit
        v-else-if="view === 'review'"
        :summary="summary"
        :items="items"
        :read-only="readOnly"
        :submitting="submitting"
        :problem="problem"
        @back="backToExam"
        @jump="go"
        @submit="submit"
        @result="goToResult"
      />

      <!-- Question (screens 02–04) -->
      <div v-else-if="current" class="flex min-w-0 flex-col gap-4 sm:gap-5">
        <div
          v-if="closedMessage && !timeUpMessage"
          role="status"
          class="flex flex-col gap-3 rounded-[20px] bg-brand-soft px-[18px] py-3.5 sm:flex-row sm:items-center"
        >
          <UIcon name="i-lucide-lock" class="size-[18px] flex-none text-brand-ink" />
          <span class="flex-1 text-[15px] font-semibold">{{ closedMessage }}</span>
          <UButton
            v-if="showResultLink"
            size="md"
            trailing-icon="i-lucide-arrow-right"
            label="See your result"
            @click="goToResult"
          />
        </div>
        <ExamPacingBanner v-if="!readOnly" :alerts="alerts" @dismiss="dismissAlert" />

        <div
          class="grid min-w-0 gap-4 sm:gap-5"
          :class="current.kind === 'mcq' ? 'lg:grid-cols-[minmax(0,1fr)_360px]' : ''"
        >
          <!-- MCQ (screen 02) -->
          <section
            v-if="current.kind === 'mcq'"
            class="flex min-w-0 flex-col gap-6 rounded-[28px] bg-surface p-5 sm:px-10 sm:py-9"
            :aria-labelledby="`q-heading`"
          >
            <div class="flex flex-wrap items-center gap-2.5">
              <h1
                id="q-heading"
                ref="heading"
                tabindex="-1"
                class="m-0 text-[15px] font-extrabold outline-none"
              >
                Question {{ current.displayNumber }}
                <span class="font-normal text-muted-fg">of {{ questions.length }}</span>
              </h1>
              <span
                v-if="flags[current.questionId]"
                class="rounded-full bg-warn-soft px-3 py-[5px] text-[13px] font-semibold text-fg"
              >
                Flagged
              </span>
            </div>
            <ExamQuestionMcq
              ref="mcqRef"
              :key="current.questionId"
              :question="current"
              :model-value="currentOptionIds"
              :read-only="readOnly"
              stem-id="q-stem"
              @update:model-value="setMcq"
            />
            <div class="flex-1" />
            <ExamQuestionFooter
              :can-prev="currentIndex > 0"
              :next-label="nextLabel(questions, currentIndex)"
              :flagged="!!flags[current.questionId]"
              :read-only="readOnly"
              @prev="prev"
              @next="next"
              @flag="toggleFlag"
            />
          </section>

          <!-- PBQ (screens 03–04) -->
          <ExamQuestionPbq
            v-else
            :key="current.questionId"
            :question="current"
            :model-value="answers[current.questionId]"
            :read-only="readOnly"
            @update:model-value="setPbq"
          >
            <template #heading>
              <div class="flex flex-col gap-1">
                <span class="text-[13px] font-semibold text-muted-fg md:hidden">
                  PBQ {{ pbqNumber }} of {{ pbqCount }} · {{ current.points }} points
                </span>
                <h1
                  ref="heading"
                  tabindex="-1"
                  class="m-0 text-xl font-extrabold tracking-[-0.01em] outline-none"
                >
                  <span class="sr-only">PBQ {{ pbqNumber }}: </span>{{ current.stem }}
                </h1>
              </div>
            </template>
            <template #footer>
              <ExamQuestionFooter
                :can-prev="currentIndex > 0"
                :next-label="nextLabel(questions, currentIndex)"
                :flagged="!!flags[current.questionId]"
                :read-only="readOnly"
                compact
                @prev="prev"
                @next="next"
                @flag="toggleFlag"
              />
            </template>
          </ExamQuestionPbq>

          <ExamNavigator
            :cells="cells"
            :current-index="currentIndex"
            :answered="summary.answered"
            class="lg:self-start"
            @jump="go"
          />
        </div>
        <p class="m-0 hidden text-[13px] text-muted-fg lg:block" aria-hidden="true">
          Keys: A–E choose an answer · ← → previous / next question
        </p>
      </div>
    </main>
  </div>
</template>
