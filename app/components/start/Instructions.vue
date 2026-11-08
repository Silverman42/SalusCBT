<script setup lang="ts">
// Instructions shown before the timer starts (EX-2). Rewritten from the
// content file's "Instructions for the candidate" for the app: the timer is
// built in and answers save automatically, so there is no proctor, phone or
// answer sheet. `minutes` is a prop so a class time multiplier (EX-21) can
// be shown once the class lookup returns it.
import { EXAM_FACTS } from "~/lib/start";

const props = withDefaults(defineProps<{ minutes?: number }>(), {
  minutes: EXAM_FACTS.minutes,
});

const items = computed(() => [
  {
    icon: "i-lucide-timer",
    title: `${props.minutes} minutes, starting when you press Start`,
    body: "The countdown is always on screen. Time calls appear at 45, 15 and 5 minutes left. At 0:00 the exam is submitted for you and unanswered questions score zero.",
  },
  {
    icon: "i-lucide-list-ordered",
    title: `${EXAM_FACTS.pbqs} performance-based questions first, then ${EXAM_FACTS.mcqs} multiple-choice`,
    body: "One question per screen. You can skip, come back, and flag any question for review. The navigator shows what's answered and flagged.",
  },
  {
    icon: "i-lucide-gauge",
    title: "Pacing alerts",
    body: "If you fall behind (PBQs untouched at 25 minutes, before Q35 at 45 minutes, before Q60 at 65 minutes), a banner tells you to move on. At 80 minutes you're told to use the rest on flagged questions.",
  },
  {
    icon: "i-lucide-target",
    title: `${EXAM_FACTS.points} points, ${EXAM_FACTS.passScaled} to pass`,
    body: `Every question and every PBQ part is worth 1 point. 'Choose TWO' questions score only if both answers are right. Your score is on a 100–900 scale; ${EXAM_FACTS.passPoints} points or more is a pass.`,
  },
  {
    icon: "i-lucide-cloud-check",
    title: "Answers save as you go",
    body: "If you refresh or lose your connection, carry on in the same browser: your answers and the timer pick up where you left off.",
  },
  {
    icon: "i-lucide-lock",
    title: "Submitting is final",
    body: "You'll see a summary of unanswered and flagged questions before you confirm. After you submit you can't change answers; you get your score, then a full review with explanations.",
  },
  {
    icon: "i-lucide-book-x",
    title: "Treat it like the real thing",
    body: "Work alone, with no notes and no searching, so your score tells you something.",
  },
]);
</script>

<template>
  <ul class="m-0 grid list-none gap-3 p-0">
    <li
      v-for="item in items"
      :key="item.icon"
      class="flex gap-4 rounded-[20px] bg-surface px-4 py-4 sm:px-5"
    >
      <span
        class="grid size-10 flex-none place-items-center rounded-[14px] bg-brand-soft text-brand-ink"
        aria-hidden="true"
      >
        <UIcon :name="item.icon" class="size-5" />
      </span>
      <div class="flex min-w-0 flex-col gap-1">
        <h3 class="m-0 text-base font-bold">{{ item.title }}</h3>
        <p class="m-0 text-[15px] leading-[1.55] text-pretty text-muted-fg">{{ item.body }}</p>
      </div>
    </li>
  </ul>
</template>
