<script setup lang="ts">
// Picks the component for a PBQ's template (LLD §14.4).
//
// Contract for every PBQ component (T-302 to T-306 replace the generic
// fallback one template at a time by changing an entry in COMPONENTS):
//
//   props:  question   AttemptPaperPbq (payload narrowed by `template`)
//           modelValue AnswerValue | undefined   the saved answer
//           readOnly   boolean                   attempt closed: show, don't edit
//   emits:  update:modelValue (value: AnswerValue | null, opts?: { debounce?: boolean })
//           `null` when every blank is empty; `{ debounce: true }` for typing
//           (useAttempt waits 400 ms), none for clicks and selects.
//           Values: { kind: "pbq", parts } (portPair parts are [cleartext, secure]),
//           or { kind: "firewall", rules } with one { port, action } per payload rule.
//   slots:  heading  the question title (the runner focuses it on arrival);
//                    render it first in the answer panel
//           footer   Previous / Flag / Next; render it last in the answer panel
//
// Render all payload text as text (SE-6); `ExamInlineText` handles `code` and **bold**.
import type { Component } from "vue";
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, PbqTemplate } from "~~/shared/content";
import PbqGeneric from "~/components/pbq/PbqGeneric.vue";
import PbqSshLog from "~/components/pbq/PbqSshLog.vue";
import PbqNmap from "~/components/pbq/PbqNmap.vue";
import PbqFirewall from "~/components/pbq/PbqFirewall.vue";
import PbqHashCheck from "~/components/pbq/PbqHashCheck.vue";
import PbqPermissions from "~/components/pbq/PbqPermissions.vue";

defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();

const COMPONENTS: Record<PbqTemplate, Component> = {
  sshLog: PbqSshLog, // T-302
  nmap: PbqNmap, // T-303
  hashCheck: PbqHashCheck, // T-304
  permissions: PbqPermissions, // T-305
  firewall: PbqFirewall, // T-306
};

function onUpdate(value: AnswerValue | null, opts?: { debounce?: boolean }) {
  emit("update:modelValue", value, opts);
}
</script>

<template>
  <component
    :is="COMPONENTS[question.payload.template] ?? PbqGeneric"
    :question="question"
    :model-value="modelValue"
    :read-only="readOnly"
    @update:model-value="onUpdate"
  >
    <template #heading><slot name="heading" /></template>
    <template #footer><slot name="footer" /></template>
  </component>
</template>
