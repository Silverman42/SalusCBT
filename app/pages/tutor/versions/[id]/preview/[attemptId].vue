<script setup lang="ts">
// /tutor/versions/[id]/preview/[attemptId] (T-608; ED-1; LLD §5.2): the
// tutor sits a preview attempt of their version as a student would, submits
// it, and sees the real marking and review. A simplified runner inside the
// staff area: the student question components, a navigator, saves as you
// go, submit; then the result and answer review.
//
// The attempt belongs to the anon token `editor.previewAttempt` returned. It
// is read from this tab's sessionStorage (`~/lib/editorPreview`) and never
// touches the student identity (`useAnonIdentity`), so the tutor's own
// student history is unaffected and the student runner pages aren't used.
import type { FunctionReturnType } from "convex/server";
import { computed, nextTick, onBeforeUnmount, ref, shallowRef } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import type { AnswerValue } from "~~/shared/content";
import type { AttemptPaper } from "~/composables/useAttempt";
import { errorCodeOf, type ResponseMap } from "~/lib/attemptSync";
import { loadPreviewTicket, previewModeLabel, PreviewSaver } from "~/lib/editorPreview";
import {
  mcqValue,
  navCellState,
  navLabel,
  nextLabel,
  questionStatus,
  summarise,
  type NavigatorCell,
} from "~/lib/examRunner";
import { useMinuteClock } from "~/composables/useMinuteClock";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Preview as student" });
useHead({ title: "Preview as student" });

type Result = FunctionReturnType<typeof api.review.getResult>;
type Review = FunctionReturnType<typeof api.review.getReview>;

const route = useRoute();
const versionId = String(route.params.id ?? "");
const attemptId = String(route.params.attemptId ?? "") as Id<"attempts">;
const editorPath = `/tutor/versions/${encodeURIComponent(versionId)}`;

const { $convex } = useNuxtApp();

let storage: Storage | null = null;
try {
  storage = window.sessionStorage;
} catch {
  storage = null;
}
const ticket = loadPreviewTicket(storage, attemptId, versionId);
const args = ticket ? { attemptId, anonToken: ticket.anonToken } : null;

type Phase = "missing" | "loading" | "sitting" | "submitting" | "done" | "error";
const phase = ref<Phase>(args ? "loading" : "missing");
const loadMessage = ref("");

const paper = shallowRef<AttemptPaper | null>(null);
const responses = ref<ResponseMap>({});
const deadline = ref(0);
const clockOffset = ref(0);
const result = shallowRef<Result | null>(null);
const review = shallowRef<Review | null>(null);

const pending = ref(0);
const saveFailed = ref(false);
const saver = new PreviewSaver<AnswerValue>(
  async (questionId, value) => {
    if (!args) return;
    await $convex.mutation(api.attempts.saveResponse, {
      ...args,
      questionId: questionId as Id<"questions">,
      flagged: false,
      ...(value ? { value } : {}),
    });
  },
  (s) => {
    pending.value = s.pending;
    saveFailed.value = s.error !== null;
    if (errorCodeOf(s.error) === "ATTEMPT_CLOSED") void showResult();
  },
);
onBeforeUnmount(() => saver.dispose());

async function showResult() {
  if (!args) return;
  try {
    const [r, items] = await Promise.all([
      $convex.query(api.review.getResult, args),
      $convex.query(api.review.getReview, args),
    ]);
    result.value = r;
    review.value = items;
    phase.value = "done";
    void nextTick(() => document.getElementById("preview-result-heading")?.focus());
  } catch {
    phase.value = "error";
    loadMessage.value = "Couldn't load the result. Check your connection and reload the page.";
  }
}

async function load() {
  if (!args) return;
  try {
    const state = await $convex.query(api.attempts.getState, args);
    clockOffset.value = state.serverNow - Date.now();
    deadline.value = state.deadline;
    if (state.status !== "in_progress") return void (await showResult());
    paper.value = await $convex.query(api.attempts.getPaper, args);
    responses.value = Object.fromEntries(
      state.responses.map((r) => [
        r.questionId,
        { flagged: false, updatedAt: r.updatedAt, ...(r.value ? { value: r.value } : {}) },
      ]),
    );
    phase.value = "sitting";
    void nextTick(focusHeading);
  } catch (err) {
    phase.value = "error";
    loadMessage.value =
      errorCodeOf(err) === "NOT_FOUND" || errorCodeOf(err) === "BAD_TOKEN"
        ? "This preview no longer exists. A newer preview of the same paper replaces it."
        : "Couldn't load the preview. Check your connection and reload the page.";
  }
}
void load();

// ---------------------------------------------------------------- sitting

const index = ref(0);
const questions = computed(() => paper.value?.questions ?? []);
const current = computed(() => questions.value[index.value]);
const summary = computed(() => summarise(questions.value, responses.value));
const cells = computed<NavigatorCell[]>(() =>
  questions.value.map((q, i) => {
    const s = questionStatus(q, responses.value[q.questionId]);
    return { label: navLabel(questions.value, i), state: navCellState(s), partial: s.partial };
  }),
);
const answerOf = (questionId: string) => responses.value[questionId]?.value;
const currentOptionIds = computed(() => {
  const v = current.value ? answerOf(current.value.questionId) : undefined;
  return v?.kind === "mcq" ? v.optionIds : [];
});

const now = useMinuteClock();
const remaining = computed(() => deadline.value - (now.value + clockOffset.value));

function minutesLeft(ms: number) {
  const m = Math.max(0, Math.ceil(ms / 60_000));
  return m === 1 ? "1 minute" : `${m} minutes`;
}

const heading = ref<HTMLElement | null>(null);
function focusHeading() {
  heading.value?.focus();
}
function go(i: number) {
  if (i < 0 || i >= questions.value.length) return;
  index.value = i;
  void nextTick(focusHeading);
}

function setAnswer(value: AnswerValue | null, opts?: { debounce?: boolean }) {
  const q = current.value;
  if (!q || phase.value !== "sitting") return;
  const { value: _old, ...rest } = responses.value[q.questionId] ?? {
    flagged: false,
    updatedAt: 0,
  };
  responses.value = {
    ...responses.value,
    [q.questionId]: { ...rest, updatedAt: Date.now(), ...(value ? { value } : {}) },
  };
  saver.set(q.questionId, value, opts);
}

// ---------------------------------------------------------------- submit

const confirmOpen = ref(false);
const submitError = ref("");

async function submit() {
  if (!args || phase.value !== "sitting") return;
  submitError.value = "";
  phase.value = "submitting";
  const left = await saver.flush();
  if (left > 0) {
    phase.value = "sitting";
    submitError.value = `${left === 1 ? "1 answer isn't" : `${left} answers aren't`} saved yet. Check your connection and try again.`;
    return;
  }
  try {
    await $convex.mutation(api.attempts.submit, args);
  } catch (err) {
    if (errorCodeOf(err) !== "ATTEMPT_CLOSED") {
      phase.value = "sitting";
      submitError.value = "Couldn't submit. Check your connection and try again.";
      return;
    }
  }
  confirmOpen.value = false;
  await showResult();
}
</script>

<template>
  <div class="flex min-w-0 flex-col gap-4">
    <div class="flex flex-wrap items-center gap-2">
      <NuxtLink
        :to="editorPath"
        class="inline-flex items-center gap-1.5 text-sm font-semibold text-muted-fg hover:text-fg"
      >
        <UIcon name="i-lucide-arrow-left" class="size-4" />
        Back to the editor
      </NuxtLink>
      <span class="flex-1" />
      <span
        class="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-[7px] text-[13px] font-bold text-brand-ink"
      >
        <UIcon name="i-lucide-eye" class="size-3.5" />
        Preview
        <template v-if="paper"> · {{ previewModeLabel(paper.mode) }}</template>
      </span>
    </div>

    <!-- No token in this tab -->
    <div
      v-if="phase === 'missing' || phase === 'error'"
      role="alert"
      class="flex flex-col gap-3 rounded-[28px] bg-surface p-6"
    >
      <h1 class="m-0 text-xl font-extrabold">
        {{ phase === "missing" ? "This preview isn't open in this tab" : "Preview unavailable" }}
      </h1>
      <p class="m-0 text-[15px] text-muted-fg">
        {{
          phase === "missing"
            ? "A preview can only be sat in the browser tab that started it. Start a new preview from the editor."
            : loadMessage
        }}
      </p>
      <UButton :to="editorPath" label="Back to the editor" class="self-start" />
    </div>

    <p v-else-if="phase === 'loading'" class="m-0 text-sm text-muted-fg" role="status">
      Loading the preview…
    </p>

    <!-- Result and review -->
    <template v-else-if="phase === 'done' && result && review">
      <h1
        id="preview-result-heading"
        tabindex="-1"
        class="m-0 text-xl font-extrabold tracking-[-0.01em] outline-none"
      >
        Preview result · {{ result.result.scaled }}
        {{ result.result.passed ? "Pass" : `below ${result.passScaled}` }}
      </h1>
      <p class="m-0 text-sm text-muted-fg">
        Marked against the version's current questions and keys. Students never see this attempt,
        and it isn't in any class results.
      </p>
      <ResultSummary :view="result">
        <template #actions>
          <UButton
            :to="editorPath"
            icon="i-lucide-pencil"
            label="Back to the editor"
            size="xl"
            block
            class="h-14 text-base font-bold"
          />
        </template>
      </ResultSummary>
      <ResultReviewList :items="review" by-domain />
    </template>

    <!-- Sitting -->
    <template v-else-if="paper && current">
      <div
        class="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[20px] bg-surface px-4 py-3 text-sm"
      >
        <span class="font-bold">{{ summary.answered }} of {{ summary.total }} answered</span>
        <span class="text-muted-fg" role="status">
          {{
            saveFailed
              ? "Some answers aren't saved. Retrying when you submit."
              : pending > 0
                ? "Saving…"
                : "All answers saved"
          }}
        </span>
        <span class="flex-1" />
        <span class="text-muted-fg">About {{ minutesLeft(remaining) }} left</span>
        <UButton
          icon="i-lucide-send"
          label="Submit preview"
          size="sm"
          :disabled="phase !== 'sitting'"
          @click="confirmOpen = true"
        />
      </div>

      <div
        class="grid min-w-0 gap-4"
        :class="current.kind === 'mcq' ? 'xl:grid-cols-[minmax(0,1fr)_340px]' : ''"
      >
        <section
          v-if="current.kind === 'mcq'"
          class="flex min-w-0 flex-col gap-6 rounded-[28px] bg-surface p-5 sm:px-10 sm:py-9"
          aria-labelledby="preview-q-heading"
        >
          <h1
            id="preview-q-heading"
            ref="heading"
            tabindex="-1"
            class="m-0 text-[15px] font-extrabold outline-none"
          >
            Question {{ current.displayNumber }}
            <span class="font-normal text-muted-fg">of {{ questions.length }}</span>
          </h1>
          <ExamQuestionMcq
            :key="current.questionId"
            :question="current"
            :model-value="currentOptionIds"
            :read-only="phase !== 'sitting'"
            stem-id="preview-q-stem"
            @update:model-value="(ids: string[]) => setAnswer(mcqValue(ids))"
          />
          <div class="flex flex-wrap gap-2">
            <UButton
              color="neutral"
              variant="soft"
              icon="i-lucide-arrow-left"
              label="Previous"
              :disabled="index === 0"
              @click="go(index - 1)"
            />
            <UButton
              v-if="index < questions.length - 1"
              trailing-icon="i-lucide-arrow-right"
              :label="nextLabel(questions, index)"
              @click="go(index + 1)"
            />
          </div>
        </section>

        <ExamQuestionPbq
          v-else
          :key="current.questionId"
          :question="current"
          :model-value="answerOf(current.questionId)"
          :read-only="phase !== 'sitting'"
          @update:model-value="setAnswer"
        >
          <template #heading>
            <h1
              ref="heading"
              tabindex="-1"
              class="m-0 text-xl font-extrabold tracking-[-0.01em] outline-none"
            >
              {{ current.stem }}
            </h1>
          </template>
          <template #footer>
            <div class="flex flex-wrap gap-2">
              <UButton
                color="neutral"
                variant="soft"
                icon="i-lucide-arrow-left"
                label="Previous"
                :disabled="index === 0"
                @click="go(index - 1)"
              />
              <UButton
                v-if="index < questions.length - 1"
                trailing-icon="i-lucide-arrow-right"
                :label="nextLabel(questions, index)"
                @click="go(index + 1)"
              />
            </div>
          </template>
        </ExamQuestionPbq>

        <ExamNavigator
          :cells="cells"
          :current-index="index"
          :answered="summary.answered"
          class="xl:self-start"
          @jump="go"
        />
      </div>
    </template>

    <UModal
      v-model:open="confirmOpen"
      title="Submit this preview?"
      :description="`${summary.answered} of ${summary.total} answered. It's marked exactly as a student's attempt would be.`"
      :dismissible="phase !== 'submitting'"
    >
      <template #body>
        <p
          v-if="submitError"
          role="alert"
          class="m-0 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
        >
          {{ submitError }}
        </p>
        <p v-else class="m-0 text-sm text-muted-fg">
          Unanswered questions score zero. You can't change answers after submitting.
        </p>
      </template>
      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            color="neutral"
            variant="soft"
            label="Keep answering"
            :disabled="phase === 'submitting'"
            @click="confirmOpen = false"
          />
          <UButton
            icon="i-lucide-send"
            label="Submit preview"
            :loading="phase === 'submitting'"
            @click="submit"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
