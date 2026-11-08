<script setup lang="ts">
// Validation card (mockup screen 11, "3 issues before publishing"): the live
// `editor.validate` list, errors then warnings, each question issue a button
// that jumps to the question (ED-9).
import { computed } from "vue";
import { issueHeading, issueLabel, type Issue } from "~/lib/editor";

const props = defineProps<{ issues: Issue[] | undefined; failed: boolean }>();
const emit = defineEmits<{ jump: [questionId: string] }>();

const errors = computed(() => (props.issues ?? []).filter((i) => i.severity === "error"));
const warnings = computed(() => (props.issues ?? []).filter((i) => i.severity === "warning"));
const tone = computed(() =>
  errors.value.length > 0
    ? "bg-warn-soft text-warn"
    : warnings.value.length > 0
      ? "bg-surface text-fg"
      : "bg-ok-soft text-ok",
);
</script>

<template>
  <section
    class="flex flex-col gap-3 rounded-[28px] px-[22px] py-5"
    :class="issues ? tone : 'bg-surface text-fg'"
    aria-labelledby="issues-heading"
  >
    <h2 id="issues-heading" class="m-0 flex items-center gap-2 text-base font-extrabold">
      <UIcon
        :name="errors.length > 0 ? 'i-lucide-triangle-alert' : 'i-lucide-circle-check'"
        class="size-[18px] flex-none"
      />
      <template v-if="failed">Couldn't check this version</template>
      <template v-else-if="!issues">Checking…</template>
      <template v-else>{{ issueHeading(issues) }}</template>
    </h2>
    <template v-for="group in [errors, warnings]" :key="group === errors ? 'e' : 'w'">
      <div v-if="group.length > 0" class="flex flex-col gap-1">
        <h3 class="m-0 text-xs font-bold tracking-[0.06em] text-muted-fg uppercase">
          {{ group === errors ? "Errors · block publishing" : "Warnings" }}
        </h3>
        <ul class="m-0 flex list-none flex-col gap-1 p-0">
          <li v-for="(issue, i) in group" :key="i" class="text-[13.5px] leading-[1.45] text-fg">
            <button
              v-if="issue.questionId"
              type="button"
              class="text-left underline decoration-line underline-offset-2 hover:decoration-current"
              @click="emit('jump', issue.questionId)"
            >
              {{ issueLabel(issue) }}
            </button>
            <span v-else>{{ issueLabel(issue) }}</span>
          </li>
        </ul>
      </div>
    </template>
  </section>
</template>
