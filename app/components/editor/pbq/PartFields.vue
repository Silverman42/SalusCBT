<script setup lang="ts">
// One PBQ part in the template form (sshLog, nmap, hashCheck, permissions):
// id, answer type, scored / practice, prompt, and the key in the shape the
// kind needs (one answer, two ports, a pick from a list, a ticked option).
// Emits a new part on every change; the parent owns the form state.
import { computed } from "vue";
import type { PartKind } from "~~/shared/content";
import {
  addPartOption,
  describedByOf,
  isScored,
  issueOf,
  lines,
  MAX_PART_OPTIONS,
  PART_KIND_LABEL,
  pbqDomId,
  removePartOption,
  setPartKind,
  type PartForm,
  type PbqField,
  type PbqFieldIssue,
} from "~/lib/editorPbq";

const props = defineProps<{
  modelValue: PartForm;
  index: number;
  kinds: PartKind[];
  prefix: string;
  errors: PbqFieldIssue[];
  editable: boolean;
  canRemove: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [part: PartForm]; remove: [] }>();

const part = computed(() => props.modelValue);
const f = (sub: string) => `part:${props.index}:${sub}` as PbqField;
const id = (sub: string) => pbqDomId(props.prefix, f(sub));
const err = (sub: string) => issueOf(props.errors, f(sub));
const desc = (sub: string) => describedByOf(props.prefix, f(sub), props.errors);
const invalid = (sub: string) => (err(sub) ? "true" : undefined);
const label = computed(() => part.value.id.trim() || `${props.index + 1}`);
const scored = computed(() => isScored(part.value));
const choiceList = computed(() => lines(part.value.choices));
const isText = computed(() => !["port", "portPair", "pick", "mcq"].includes(part.value.kind));

function patch(next: Partial<PartForm>) {
  emit("update:modelValue", { ...part.value, ...next });
}
function value(e: Event) {
  return (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}
function setOption(j: number, text: string) {
  patch({ options: part.value.options.map((o, k) => (k === j ? { ...o, text } : o)) });
}

const fieldClass =
  "w-full rounded-[14px] bg-surface px-3.5 py-2.5 text-[14.5px] leading-[1.5] text-fg placeholder:text-muted-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad read-only:cursor-default";
const selectClass =
  "h-[38px] max-w-full rounded-[12px] bg-surface px-3 text-sm font-semibold text-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad disabled:opacity-100";
const labelClass = "text-[13px] font-bold text-muted-fg";
</script>

<template>
  <fieldset class="m-0 flex min-w-0 flex-col gap-3 rounded-[20px] border-0 bg-surface-2 p-4">
    <legend class="sr-only">Part {{ label }}</legend>
    <div class="flex flex-wrap items-center gap-2">
      <span class="flex-1 text-[15px] font-extrabold" aria-hidden="true">Part {{ label }}</span>
      <span
        class="rounded-full px-2.5 py-1 text-xs font-bold"
        :class="scored ? 'bg-brand-soft text-brand-ink' : 'bg-surface text-muted-fg'"
      >
        {{ scored ? "1 point" : "Practice" }}
      </span>
      <UButton
        v-if="editable && canRemove"
        color="error"
        variant="ghost"
        size="sm"
        icon="i-lucide-x"
        :aria-label="`Remove part ${label}`"
        @click="emit('remove')"
      />
    </div>

    <div class="grid gap-3 sm:grid-cols-[120px_minmax(0,1fr)]">
      <div class="flex flex-col gap-1">
        <label :for="id('id')" :class="labelClass">Part id</label>
        <input
          :id="id('id')"
          :value="part.id"
          type="text"
          maxlength="12"
          :readonly="!editable"
          :class="fieldClass"
          :aria-invalid="invalid('id')"
          :aria-describedby="desc('id')"
          @input="patch({ id: value($event) })"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label :for="id('kind')" :class="labelClass">Answer type</label>
        <select
          :id="id('kind')"
          :value="part.kind"
          :disabled="!editable || kinds.length < 2"
          :class="selectClass"
          :aria-invalid="invalid('kind')"
          :aria-describedby="desc('kind')"
          @change="emit('update:modelValue', setPartKind(part, value($event) as PartKind))"
        >
          <option v-for="k in kinds" :key="k" :value="k">{{ PART_KIND_LABEL[k] }}</option>
        </select>
      </div>
    </div>
    <EditorPbqFieldMessage :id="id('id')" :error="err('id')" />
    <EditorPbqFieldMessage :id="id('kind')" :error="err('kind')" />

    <label v-if="isText" class="flex items-center gap-2.5 text-sm font-semibold">
      <input
        type="checkbox"
        class="size-5 flex-none accent-brand"
        :checked="part.scored"
        :disabled="!editable"
        @change="patch({ scored: ($event.target as HTMLInputElement).checked })"
      />
      Scored (untick for a practice part with a model answer)
    </label>

    <div class="flex flex-col gap-1">
      <label :for="id('prompt')" :class="labelClass">Prompt</label>
      <textarea
        :id="id('prompt')"
        :value="part.prompt"
        rows="2"
        maxlength="2000"
        :readonly="!editable"
        :class="[fieldClass, 'resize-y']"
        :aria-invalid="invalid('prompt')"
        :aria-describedby="desc('prompt')"
        @input="patch({ prompt: value($event) })"
      />
      <EditorPbqFieldMessage :id="id('prompt')" :error="err('prompt')" />
    </div>

    <!-- Pick from a list -->
    <template v-if="part.kind === 'pick'">
      <div class="flex flex-col gap-1">
        <label :for="id('choices')" :class="labelClass">Choices · one per line</label>
        <textarea
          :id="id('choices')"
          :value="part.choices"
          rows="4"
          :readonly="!editable"
          :class="[fieldClass, 'resize-y font-mono text-[13px]']"
          :aria-invalid="invalid('choices')"
          :aria-describedby="desc('choices')"
          @input="patch({ choices: value($event) })"
        />
        <EditorPbqFieldMessage :id="id('choices')" :error="err('choices')" />
      </div>
      <div class="flex flex-col gap-1">
        <label :for="id('answer')" :class="labelClass">Correct answer</label>
        <select
          :id="id('answer')"
          :value="part.answer"
          :disabled="!editable"
          :class="selectClass"
          :aria-invalid="invalid('answer')"
          :aria-describedby="desc('answer')"
          @change="patch({ answer: value($event) })"
        >
          <option value="" disabled>Choose the answer</option>
          <option
            v-if="part.answer && !choiceList.includes(part.answer.trim())"
            :value="part.answer"
          >
            {{ part.answer }} (not a choice)
          </option>
          <option v-for="c in choiceList" :key="c" :value="c">{{ c }}</option>
        </select>
        <EditorPbqFieldMessage :id="id('answer')" :error="err('answer')" />
      </div>
    </template>

    <!-- Multiple choice -->
    <div
      v-else-if="part.kind === 'mcq'"
      class="flex flex-col gap-2"
      role="group"
      :aria-labelledby="`${id('options')}-legend`"
    >
      <span :id="`${id('options')}-legend`" :class="labelClass">
        Options · choose the correct one
      </span>
      <div
        v-for="(option, j) in part.options"
        :key="option.id"
        class="flex flex-col gap-1 rounded-[14px] px-2.5 py-2"
        :class="part.answer === option.id ? 'bg-ok-soft' : 'bg-surface'"
      >
        <div class="flex items-center gap-2.5">
          <input
            :id="`${id(`option:${j}`)}-correct`"
            type="radio"
            :name="`${id('answer')}-radio`"
            class="size-5 flex-none accent-ok"
            :checked="part.answer === option.id"
            :disabled="!editable"
            :aria-label="`Option ${option.id} is correct`"
            :aria-invalid="invalid('answer')"
            :aria-describedby="j === 0 ? desc('answer') : undefined"
            @change="patch({ answer: option.id })"
          />
          <span class="w-4 flex-none font-bold" aria-hidden="true">{{ option.id }}</span>
          <label :for="id(`option:${j}`)" class="sr-only">
            Part {{ label }} option {{ option.id }} text
          </label>
          <input
            :id="id(`option:${j}`)"
            :value="option.text"
            type="text"
            maxlength="1000"
            :readonly="!editable"
            class="h-9 min-w-0 flex-1 rounded-[10px] bg-transparent px-2 text-[14px] text-fg focus:bg-surface-2 aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad"
            :aria-invalid="invalid(`option:${j}`)"
            :aria-describedby="desc(`option:${j}`)"
            @input="setOption(j, value($event))"
          />
          <UButton
            v-if="editable && part.options.length > 2"
            color="neutral"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            :aria-label="`Remove option ${option.id} from part ${label}`"
            @click="emit('update:modelValue', removePartOption(part, j))"
          />
        </div>
        <EditorPbqFieldMessage :id="id(`option:${j}`)" :error="err(`option:${j}`)" />
      </div>
      <EditorPbqFieldMessage :id="id('options')" :error="err('options')" />
      <EditorPbqFieldMessage :id="id('answer')" :error="err('answer')" />
      <UButton
        v-if="editable && part.options.length < MAX_PART_OPTIONS"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-plus"
        label="Add option"
        class="self-start font-bold"
        @click="emit('update:modelValue', addPartOption(part))"
      />
    </div>

    <!-- Two ports -->
    <div v-else-if="part.kind === 'portPair'" class="flex flex-col gap-1">
      <div class="grid gap-3 sm:grid-cols-2">
        <div class="flex flex-col gap-1">
          <label :for="id('answer')" :class="labelClass">Cleartext port</label>
          <input
            :id="id('answer')"
            :value="part.answer"
            type="text"
            inputmode="numeric"
            maxlength="5"
            :readonly="!editable"
            :class="[fieldClass, 'font-mono']"
            :aria-invalid="invalid('answer')"
            :aria-describedby="desc('answer')"
            @input="patch({ answer: value($event) })"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label :for="`${id('answer')}-2`" :class="labelClass">Secure port</label>
          <input
            :id="`${id('answer')}-2`"
            :value="part.answer2"
            type="text"
            inputmode="numeric"
            maxlength="5"
            :readonly="!editable"
            :class="[fieldClass, 'font-mono']"
            :aria-invalid="invalid('answer')"
            :aria-describedby="desc('answer')"
            @input="patch({ answer2: value($event) })"
          />
        </div>
      </div>
      <EditorPbqFieldMessage :id="id('answer')" :error="err('answer')" />
    </div>

    <!-- One answer (text kinds, one port) -->
    <div v-else class="flex flex-col gap-1">
      <label :for="id('answer')" :class="labelClass">
        {{ scored ? "Correct answer" : "Model answer (shown in review, not marked)" }}
      </label>
      <input
        :id="id('answer')"
        :value="part.answer"
        type="text"
        maxlength="500"
        :readonly="!editable"
        :inputmode="part.kind === 'port' || part.kind === 'integer' ? 'numeric' : undefined"
        :class="[fieldClass, 'font-mono']"
        :aria-invalid="invalid('answer')"
        :aria-describedby="desc('answer')"
        @input="patch({ answer: value($event) })"
      />
      <EditorPbqFieldMessage :id="id('answer')" :error="err('answer')" />
    </div>
  </fieldset>
</template>
