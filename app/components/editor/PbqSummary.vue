<script setup lang="ts">
// A PBQ in the editor, read-only for now: template, domain, points and the
// question text. The template forms ("Edit values", "Generate new values")
// plug in here (T-608); until then PBQs can be reordered but not edited.
import { computed } from "vue";
import { SECTION_LABEL, TEMPLATE_LABEL, type DraftEntry } from "~/lib/editor";
import { domainLabel } from "~/lib/resultView";

const props = defineProps<{ entry: DraftEntry; editable: boolean }>();
const q = computed(() => props.entry.question);

defineExpose({ focusHeading: () => document.getElementById("pbq-summary-heading")?.focus() });
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <h2 id="pbq-summary-heading" tabindex="-1" class="m-0 text-lg font-extrabold outline-none">
      Question {{ q.displayNumber }} · {{ q.template ? TEMPLATE_LABEL[q.template] : "PBQ" }}
    </h2>
    <dl class="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
      <dt class="font-semibold text-muted-fg">Set</dt>
      <dd class="m-0 font-bold">{{ SECTION_LABEL[q.section] }}</dd>
      <dt class="font-semibold text-muted-fg">Domain</dt>
      <dd class="m-0 font-bold">{{ domainLabel(q.domain) }}</dd>
      <dt class="font-semibold text-muted-fg">Points</dt>
      <dd class="m-0 font-bold">{{ q.points }}</dd>
    </dl>
    <div class="flex flex-col gap-1.5">
      <span class="text-[13px] font-bold text-muted-fg">Question text</span>
      <!-- v-text: plain text, and no template whitespace inside pre-wrap -->
      <p
        class="m-0 rounded-[18px] bg-surface-2 px-4 py-3.5 text-[15px] leading-[1.5] whitespace-pre-wrap"
        v-text="q.stem"
      />
    </div>
    <p
      v-if="editable"
      class="m-0 flex gap-2 rounded-2xl bg-surface-2 px-4 py-3 text-sm text-muted-fg"
    >
      <UIcon name="i-lucide-info" class="mt-0.5 size-4 flex-none" />
      <span>Editing PBQ values isn't available yet. You can reorder PBQs within their set.</span>
    </p>
  </div>
</template>
