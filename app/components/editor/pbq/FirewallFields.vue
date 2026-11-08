<script setup lang="ts">
// Firewall template fields (PRD: hosts, subnets, rule wording, port
// choices): requirements, the port and action choices the student picks
// from, and the rule table with each rule's correct port and action (the
// key). The diagram is an artefact field in the parent form. Emits the whole
// form on every change.
import { computed } from "vue";
import type { FirewallAction } from "~~/shared/content";
import {
  addRule,
  describedByOf,
  FIREWALL_ACTIONS,
  issueOf,
  lines,
  MAX_RULES,
  pbqDomId,
  PROTOCOLS,
  removeRule,
  type PbqField,
  type PbqFieldIssue,
  type PbqFormState,
  type RuleForm,
} from "~/lib/editorPbq";

const props = defineProps<{
  modelValue: PbqFormState;
  prefix: string;
  errors: PbqFieldIssue[];
  editable: boolean;
}>();
const emit = defineEmits<{ "update:modelValue": [form: PbqFormState] }>();

const form = computed(() => props.modelValue);
const id = (field: PbqField) => pbqDomId(props.prefix, field);
const err = (field: PbqField) => issueOf(props.errors, field);
const desc = (field: PbqField) => describedByOf(props.prefix, field, props.errors);
const invalid = (field: PbqField) => (err(field) ? "true" : undefined);
const ports = computed(() => lines(form.value.portChoices));

function patch(next: Partial<PbqFormState>) {
  emit("update:modelValue", { ...form.value, ...next });
}
function patchRule(i: number, next: Partial<RuleForm>) {
  patch({ rules: form.value.rules.map((r, k) => (k === i ? { ...r, ...next } : r)) });
}
function value(e: Event) {
  return (e.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement).value;
}
function toggleAction(action: FirewallAction, on: boolean) {
  const set = new Set(form.value.actionChoices);
  if (on) set.add(action);
  else set.delete(action);
  patch({ actionChoices: FIREWALL_ACTIONS.filter((a) => set.has(a)) });
}

const fieldClass =
  "w-full rounded-[14px] bg-surface-2 px-3.5 py-2.5 text-[14.5px] leading-[1.5] text-fg placeholder:text-muted-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad read-only:cursor-default";
const cellClass =
  "h-9 w-full min-w-0 rounded-[10px] bg-surface px-2.5 text-[14px] text-fg aria-[invalid=true]:ring-2 aria-[invalid=true]:ring-bad read-only:cursor-default disabled:opacity-100";
const labelClass = "text-[13px] font-bold text-muted-fg";
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <div class="flex flex-col gap-1.5">
      <label :for="id('requirements')" :class="labelClass">Requirements · one per line</label>
      <textarea
        :id="id('requirements')"
        :value="form.requirements"
        rows="4"
        :readonly="!editable"
        :class="[fieldClass, 'resize-y']"
        :aria-invalid="invalid('requirements')"
        :aria-describedby="desc('requirements')"
        @input="patch({ requirements: value($event) })"
      />
      <EditorPbqFieldMessage :id="id('requirements')" :error="err('requirements')" />
    </div>

    <div class="grid gap-[18px] sm:grid-cols-[minmax(0,1fr)_auto]">
      <div class="flex flex-col gap-1.5">
        <label :for="id('portChoices')" :class="labelClass">Port choices · one per line</label>
        <textarea
          :id="id('portChoices')"
          :value="form.portChoices"
          rows="4"
          :readonly="!editable"
          :class="[fieldClass, 'resize-y font-mono text-[13px]']"
          :aria-invalid="invalid('portChoices')"
          :aria-describedby="desc('portChoices')"
          @input="patch({ portChoices: value($event) })"
        />
        <EditorPbqFieldMessage :id="id('portChoices')" :error="err('portChoices')" />
      </div>
      <fieldset
        :id="id('actionChoices')"
        tabindex="-1"
        class="m-0 flex flex-col gap-2 border-0 p-0 outline-none"
        :aria-describedby="desc('actionChoices')"
      >
        <legend :class="[labelClass, 'mb-1.5 p-0']">Action choices</legend>
        <label
          v-for="a in FIREWALL_ACTIONS"
          :key="a"
          class="flex items-center gap-2.5 text-sm font-semibold"
        >
          <input
            type="checkbox"
            class="size-5 flex-none accent-brand"
            :checked="form.actionChoices.includes(a)"
            :disabled="!editable"
            @change="toggleAction(a, ($event.target as HTMLInputElement).checked)"
          />
          {{ a }}
        </label>
        <EditorPbqFieldMessage :id="id('actionChoices')" :error="err('actionChoices')" />
      </fieldset>
    </div>

    <fieldset class="m-0 flex flex-col gap-2 border-0 p-0" :aria-describedby="desc('rules')">
      <legend :class="[labelClass, 'mb-2 p-0']">
        Rules · the student fills in port and action; set the correct ones here
      </legend>
      <div
        v-for="(rule, i) in form.rules"
        :key="i"
        class="flex flex-col gap-2 rounded-[18px] bg-surface-2 p-3"
        role="group"
        :aria-label="`Rule ${i + 1}`"
      >
        <div class="flex items-center gap-2">
          <span class="flex-1 text-sm font-extrabold" aria-hidden="true">Rule {{ i + 1 }}</span>
          <UButton
            v-if="editable && form.rules.length > 1"
            color="error"
            variant="ghost"
            size="sm"
            icon="i-lucide-x"
            :aria-label="`Remove rule ${i + 1}`"
            @click="emit('update:modelValue', removeRule(form, i))"
          />
        </div>
        <div class="grid grid-cols-2 gap-2 md:grid-cols-[1fr_1fr_90px_1fr_110px]">
          <div class="flex min-w-0 flex-col gap-1">
            <label :for="id(`rule:${i}:source`)" class="text-xs font-bold text-muted-fg">
              Source
            </label>
            <input
              :id="id(`rule:${i}:source`)"
              :value="rule.source"
              type="text"
              maxlength="200"
              :readonly="!editable"
              :class="cellClass"
              :aria-invalid="invalid(`rule:${i}:source`)"
              :aria-describedby="desc(`rule:${i}:source`)"
              @input="patchRule(i, { source: value($event) })"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label :for="id(`rule:${i}:destination`)" class="text-xs font-bold text-muted-fg">
              Destination
            </label>
            <input
              :id="id(`rule:${i}:destination`)"
              :value="rule.destination"
              type="text"
              maxlength="200"
              :readonly="!editable"
              :class="cellClass"
              :aria-invalid="invalid(`rule:${i}:destination`)"
              :aria-describedby="desc(`rule:${i}:destination`)"
              @input="patchRule(i, { destination: value($event) })"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label :for="id(`rule:${i}:protocol`)" class="text-xs font-bold text-muted-fg">
              Protocol
            </label>
            <select
              :id="id(`rule:${i}:protocol`)"
              :value="rule.protocol"
              :disabled="!editable"
              :class="cellClass"
              @change="patchRule(i, { protocol: value($event) as RuleForm['protocol'] })"
            >
              <option v-for="p in PROTOCOLS" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label :for="id(`rule:${i}:port`)" class="text-xs font-bold text-muted-fg">
              Correct port
            </label>
            <select
              :id="id(`rule:${i}:port`)"
              :value="rule.port"
              :disabled="!editable"
              :class="cellClass"
              :aria-invalid="invalid(`rule:${i}:port`)"
              :aria-describedby="desc(`rule:${i}:port`)"
              @change="patchRule(i, { port: value($event) })"
            >
              <option value="" disabled>Choose</option>
              <option v-if="rule.port && !ports.includes(rule.port.trim())" :value="rule.port">
                {{ rule.port }} (not a choice)
              </option>
              <option v-for="p in ports" :key="p" :value="p">{{ p }}</option>
            </select>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label :for="id(`rule:${i}:action`)" class="text-xs font-bold text-muted-fg">
              Correct action
            </label>
            <select
              :id="id(`rule:${i}:action`)"
              :value="rule.action"
              :disabled="!editable"
              :class="cellClass"
              :aria-invalid="invalid(`rule:${i}:action`)"
              :aria-describedby="desc(`rule:${i}:action`)"
              @change="patchRule(i, { action: value($event) as FirewallAction })"
            >
              <option value="" disabled>Choose</option>
              <option v-for="a in FIREWALL_ACTIONS" :key="a" :value="a">{{ a }}</option>
            </select>
          </div>
        </div>
        <EditorPbqFieldMessage :id="id(`rule:${i}:source`)" :error="err(`rule:${i}:source`)" />
        <EditorPbqFieldMessage
          :id="id(`rule:${i}:destination`)"
          :error="err(`rule:${i}:destination`)"
        />
        <EditorPbqFieldMessage :id="id(`rule:${i}:port`)" :error="err(`rule:${i}:port`)" />
        <EditorPbqFieldMessage :id="id(`rule:${i}:action`)" :error="err(`rule:${i}:action`)" />
      </div>
      <EditorPbqFieldMessage :id="id('rules')" :error="err('rules')" />
      <UButton
        v-if="editable && form.rules.length < MAX_RULES"
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-plus"
        label="Add rule"
        class="self-start font-bold"
        @click="emit('update:modelValue', addRule(form))"
      />
    </fieldset>
  </div>
</template>
