<script setup lang="ts">
// MCQ form (mockup screen 11 centre card; ED-8, ED-9): question text, Choose
// TWO, domain, options with the correct ones ticked, explanation. Saves the
// question and its key together (`editor.saveQuestion`). Save-blocking
// problems are checked first and listed in an error summary linked to the
// fields; server `VALIDATION_FAILED` paths map onto the same fields.
// Publish-time gaps (ticks, explanation) show as hints, not errors. All
// tutor text is rendered as plain text (interpolation only).
import { computed, nextTick, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useEditorAction } from "~/composables/useEditorAction";
import {
  addOption,
  cloneMcqForm,
  DOMAINS,
  emptyMcqForm,
  EXPLANATION_MAX,
  fieldDomId,
  fieldName,
  MAX_OPTIONS,
  mcqFormFromDoc,
  mcqPayload,
  mcqPublishHints,
  mcqSaveErrors,
  MIN_OPTIONS,
  OPTION_TEXT_MAX,
  parseIssues,
  removeOption,
  sameMcqForm,
  setChooseCount,
  STEM_MAX,
  toggleCorrect,
  validationIssuesOf,
  type DraftEntry,
  type FieldIssue,
  type McqField,
  type McqFormState,
} from "~/lib/editor";
import { domainLabel, type Domain } from "~/lib/resultView";

const props = defineProps<{
  versionId: Id<"examVersions">;
  /** The question being edited, or `null` for a new one. */
  entry: DraftEntry | null;
  /** The number a new question will get ("87"). */
  nextNumber: string;
  editable: boolean;
}>();

const emit = defineEmits<{
  saved: [questionId: Id<"questions">];
  remove: [];
  dirty: [dirty: boolean];
}>();

const { $convex } = useNuxtApp();
const save = useEditorAction();

const prefix = useId();
const headingId = `${prefix}-heading`;
const summaryId = `${prefix}-summary`;
const id = (field: McqField) => fieldDomId(prefix, field);
const errorId = (field: McqField) => `${id(field)}-error`;
const hintId = (field: McqField) => `${id(field)}-hint`;

function initial(): McqFormState {
  return props.entry ? mcqFormFromDoc(props.entry.question, props.entry.key) : emptyMcqForm();
}

const saved = ref<McqFormState>(initial());
const form = ref<McqFormState>(initial());
const errors = ref<FieldIssue[]>([]);
const summary = ref<HTMLElement | null>(null);

const dirty = computed(() => !sameMcqForm(form.value, saved.value));
watch(dirty, (d) => emit("dirty", d), { immediate: true });

// Live updates from the server (another tab, a reorder) while nothing is typed.
watch(
  () => props.entry,
  () => {
    if (dirty.value) return;
    saved.value = initial();
    form.value = initial();
  },
);

const hints = computed(() => mcqPublishHints(form.value));
const title = computed(() =>
  props.entry
    ? `Question ${props.entry.question.displayNumber}`
    : `Question ${props.nextNumber} · new`,
);

function errorFor(field: McqField): string | null {
  return errors.value.find((e) => e.field === field)?.message ?? null;
}
function hintFor(field: McqField): string | null {
  return hints.value.find((h) => h.field === field)?.message ?? null;
}
function describedBy(field: McqField, extra: string[] = []): string | undefined {
  const ids = [...extra];
  if (hintFor(field)) ids.push(hintId(field));
  if (errorFor(field)) ids.push(errorId(field));
  return ids.length ? ids.join(" ") : undefined;
}
const optionsDescribedBy = computed(() =>
  describedBy("correct", errorFor("options") ? [errorId("options")] : []),
);
function invalid(field: McqField) {
  return errorFor(field) ? "true" : undefined;
}

function focusField(field: McqField | null) {
  if (!field) return;
  const target =
    field === "correct" || field === "options"
      ? document.getElementById(`${id("option:0")}-correct`)
      : document.getElementById(id(field));
  target?.focus();
}

function showErrors(list: FieldIssue[]) {
  errors.value = list;
  void nextTick(() => summary.value?.focus());
}

async function submit() {
  if (!props.editable) return;
  const local = mcqSaveErrors(form.value);
  if (local.length > 0) return showErrors(local);
  errors.value = [];
  const state = form.value as McqFormState & { domain: Domain };
  const result = await save.run(
    "save",
    () =>
      $convex.mutation(api.editor.saveQuestion, {
        versionId: props.versionId,
        ...(props.entry ? { questionId: props.entry.question._id } : {}),
        ...mcqPayload(state),
      }),
    {
      success: (r) => `Question ${r.displayNumber} saved.`,
      onError: (err) => {
        const issues = validationIssuesOf(err);
        if (issues === null || issues.some((i) => i.startsWith("version:"))) return true;
        showErrors(parseIssues(issues));
        return false;
      },
    },
  );
  if (!result) return;
  saved.value = cloneMcqForm(form.value);
  emit("saved", result.questionId);
}

function discard() {
  form.value = cloneMcqForm(saved.value);
  errors.value = [];
}

function onToggle(optionId: string) {
  form.value = toggleCorrect(form.value, optionId);
}
function onRemoveOption(index: number) {
  form.value = removeOption(form.value, index);
  errors.value = [];
  void nextTick(() =>
    document
      .getElementById(id(`option:${Math.min(index, form.value.options.length - 1)}`))
      ?.focus(),
  );
}
function onAddOption() {
  form.value = addOption(form.value);
  const index = form.value.options.length - 1;
  void nextTick(() => document.getElementById(id(`option:${index}`))?.focus());
}

const fieldClass =
  "w-full rounded-[18px] bg-surface-2 px-4 py-3.5 text-[15px] leading-[1.5] text-fg placeholder:text-muted-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad disabled:opacity-100 read-only:cursor-default";

defineExpose({ focusHeading: () => document.getElementById(headingId)?.focus() });
</script>

<template>
  <form
    class="flex flex-col gap-[18px]"
    novalidate
    :aria-labelledby="headingId"
    @submit.prevent="submit"
  >
    <div class="flex flex-wrap items-center gap-2.5">
      <h2 :id="headingId" tabindex="-1" class="m-0 flex-1 text-lg font-extrabold outline-none">
        {{ title }}
      </h2>
      <UButton
        v-if="editable && entry"
        color="error"
        variant="ghost"
        size="sm"
        icon="i-lucide-trash-2"
        label="Remove"
        :aria-label="`Remove question ${entry.question.displayNumber}`"
        class="font-bold"
        @click="emit('remove')"
      />
    </div>

    <div
      v-if="errors.length > 0"
      :id="summaryId"
      ref="summary"
      tabindex="-1"
      role="alert"
      class="flex flex-col gap-2 rounded-[18px] bg-bad-soft px-4 py-3.5 text-bad outline-none"
    >
      <p class="m-0 flex items-center gap-2 text-[15px] font-extrabold">
        <UIcon name="i-lucide-circle-alert" class="size-[18px] flex-none" />
        {{
          errors.length === 1 ? "Fix 1 problem to save" : `Fix ${errors.length} problems to save`
        }}
      </p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        <li v-for="(e, i) in errors" :key="i">
          <a
            v-if="e.field"
            :href="`#${e.field === 'correct' || e.field === 'options' ? `${id('option:0')}-correct` : id(e.field)}`"
            class="font-semibold text-bad underline"
            @click.prevent="focusField(e.field)"
          >
            {{ fieldName(e.field, form) }}: {{ e.message }}
          </a>
          <span v-else class="font-semibold">{{ e.message }}</span>
        </li>
      </ul>
    </div>

    <div class="flex flex-col gap-1.5">
      <label :for="id('stem')" class="text-[13px] font-bold text-muted-fg">Question text</label>
      <textarea
        :id="id('stem')"
        v-model="form.stem"
        rows="3"
        :maxlength="STEM_MAX"
        :readonly="!editable"
        :class="[fieldClass, 'min-h-[74px] resize-y']"
        :aria-invalid="invalid('stem')"
        :aria-describedby="describedBy('stem')"
      />
      <p
        v-if="errorFor('stem')"
        :id="errorId('stem')"
        class="m-0 text-[13px] font-semibold text-bad"
      >
        {{ errorFor("stem") }}
      </p>
    </div>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div class="flex items-center gap-2.5">
        <USwitch
          :id="id('chooseCount')"
          :model-value="form.chooseCount === 2"
          :disabled="!editable"
          label="Choose TWO"
          :ui="{ label: 'text-sm font-semibold text-fg' }"
          @update:model-value="(on: boolean) => (form = setChooseCount(form, on ? 2 : 1))"
        />
      </div>
      <div class="flex items-center gap-2">
        <label :for="id('domain')" class="text-sm font-semibold text-muted-fg">Domain</label>
        <select
          :id="id('domain')"
          v-model="form.domain"
          :disabled="!editable"
          class="h-[38px] max-w-[min(100%,320px)] rounded-[12px] bg-surface-2 px-3 text-sm font-bold text-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad disabled:opacity-100"
          :aria-invalid="invalid('domain')"
          :aria-describedby="describedBy('domain')"
        >
          <option value="" disabled>Choose a domain</option>
          <option v-for="d in DOMAINS" :key="d" :value="d">{{ domainLabel(d) }}</option>
        </select>
      </div>
      <p
        v-if="errorFor('domain')"
        :id="errorId('domain')"
        class="m-0 w-full text-[13px] font-semibold text-bad"
      >
        {{ errorFor("domain") }}
      </p>
    </div>

    <fieldset class="m-0 flex flex-col gap-2 border-0 p-0" :aria-describedby="optionsDescribedBy">
      <legend class="mb-2 p-0 text-[13px] font-bold text-muted-fg">
        Options · tick the correct {{ form.chooseCount === 2 ? "two answers" : "answer" }}
      </legend>
      <div
        v-for="(option, index) in form.options"
        :key="option.id"
        class="flex flex-col gap-1 rounded-[16px] px-3 py-2.5"
        :class="form.correct.includes(option.id) ? 'bg-ok-soft' : 'bg-surface-2'"
      >
        <div class="flex items-center gap-3">
          <input
            :id="`${id(`option:${index}`)}-correct`"
            type="checkbox"
            class="size-6 flex-none cursor-pointer rounded-[8px] accent-ok disabled:cursor-default"
            :checked="form.correct.includes(option.id)"
            :disabled="!editable"
            :aria-label="`Option ${option.id} is correct`"
            :aria-invalid="invalid('correct')"
            @change="onToggle(option.id)"
          />
          <span class="w-4 flex-none font-bold" aria-hidden="true">{{ option.id }}</span>
          <label :for="id(`option:${index}`)" class="sr-only">Option {{ option.id }} text</label>
          <input
            :id="id(`option:${index}`)"
            v-model="option.text"
            type="text"
            :maxlength="OPTION_TEXT_MAX"
            :readonly="!editable"
            :placeholder="editable ? `Option ${option.id}` : ''"
            class="h-9 min-w-0 flex-1 rounded-[10px] bg-transparent px-2 text-[14.5px] text-fg placeholder:text-muted-fg focus:bg-surface aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad"
            :aria-invalid="invalid(`option:${index}`)"
            :aria-describedby="errorFor(`option:${index}`) ? errorId(`option:${index}`) : undefined"
          />
          <UButton
            v-if="editable && form.options.length > MIN_OPTIONS"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            :aria-label="`Remove option ${option.id}`"
            @click="onRemoveOption(index)"
          />
        </div>
        <p
          v-if="errorFor(`option:${index}`)"
          :id="errorId(`option:${index}`)"
          class="m-0 pl-[52px] text-[13px] font-semibold text-bad"
        >
          {{ errorFor(`option:${index}`) }}
        </p>
      </div>
      <p
        v-if="errorFor('options')"
        :id="errorId('options')"
        class="m-0 text-[13px] font-semibold text-bad"
      >
        {{ errorFor("options") }}
      </p>
      <p
        v-if="errorFor('correct')"
        :id="errorId('correct')"
        class="m-0 text-[13px] font-semibold text-bad"
      >
        {{ errorFor("correct") }}
      </p>
      <p
        v-else-if="hintFor('correct')"
        :id="hintId('correct')"
        class="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-warn"
      >
        <UIcon name="i-lucide-triangle-alert" class="size-4 flex-none" />
        {{ hintFor("correct") }}
      </p>
      <UButton
        v-if="editable && form.options.length < MAX_OPTIONS"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-plus"
        label="Add option"
        class="self-start font-bold"
        @click="onAddOption"
      />
    </fieldset>

    <div class="flex flex-col gap-1.5">
      <label :for="id('explanation')" class="text-[13px] font-bold text-muted-fg">
        Explanation (Why)
      </label>
      <textarea
        :id="id('explanation')"
        v-model="form.explanation"
        rows="3"
        :maxlength="EXPLANATION_MAX"
        :readonly="!editable"
        :placeholder="
          editable ? 'Why the correct answers are right. Students see this in review.' : ''
        "
        :class="[
          fieldClass,
          'min-h-[60px] resize-y',
          hintFor('explanation') ? 'border-2 border-dashed border-warn' : '',
        ]"
        :aria-invalid="invalid('explanation')"
        :aria-describedby="describedBy('explanation')"
      />
      <p
        v-if="errorFor('explanation')"
        :id="errorId('explanation')"
        class="m-0 text-[13px] font-semibold text-bad"
      >
        {{ errorFor("explanation") }}
      </p>
      <p
        v-else-if="hintFor('explanation')"
        :id="hintId('explanation')"
        class="m-0 flex items-center gap-1.5 text-[13px] font-semibold text-warn"
      >
        <UIcon name="i-lucide-triangle-alert" class="size-4 flex-none" />
        {{ hintFor("explanation") }}
      </p>
    </div>

    <div v-if="editable" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UButton
        v-if="dirty && entry"
        color="neutral"
        variant="soft"
        label="Discard changes"
        class="justify-center"
        :disabled="save.busy.value"
        @click="discard"
      />
      <UButton
        type="submit"
        :label="entry ? 'Save question' : 'Add question'"
        icon="i-lucide-check"
        class="justify-center"
        :loading="save.busy.value"
        :disabled="!!entry && !dirty"
      />
    </div>
  </form>
</template>
