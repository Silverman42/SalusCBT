<script setup lang="ts">
// PBQ template form (T-608; PRD "Tutor question editor" table; ED-1, ED-2;
// mockup screen 11 centre card): question text, domain and set, the
// scenario and the template's artefacts (log, scan, hashes, listings and
// config, diagram), the parts with their answers (or the firewall rules
// with the correct port and action), and the explanation. Saves payload and
// key together (`editor.saveQuestion`). Save checks run live (the same
// `shared/validate` rules the server runs); server issue paths map onto the
// same fields. "Generate new values" (`editor.generate`, optional seed)
// replaces the values with the server's and refills the form. "Student
// view" renders the current payload with the student PBQ components. All
// tutor text is rendered as plain text (interpolation only).
import { computed, nextTick, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import type { AnswerValue, PbqTemplate } from "~~/shared/content";
import { useEditorAction } from "~/composables/useEditorAction";
import {
  DOMAINS,
  EXPLANATION_MAX,
  SECTION_LABEL,
  STEM_MAX,
  TEMPLATE_LABEL,
  validationIssuesOf,
  type DraftEntry,
  type Issue,
} from "~/lib/editor";
import {
  addPart,
  ARTEFACTS,
  clonePbqForm,
  describedByOf,
  issueOf,
  MAX_PARTS,
  PART_KINDS,
  parsePbqIssues,
  pbqDomId,
  pbqFieldName,
  pbqFormFromDoc,
  pbqFormPoints,
  pbqPreviewQuestion,
  pbqPublishHints,
  pbqSaveArgs,
  pbqSaveErrors,
  removePart,
  samePbqForm,
  type PartForm,
  type PbqField,
  type PbqFieldIssue,
  type PbqFormState,
} from "~/lib/editorPbq";
import { domainLabel, type Domain } from "~/lib/resultView";

const props = defineProps<{
  versionId: Id<"examVersions">;
  entry: DraftEntry;
  editable: boolean;
  /** `editor.validate` issues for this question (publish checks, e.g. ED-2 recompute). */
  issues: Issue[];
}>();

const emit = defineEmits<{
  saved: [questionId: Id<"questions">];
  remove: [];
  dirty: [dirty: boolean];
}>();

const { $convex } = useNuxtApp();
const save = useEditorAction();
const generator = useEditorAction();

const prefix = useId();
const headingId = `${prefix}-heading`;
const summaryId = `${prefix}-summary`;
const id = (field: PbqField) => pbqDomId(prefix, field);

function initial(): PbqFormState {
  return pbqFormFromDoc(props.entry.question, props.entry.key);
}

const saved = ref<PbqFormState>(initial());
const form = ref<PbqFormState>(initial());
const submitted = ref(false);
const serverErrors = ref<PbqFieldIssue[]>([]);
const summary = ref<HTMLElement | null>(null);

const dirty = computed(() => !samePbqForm(form.value, saved.value));
watch(dirty, (d) => emit("dirty", d), { immediate: true });

// Live updates from the server (another tab, a reorder, a generate) while nothing is typed.
watch(
  () => props.entry,
  () => {
    if (dirty.value) return;
    saved.value = initial();
    form.value = initial();
  },
);
// Any edit makes the last server answer stale.
watch(form, () => (serverErrors.value = []), { deep: true });

const live = computed(() => pbqSaveErrors(form.value));
/** Inline: live checks, plus whatever the server said about the last save. */
const errors = computed(() => [
  ...live.value,
  ...serverErrors.value.filter((s) => !live.value.some((l) => l.field === s.field)),
]);
const hints = computed(() => pbqPublishHints(form.value));
const points = computed(() => pbqFormPoints(form.value));
const template = computed<PbqTemplate>(() => form.value.template);
const kinds = computed(() => (template.value === "firewall" ? [] : PART_KINDS[template.value]));
// Shape and explanation issues already show on the fields; the rest (ED-2
// recompute, missing keys on the saved row) only the server can tell.
const publishIssues = computed(() =>
  props.issues.filter((i) => i.rule !== "shape" && i.rule !== "explanation"),
);

const err = (field: PbqField) => issueOf(errors.value, field);
const hint = (field: PbqField) => issueOf(hints.value, field);
const desc = (field: PbqField) => describedByOf(prefix, field, errors.value, hints.value);
const invalid = (field: PbqField) => (err(field) ? "true" : undefined);

// ------------------------------------------------------------- focus

/** The element to focus for a field (some fields are groups). */
function targetFor(field: PbqField): HTMLElement | null {
  const direct = document.getElementById(id(field));
  if (direct) return direct;
  const answer = /^part:(\d+):(answer|options)$/.exec(field);
  if (answer) return document.getElementById(`${id(`part:${Number(answer[1])}:option:0`)}-correct`);
  if (field === "parts") return document.getElementById(id("part:0:id"));
  if (field === "rules") return document.getElementById(id("rule:0:source"));
  return null;
}
function focusField(field: PbqField | null) {
  if (field) targetFor(field)?.focus();
}

// ------------------------------------------------------------- saving

async function submit() {
  if (!props.editable) return;
  submitted.value = true;
  if (live.value.length > 0) {
    void nextTick(() => summary.value?.focus());
    return;
  }
  const state = form.value as PbqFormState & { domain: Domain };
  const result = await save.run(
    "save",
    () =>
      $convex.mutation(api.editor.saveQuestion, {
        versionId: props.versionId,
        questionId: props.entry.question._id,
        ...pbqSaveArgs(state),
      }),
    {
      success: (r) => `Question ${r.displayNumber} saved.`,
      onError: (e) => {
        const issues = validationIssuesOf(e);
        if (issues === null || issues.some((i) => i.startsWith("version:"))) return true;
        serverErrors.value = parsePbqIssues(issues, form.value);
        void nextTick(() => summary.value?.focus());
        return false;
      },
    },
  );
  if (!result) return;
  submitted.value = false;
  saved.value = clonePbqForm(form.value);
  emit("saved", result.questionId);
}

function discard() {
  form.value = clonePbqForm(saved.value);
  submitted.value = false;
}

const summaryList = computed(() => (submitted.value ? errors.value : serverErrors.value));

// ------------------------------------------------------------- parts

function setPart(index: number, part: PartForm) {
  form.value = { ...form.value, parts: form.value.parts.map((p, i) => (i === index ? part : p)) };
}
function onAddPart() {
  form.value = addPart(form.value);
  const index = form.value.parts.length - 1;
  void nextTick(() => document.getElementById(id(`part:${index}:prompt`))?.focus());
}
function onRemovePart(index: number) {
  form.value = removePart(form.value, index);
  const next = Math.min(index, form.value.parts.length - 1);
  void nextTick(() => document.getElementById(id(`part:${next}:id`))?.focus());
}

// ------------------------------------------------------------- generate

const generateOpen = ref(false);
const seedText = ref("");
const lastSeed = ref<number | null>(null);
const seedError = computed(() => {
  const t = seedText.value.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t) || Number(t) > 0xffff_ffff)
    return "Use a whole number from 0 to 4294967295, or leave it empty for a random one.";
  return null;
});

async function runGenerate() {
  if (seedError.value) {
    document.getElementById(`${prefix}-seed`)?.focus();
    return;
  }
  const seed = seedText.value.trim();
  const result = await generator.run(
    "generate",
    () =>
      $convex.mutation(api.editor.generate, {
        versionId: props.versionId,
        questionId: props.entry.question._id,
        ...(seed !== "" ? { seed: Number(seed) } : {}),
      }),
    { success: (r) => `New values generated (seed ${r.seed}) and saved.` },
  );
  if (!result) return;
  generateOpen.value = false;
  lastSeed.value = result.seed;
  seedText.value = "";
  const next = pbqFormFromDoc(result.question, result.key);
  saved.value = next;
  form.value = clonePbqForm(next);
  submitted.value = false;
}

// ------------------------------------------------------------- student view

const previewOpen = ref(false);
const previewQuestion = computed(() => pbqPreviewQuestion(form.value, props.entry));
const previewAnswer = ref<AnswerValue | undefined>(undefined);
watch(
  () => previewQuestion.value?.payload,
  () => (previewAnswer.value = undefined),
);

const fieldClass =
  "w-full rounded-[18px] bg-surface-2 px-4 py-3.5 text-[15px] leading-[1.5] text-fg placeholder:text-muted-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad read-only:cursor-default";
const selectClass =
  "h-[38px] min-w-0 max-w-[min(100%,320px)] flex-1 rounded-[12px] bg-surface-2 px-3 text-sm font-bold text-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad disabled:opacity-100";
const labelClass = "text-[13px] font-bold text-muted-fg";

defineExpose({ focusHeading: () => document.getElementById(headingId)?.focus() });
</script>

<template>
  <form
    class="flex min-w-0 flex-col gap-[18px]"
    novalidate
    :aria-labelledby="headingId"
    @submit.prevent="submit"
  >
    <div class="flex flex-wrap items-center gap-2.5">
      <div class="flex min-w-0 flex-1 flex-col">
        <h2 :id="headingId" tabindex="-1" class="m-0 text-lg font-extrabold outline-none">
          Question {{ entry.question.displayNumber }} · {{ TEMPLATE_LABEL[template] }}
        </h2>
        <span class="text-[13px] text-muted-fg">
          {{ SECTION_LABEL[form.section] }} · {{ points }} {{ points === 1 ? "point" : "points" }}
          <template v-if="lastSeed !== null"> · generated from seed {{ lastSeed }}</template>
        </span>
      </div>
      <UButton
        v-if="editable"
        color="neutral"
        variant="outline"
        size="sm"
        icon="i-lucide-sparkles"
        label="Generate new values"
        class="font-bold"
        @click="generateOpen = true"
      />
      <UButton
        v-if="editable"
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
      v-if="summaryList.length > 0"
      :id="summaryId"
      ref="summary"
      tabindex="-1"
      role="alert"
      class="flex flex-col gap-2 rounded-[18px] bg-bad-soft px-4 py-3.5 text-bad outline-none"
    >
      <p class="m-0 flex items-center gap-2 text-[15px] font-extrabold">
        <UIcon name="i-lucide-circle-alert" class="size-[18px] flex-none" />
        {{
          summaryList.length === 1
            ? "Fix 1 problem to save"
            : `Fix ${summaryList.length} problems to save`
        }}
      </p>
      <ul class="m-0 flex list-none flex-col gap-1 p-0 text-sm">
        <li v-for="(e, i) in summaryList" :key="i">
          <a
            v-if="e.field"
            :href="`#${id(e.field)}`"
            class="font-semibold text-bad underline"
            @click.prevent="focusField(e.field)"
          >
            {{ pbqFieldName(e.field, form) }}: {{ e.message }}
          </a>
          <span v-else class="font-semibold">{{ e.message }}</span>
        </li>
      </ul>
    </div>

    <div
      v-if="publishIssues.length > 0"
      class="flex flex-col gap-1.5 rounded-[18px] bg-warn-soft px-4 py-3 text-sm"
    >
      <p class="m-0 flex items-center gap-2 font-extrabold text-warn">
        <UIcon name="i-lucide-triangle-alert" class="size-4 flex-none" />
        Before publishing
      </p>
      <ul class="m-0 list-disc pl-5 text-fg">
        <li v-for="(issue, i) in publishIssues" :key="i">{{ issue.message }}</li>
      </ul>
    </div>

    <div class="flex flex-col gap-1.5">
      <label :for="id('stem')" :class="labelClass">Question text</label>
      <textarea
        :id="id('stem')"
        v-model="form.stem"
        rows="2"
        :maxlength="STEM_MAX"
        :readonly="!editable"
        :class="[fieldClass, 'resize-y']"
        :aria-invalid="invalid('stem')"
        :aria-describedby="desc('stem')"
      />
      <EditorPbqFieldMessage :id="id('stem')" :error="err('stem')" />
    </div>

    <div class="flex flex-wrap items-center gap-x-5 gap-y-3">
      <div class="flex min-w-0 max-w-full items-center gap-2">
        <label :for="id('domain')" class="text-sm font-semibold text-muted-fg">Domain</label>
        <select
          :id="id('domain')"
          v-model="form.domain"
          :disabled="!editable"
          :class="selectClass"
          :aria-invalid="invalid('domain')"
          :aria-describedby="desc('domain')"
        >
          <option value="" disabled>Choose a domain</option>
          <option v-for="d in DOMAINS" :key="d" :value="d">{{ domainLabel(d) }}</option>
        </select>
      </div>
      <div class="flex min-w-0 max-w-full items-center gap-2">
        <label :for="id('section')" class="text-sm font-semibold text-muted-fg">Set</label>
        <select
          :id="id('section')"
          v-model="form.section"
          :disabled="!editable"
          :class="selectClass"
          :aria-describedby="`${id('section')}-note`"
        >
          <option value="pbqA">{{ SECTION_LABEL.pbqA }} (standard)</option>
          <option value="pbqB">{{ SECTION_LABEL.pbqB }} (retake)</option>
        </select>
      </div>
      <p
        v-if="form.section !== saved.section"
        :id="`${id('section')}-note`"
        class="m-0 w-full text-[13px] text-muted-fg"
      >
        Saving moves this PBQ to the end of {{ SECTION_LABEL[form.section] }}.
      </p>
      <EditorPbqFieldMessage :id="id('domain')" :error="err('domain')" />
    </div>

    <div class="flex flex-col gap-1.5">
      <label :for="id('intro')" :class="labelClass">Scenario</label>
      <textarea
        :id="id('intro')"
        v-model="form.intro"
        rows="3"
        :readonly="!editable"
        :class="[fieldClass, 'resize-y']"
        :aria-invalid="invalid('intro')"
        :aria-describedby="desc('intro')"
      />
      <EditorPbqFieldMessage :id="id('intro')" :error="err('intro')" />
    </div>

    <div v-for="spec in ARTEFACTS[template]" :key="spec.field" class="flex flex-col gap-1.5">
      <label :for="id(`artefact:${spec.field}`)" :class="labelClass">{{ spec.label }}</label>
      <p :id="`${id(`artefact:${spec.field}`)}-about`" class="m-0 text-[13px] text-muted-fg">
        {{ spec.hint }}
      </p>
      <textarea
        :id="id(`artefact:${spec.field}`)"
        v-model="form.artefacts[spec.field]"
        :rows="spec.rows"
        spellcheck="false"
        wrap="off"
        :readonly="!editable"
        class="w-full resize-y overflow-x-auto rounded-[18px] bg-code px-4 py-3.5 font-mono text-[12.5px] leading-relaxed text-code-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad read-only:cursor-default"
        :aria-invalid="invalid(`artefact:${spec.field}`)"
        :aria-describedby="
          [`${id(`artefact:${spec.field}`)}-about`, desc(`artefact:${spec.field}`)]
            .filter(Boolean)
            .join(' ')
        "
      />
      <EditorPbqFieldMessage
        :id="id(`artefact:${spec.field}`)"
        :error="err(`artefact:${spec.field}`)"
      />
    </div>

    <EditorPbqFirewallFields
      v-if="template === 'firewall'"
      v-model="form"
      :prefix="prefix"
      :errors="errors"
      :editable="editable"
    />

    <section v-else class="flex flex-col gap-2.5" :aria-labelledby="`${prefix}-parts`">
      <h3 :id="`${prefix}-parts`" :class="[labelClass, 'm-0']">
        Parts and answers · {{ form.parts.length }}
      </h3>
      <EditorPbqPartFields
        v-for="(part, i) in form.parts"
        :key="i"
        :model-value="part"
        :index="i"
        :kinds="kinds"
        :prefix="prefix"
        :errors="errors"
        :editable="editable"
        :can-remove="form.parts.length > 1"
        @update:model-value="(p: PartForm) => setPart(i, p)"
        @remove="onRemovePart(i)"
      />
      <EditorPbqFieldMessage :id="id('parts')" :error="err('parts')" />
      <UButton
        v-if="editable && form.parts.length < MAX_PARTS"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-plus"
        label="Add part"
        class="self-start font-bold"
        @click="onAddPart"
      />
    </section>

    <div class="flex flex-col gap-1.5">
      <label :for="id('explanation')" :class="labelClass">Explanation (Why)</label>
      <textarea
        :id="id('explanation')"
        v-model="form.explanation"
        rows="3"
        :maxlength="EXPLANATION_MAX"
        :readonly="!editable"
        :placeholder="editable ? 'How to work out the answers. Students see this in review.' : ''"
        :class="[
          fieldClass,
          'min-h-[60px] resize-y',
          hint('explanation') ? 'border-2 border-dashed border-warn' : '',
        ]"
        :aria-invalid="invalid('explanation')"
        :aria-describedby="desc('explanation')"
      />
      <EditorPbqFieldMessage
        :id="id('explanation')"
        :error="err('explanation')"
        :hint="hint('explanation')"
      />
    </div>

    <!-- Student view: the current values in the student PBQ components. -->
    <section class="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-3 sm:p-4">
      <button
        type="button"
        class="flex items-center gap-2 self-start rounded-full text-sm font-bold"
        :aria-expanded="previewOpen"
        :aria-controls="`${prefix}-student-view`"
        @click="previewOpen = !previewOpen"
      >
        <UIcon
          :name="previewOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
          class="size-4"
        />
        <UIcon name="i-lucide-eye" class="size-4" />
        Student view
      </button>
      <div v-if="previewOpen" :id="`${prefix}-student-view`" class="flex min-w-0 flex-col gap-2">
        <p class="m-0 text-[13px] text-muted-fg">
          How a student sees these values (unsaved changes included). Answers typed here aren't
          saved or marked.
        </p>
        <ExamQuestionPbq
          v-if="previewQuestion"
          :key="`${previewQuestion.questionId}-${template}`"
          :question="previewQuestion"
          :model-value="previewAnswer"
          :read-only="false"
          @update:model-value="(v: AnswerValue | null) => (previewAnswer = v ?? undefined)"
        >
          <template #heading>
            <h3 class="m-0 text-xl font-extrabold tracking-[-0.01em]">
              {{ previewQuestion.stem }}
            </h3>
          </template>
        </ExamQuestionPbq>
        <p v-else class="m-0 rounded-2xl bg-surface px-4 py-3 text-sm font-semibold text-muted-fg">
          Fix the problems above to see the student view.
        </p>
      </div>
    </section>

    <div v-if="editable" class="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <UButton
        v-if="dirty"
        color="neutral"
        variant="soft"
        label="Discard changes"
        class="justify-center"
        :disabled="save.busy.value"
        @click="discard"
      />
      <UButton
        type="submit"
        label="Save question"
        icon="i-lucide-check"
        class="justify-center"
        :loading="save.busy.value"
        :disabled="!dirty"
      />
    </div>

    <UModal
      v-model:open="generateOpen"
      title="Generate new values?"
      description="Makes a new scenario, artefacts, parts, answers and explanation, works out the answers, and saves them to this draft. The question text, domain and set stay."
      :dismissible="!generator.busy.value"
    >
      <template #body>
        <div class="flex flex-col gap-3 text-sm">
          <p v-if="dirty" class="m-0 rounded-2xl bg-warn-soft px-4 py-3 font-semibold">
            Your unsaved changes to this question will be lost.
          </p>
          <div class="flex flex-col gap-1.5">
            <label :for="`${prefix}-seed`" class="font-bold">Seed (optional)</label>
            <input
              :id="`${prefix}-seed`"
              v-model="seedText"
              type="text"
              inputmode="numeric"
              autocomplete="off"
              maxlength="10"
              placeholder="Random"
              class="h-11 rounded-[14px] bg-surface-2 px-3.5 font-mono text-[15px] text-fg placeholder:text-muted-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad"
              :aria-invalid="seedError ? 'true' : undefined"
              :aria-describedby="`${prefix}-seed-help`"
              @keydown.enter.prevent="runGenerate"
            />
            <p
              :id="`${prefix}-seed-help`"
              class="m-0 text-[13px]"
              :class="seedError ? 'font-semibold text-bad' : 'text-muted-fg'"
            >
              {{ seedError ?? "The same seed always gives the same values." }}
            </p>
          </div>
        </div>
      </template>
      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            color="neutral"
            variant="soft"
            label="Keep current values"
            :disabled="generator.busy.value"
            @click="generateOpen = false"
          />
          <UButton
            icon="i-lucide-sparkles"
            label="Generate and save"
            :loading="generator.busy.value"
            @click="runGenerate"
          />
        </div>
      </template>
    </UModal>
  </form>
</template>
