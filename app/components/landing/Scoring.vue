<script setup lang="ts">
// "How scoring works" (the header links to /#scoring). Numbers follow LLD §8.2.
import { EXAM_FACTS } from "~/lib/start";

const facts = [
  {
    value: `${EXAM_FACTS.points}`,
    label: "points",
    body: `${EXAM_FACTS.mcqs} multiple-choice questions at 1 point each, plus ${EXAM_FACTS.points - EXAM_FACTS.mcqs} points across the ${EXAM_FACTS.pbqs} performance-based questions (1 point per part).`,
  },
  {
    value: "100–900",
    label: "scale",
    body: `Points are scaled to 100–900. ${EXAM_FACTS.passScaled} is the pass mark, which is ${EXAM_FACTS.passPoints} of ${EXAM_FACTS.points} points.`,
  },
  {
    value: "5",
    label: "domains",
    body: "Your result breaks the score down by exam domain, then the review shows every answer with an explanation.",
  },
];
</script>

<template>
  <section id="scoring" aria-labelledby="scoring-heading" class="scroll-mt-6 px-4 pb-12 sm:px-12">
    <div class="flex flex-col gap-5 rounded-[28px] bg-surface p-5 sm:p-8">
      <div class="flex flex-col gap-2">
        <h2 id="scoring-heading" class="m-0 text-2xl font-extrabold tracking-[-0.03em]">
          How scoring works
        </h2>
        <p class="m-0 max-w-[640px] text-[15px] leading-[1.55] text-pretty text-muted-fg">
          Everything is marked on the server the moment you submit. 'Choose TWO' questions score
          only if both answers are right. This is independent practice material, not an official
          exam, so treat the score as a guide.
        </p>
      </div>
      <ul class="m-0 grid list-none gap-3 p-0 md:grid-cols-3">
        <li
          v-for="fact in facts"
          :key="fact.label"
          class="flex flex-col gap-1.5 rounded-[20px] bg-surface-2 p-5"
        >
          <p class="m-0 flex items-baseline gap-2">
            <span class="text-[28px] font-extrabold tracking-[-0.03em]">{{ fact.value }}</span>
            <span class="text-sm font-semibold text-muted-fg">{{ fact.label }}</span>
          </p>
          <p class="m-0 text-sm leading-[1.55] text-pretty text-muted-fg">{{ fact.body }}</p>
        </li>
      </ul>
    </div>
  </section>
</template>
