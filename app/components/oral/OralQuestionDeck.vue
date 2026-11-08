<script setup lang="ts">
// One oral question at a time, model answer on click (PRD CL-10). The page
// keys this component by version, because `useStaffQuery` subscribes once
// with fixed arguments. Keys: ← / → move, "a" shows or hides the answer.
import type { Id } from "~~/convex/_generated/dataModel";
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { oralErrorMessage, oralKeyAction, stepIndex } from "~/lib/oral";

const props = defineProps<{ versionId?: Id<"examVersions"> }>();

const { data, error, loading } = useStaffQuery(
  api.content.oralQuestions,
  props.versionId ? { versionId: props.versionId } : {},
);

const index = ref(0);
const revealed = ref(false);
const answerId = useId();

const questions = computed(() => data.value?.questions ?? []);
const total = computed(() => questions.value.length);
const current = computed(() => questions.value[index.value] ?? null);

// A live update may drop questions; keep the position valid.
watch(total, (n) => (index.value = stepIndex(index.value, 0, n)));

function go(to: number) {
  const next = stepIndex(to, 0, total.value);
  if (next === index.value) return;
  index.value = next;
  revealed.value = false;
}

function onKey(e: KeyboardEvent) {
  if (!current.value) return;
  const action = oralKeyAction(e);
  if (!action) return;
  e.preventDefault();
  if (action === "prev") go(index.value - 1);
  else if (action === "next") go(index.value + 1);
  else revealed.value = !revealed.value;
}

onMounted(() => window.addEventListener("keydown", onKey));
onBeforeUnmount(() => window.removeEventListener("keydown", onKey));
</script>

<template>
  <section
    class="flex flex-col gap-5 rounded-[28px] bg-surface px-[22px] py-5 sm:px-7 sm:py-6"
    aria-label="Oral questions"
  >
    <p v-if="loading" class="m-0 text-sm text-muted-fg">Loading oral questions…</p>
    <p v-else-if="error" class="m-0 text-sm font-semibold text-bad" role="alert">
      {{ oralErrorMessage(error) }}
    </p>
    <p v-else-if="data === null" class="m-0 text-sm text-muted-fg">
      No default exam has been imported yet, so there are no oral questions to show.
    </p>
    <p v-else-if="!current" class="m-0 text-sm text-muted-fg">
      This version has no oral questions.
    </p>

    <template v-else>
      <div class="flex flex-wrap items-center gap-3">
        <h2 class="m-0 flex-1 text-sm font-bold tracking-[0.04em] text-muted-fg uppercase">
          Question {{ index + 1 }} of {{ total }}
        </h2>
        <span class="sr-only" aria-live="polite">Question {{ index + 1 }} of {{ total }}</span>
        <ol class="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Jump to question">
          <li v-for="(q, i) in questions" :key="q.order">
            <button
              type="button"
              class="grid size-8 place-items-center rounded-full text-[13px] font-bold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              :class="
                i === index ? 'bg-brand text-white' : 'bg-surface-2 text-muted-fg hover:text-fg'
              "
              :aria-current="i === index ? 'step' : undefined"
              :aria-label="`Question ${i + 1}`"
              @click="go(i)"
            >
              {{ i + 1 }}
            </button>
          </li>
        </ol>
      </div>

      <p
        class="m-0 text-[22px] leading-[1.4] font-extrabold tracking-[-0.02em] break-words sm:text-[26px]"
      >
        {{ current.question }}
      </p>

      <div class="flex flex-col gap-3">
        <button
          type="button"
          class="flex h-12 items-center gap-2 self-start rounded-full bg-brand-soft px-5 text-[15px] font-bold text-brand-ink transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          :aria-expanded="revealed"
          :aria-controls="answerId"
          @click="revealed = !revealed"
        >
          <UIcon :name="revealed ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-[18px]" />
          {{ revealed ? "Hide model answer" : "Reveal model answer" }}
        </button>
        <div
          v-show="revealed"
          :id="answerId"
          class="rounded-[20px] border border-line bg-canvas px-5 py-4"
        >
          <p class="m-0 mb-1.5 text-xs font-bold tracking-[0.04em] text-brand-ink uppercase">
            Model answer
          </p>
          <p class="m-0 text-[16px] leading-[1.6] break-words whitespace-pre-line">
            {{ current.modelAnswer }}
          </p>
        </div>
      </div>

      <div class="flex flex-wrap items-center gap-2 sm:gap-2.5">
        <button
          type="button"
          :disabled="index === 0"
          class="flex h-12 items-center gap-2 rounded-full bg-surface-2 px-4 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 sm:px-5"
          @click="go(index - 1)"
        >
          <UIcon name="i-lucide-arrow-left" class="size-[18px]" />
          Previous
        </button>
        <p class="m-0 hidden flex-1 text-center text-xs text-muted-fg md:block">
          <kbd class="font-mono">←</kbd> <kbd class="font-mono">→</kbd> to move ·
          <kbd class="font-mono">A</kbd> to show the answer
        </p>
        <button
          type="button"
          :disabled="index === total - 1"
          class="ml-auto flex h-12 items-center gap-2 rounded-full bg-brand px-5 text-[15px] font-bold whitespace-nowrap text-white hover:bg-salus-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-50 sm:px-6"
          @click="go(index + 1)"
        >
          Next
          <UIcon name="i-lucide-arrow-right" class="size-[18px]" />
        </button>
      </div>
    </template>
  </section>
</template>
