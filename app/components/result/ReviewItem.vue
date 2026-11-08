<script setup lang="ts">
// One reviewed question, after mockup screen 07 (EX-17, PB-2): your answer,
// the correct answer, marks and the "Why". Read-only. All content is rendered
// as text (SE-6); `backticks` become inline code. A PBQ is shown with its
// own exam component (artefact panel, read-only answers, ✓ / ✗ per part with
// the correct answer, T-309); stacked part cards are the fallback.
import { hasArtefactReview } from "~/lib/pbq/review";
import { partRows, pickedOptionIds, type ReviewEntry } from "~/lib/resultView";

const props = defineProps<{ item: ReviewEntry }>();

type OptionRow = { id: string; text: string; mine: boolean; correct: boolean };
const options = computed<OptionRow[]>(() => {
  const item = props.item;
  if (item.kind !== "mcq") return [];
  const mine = new Set(pickedOptionIds(item.yourAnswer));
  const correct = new Set(pickedOptionIds(item.correctAnswer));
  return item.options.map((o) => ({
    id: o.id,
    text: o.text,
    mine: mine.has(o.id),
    correct: correct.has(o.id),
  }));
});
const unanswered = computed(
  () => props.item.kind === "mcq" && pickedOptionIds(props.item.yourAnswer).length === 0,
);

const artefactView = computed(
  () => props.item.kind === "pbq" && hasArtefactReview(props.item.payload.template),
);
const parts = computed(() => (props.item.kind === "pbq" ? partRows(props.item) : []));
const isFirewall = computed(
  () => props.item.kind === "pbq" && props.item.payload.template === "firewall",
);

/** The scenario text a PBQ was answered from (log, scan, hashes, listings, diagram). */
const scenario = computed<string[]>(() => {
  const item = props.item;
  if (item.kind !== "pbq") return [];
  const p = item.payload;
  switch (p.template) {
    case "sshLog":
      return [p.log];
    case "nmap":
      return [p.scan];
    case "hashCheck":
      return [p.vendorHashes, p.computed];
    case "permissions":
      return [p.listings, p.sshdConfig];
    case "firewall":
      return [p.requirements.map((r) => `• ${r}`).join("\n"), p.diagram];
  }
  return [];
});

function optionLabel(o: OptionRow): string | null {
  if (o.mine && o.correct) return "Your answer · Correct";
  if (o.mine) return "Your answer · Wrong";
  if (o.correct) return "Correct answer";
  return null;
}
</script>

<template>
  <!-- PBQ: the exam's own component, read-only, with marks per part or rule (T-309) -->
  <article
    v-if="artefactView"
    class="flex min-w-0 flex-col gap-3 rounded-[34px] border-2 border-line p-2 sm:gap-4 sm:p-3"
  >
    <ResultReviewHeader :item="item" class="px-3 pt-2 sm:px-4" />
    <ResultPbqReview v-if="item.kind === 'pbq'" :item="item">
      <template #heading>
        <p class="m-0 text-xl leading-snug font-extrabold tracking-[-0.01em] text-pretty">
          <LabInlineCode :text="item.stem" />
        </p>
      </template>
      <template #footer>
        <ResultReviewWhy :text="item.explanation" />
      </template>
    </ResultPbqReview>
  </article>

  <article
    v-else
    class="flex min-w-0 flex-col gap-5 rounded-[28px] bg-surface px-5 py-6 sm:px-10 sm:py-[34px]"
  >
    <ResultReviewHeader :item="item" />

    <p class="m-0 max-w-[760px] text-lg leading-[1.45] font-semibold text-pretty sm:text-[21px]">
      <LabInlineCode :text="item.stem" />
    </p>

    <!-- MCQ options -->
    <ul v-if="item.kind === 'mcq'" class="m-0 flex max-w-[760px] list-none flex-col gap-2.5 p-0">
      <li
        v-for="o in options"
        :key="o.id"
        class="flex items-center gap-3.5 rounded-[18px] px-4 py-3.5 sm:px-[18px]"
        :class="
          o.mine && o.correct
            ? 'bg-ok-soft'
            : o.mine
              ? 'bg-bad-soft'
              : o.correct
                ? 'border-2 border-dashed border-ok'
                : 'bg-surface-2'
        "
      >
        <span
          class="grid size-[30px] flex-none place-items-center rounded-[10px] text-sm font-bold"
          :class="
            o.mine && o.correct
              ? 'bg-ok text-white'
              : o.mine
                ? 'bg-bad text-white'
                : o.correct
                  ? 'bg-ok-soft text-ok'
                  : 'bg-surface text-muted-fg'
          "
        >
          {{ o.id }}
        </span>
        <span class="flex min-w-0 flex-1 flex-col gap-0.5 sm:flex-row sm:items-center sm:gap-3">
          <span
            class="min-w-0 flex-1 text-base"
            :class="{ 'text-muted-fg': !o.mine && !o.correct }"
          >
            <LabInlineCode :text="o.text" />
          </span>
          <span
            v-if="optionLabel(o)"
            class="flex-none text-xs font-bold sm:text-right"
            :class="o.mine && !o.correct ? 'text-bad' : 'text-ok'"
          >
            {{ optionLabel(o) }}
          </span>
        </span>
      </li>
      <li v-if="unanswered" class="text-sm font-semibold text-muted-fg">Not answered</li>
    </ul>

    <!-- PBQ fallback (a template without a component): scenario, then one row per part or rule -->
    <template v-else>
      <p class="m-0 max-w-[760px] text-[15px] leading-[1.6] text-muted-fg">
        <LabInlineCode :text="item.payload.intro" />
      </p>
      <details class="group max-w-[760px]">
        <summary
          class="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-brand-ink"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4 transition-transform group-open:rotate-90"
          />
          Show the scenario
        </summary>
        <pre
          v-for="(block, i) in scenario"
          :key="i"
          class="mt-3 mb-0 max-h-80 overflow-auto rounded-xl bg-code px-5 py-4 font-mono text-[13px] leading-[1.7] text-code-fg"
        ><code>{{ block }}</code></pre>
      </details>

      <ul class="m-0 flex max-w-[760px] list-none flex-col gap-2.5 p-0">
        <li
          v-for="p in parts"
          :key="p.id"
          class="flex min-w-0 flex-col gap-2.5 rounded-[18px] px-4 py-3.5 sm:px-[18px]"
          :class="p.ok === null ? 'bg-surface-2' : p.ok ? 'bg-ok-soft' : 'bg-bad-soft'"
        >
          <div class="flex items-start gap-3">
            <span
              class="grid h-[30px] min-w-[30px] flex-none place-items-center rounded-[10px] px-1.5 text-sm font-bold"
              :class="
                p.ok === null
                  ? 'bg-surface text-muted-fg'
                  : p.ok
                    ? 'bg-ok text-white'
                    : 'bg-bad text-white'
              "
            >
              {{ p.id }}
            </span>
            <span class="min-w-0 flex-1 pt-1 text-[15px]">
              <span v-if="isFirewall" class="font-semibold">Rule {{ p.id }}: </span>
              <LabInlineCode :text="p.prompt" />
            </span>
            <span
              class="flex-none pt-1.5 text-xs font-bold"
              :class="p.ok === null ? 'text-muted-fg' : p.ok ? 'text-ok' : 'text-bad'"
            >
              {{ p.ok === null ? "Practice · not scored" : p.ok ? "Correct" : "Wrong" }}
            </span>
          </div>
          <dl class="m-0 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt class="text-muted-fg">Your answer</dt>
            <dd class="m-0 min-w-0 font-mono text-[13px] break-words">{{ p.yours }}</dd>
            <dt class="text-muted-fg">{{ p.ok === null ? "Model answer" : "Correct answer" }}</dt>
            <dd class="m-0 min-w-0 font-mono text-[13px] break-words">{{ p.correct }}</dd>
          </dl>
        </li>
      </ul>
    </template>

    <ResultReviewWhy :text="item.explanation" />
  </article>
</template>
