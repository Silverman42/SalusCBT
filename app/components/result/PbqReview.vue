<script setup lang="ts">
// A PBQ in answer review (T-309, EX-17, PB-2, PB-3): the exam's own PBQ
// component, read-only, with the student's answer filled in and a mark
// (`ResultPbqMark`) under each part or in each firewall rule's Result cell.
// Used by `ResultReviewItem` on the student review, share and tutor pages.
//
// Slots `heading` and `footer` pass through to the PBQ component (first and
// last in its answer panel), as in the runner.
import type { Component } from "vue";
import type { PbqPart, PbqTemplate } from "~~/shared/content";
import type { ReviewEntry } from "~/lib/resultView";
import { partMarks, ruleMarks } from "~/lib/pbq/review";
import PbqSshLog from "~/components/pbq/PbqSshLog.vue";
import PbqNmap from "~/components/pbq/PbqNmap.vue";
import PbqHashCheck from "~/components/pbq/PbqHashCheck.vue";
import PbqPermissions from "~/components/pbq/PbqPermissions.vue";
import PbqFirewall from "~/components/pbq/PbqFirewall.vue";

type PbqEntry = Extract<ReviewEntry, { kind: "pbq" }>;

const props = defineProps<{ item: PbqEntry }>();

/** Same map as components/exam/QuestionPbq.vue; templates outside it use the stacked cards. */
const COMPONENTS: Record<PbqTemplate, Component> = {
  sshLog: PbqSshLog,
  nmap: PbqNmap,
  hashCheck: PbqHashCheck,
  permissions: PbqPermissions,
  firewall: PbqFirewall,
};

const component = computed(() => COMPONENTS[props.item.payload.template]);
const isFirewall = computed(() => props.item.payload.template === "firewall");
const marks = computed(() => partMarks(props.item));
const rules = computed(() => ruleMarks(props.item));
const modelValue = computed(() => props.item.yourAnswer ?? undefined);
const markOf = (part: PbqPart) => marks.value.get(part.id);
</script>

<template>
  <component :is="component" :question="item" :model-value="modelValue" :read-only="true">
    <template #heading><slot name="heading" /></template>
    <template v-if="!isFirewall" #part-mark="{ part }: { part: PbqPart }">
      <ResultPbqMark v-if="markOf(part)" :mark="markOf(part)!" :prose="part.kind === 'mcq'" />
    </template>
    <template v-if="isFirewall" #rule-mark="{ index }: { index: number }">
      <ResultPbqMark v-if="rules[index]" :mark="rules[index]!" compact />
    </template>
    <template #footer><slot name="footer" /></template>
  </component>
</template>
