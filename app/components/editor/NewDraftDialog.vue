<script setup lang="ts">
// "New draft" dialog (ED-3, ED-7): pick the version to copy and name the
// draft, then open it in the editor. Restore is the same call from an older
// published version (LLD §10.1).
import { computed, nextTick, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import { useEditorAction } from "~/composables/useEditorAction";
import {
  editorErrorMessage,
  labelError,
  suggestedLabel,
  VERSION_LABEL_MAX,
  versionName,
  type VersionSummary,
} from "~/lib/editor";

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  versions: VersionSummary[];
  /** The version to copy, chosen up front (a row's "Restore"); the default otherwise. */
  source: VersionSummary | null;
  /** "Restore v1" instead of "New draft". */
  title?: string;
}>();

const { $convex } = useNuxtApp();
const { busy, run } = useEditorAction();

const sourceId = useId();
const labelId = useId();
const labelErrorId = useId();
const labelHintId = useId();
const fromId = ref("");
const label = ref("");
const error = ref("");
const labelInput = ref<HTMLInputElement | null>(null);

const from = computed(() => props.versions.find((v) => v.versionId === fromId.value) ?? null);

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    fromId.value = props.source?.versionId ?? "";
    label.value = props.source ? suggestedLabel(props.source) : "";
    error.value = "";
  },
  { immediate: true },
);

function optionText(v: VersionSummary): string {
  const where = v.isDefault ? "default exam" : "yours";
  return `${v.label} · ${versionName(v)} · ${v.status} · ${where}`;
}

function pickSource() {
  if (from.value && (!label.value.trim() || label.value.startsWith("Copy of ")))
    label.value = suggestedLabel(from.value);
}

async function create() {
  error.value = labelError(label.value) ?? "";
  if (!from.value) error.value = "Choose a version to copy.";
  const source = from.value;
  if (error.value || !source) {
    void nextTick(() => labelInput.value?.focus());
    return;
  }
  const result = await run(
    "createDraft",
    () =>
      $convex.mutation(api.editor.createDraft, {
        fromVersionId: source.versionId,
        label: label.value.trim(),
      }),
    {
      success: (r) => `Draft ${versionName(r)} created from ${source.label}.`,
      onError: (err) => {
        error.value = editorErrorMessage(err, "createDraft");
        return false;
      },
    },
  );
  if (!result) return;
  open.value = false;
  await navigateTo(`/tutor/versions/${result.versionId}`);
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="title ?? 'New draft'"
    description="A draft is a private copy you can edit. The version you copy from doesn't change."
    :dismissible="!busy"
  >
    <template #body>
      <form id="new-draft-form" class="flex flex-col gap-4" novalidate @submit.prevent="create">
        <div class="flex flex-col gap-1.5">
          <label :for="sourceId" class="text-[13px] font-bold text-muted-fg">Copy from</label>
          <select
            :id="sourceId"
            v-model="fromId"
            class="h-11 rounded-[12px] bg-surface-2 px-3 text-sm font-semibold text-fg"
            @change="pickSource"
          >
            <option value="" disabled>Choose a version</option>
            <option v-for="v in versions" :key="v.versionId" :value="v.versionId">
              {{ optionText(v) }}
            </option>
          </select>
        </div>
        <div class="flex flex-col gap-1.5">
          <label :for="labelId" class="text-[13px] font-bold text-muted-fg">Draft name</label>
          <input
            :id="labelId"
            ref="labelInput"
            v-model="label"
            type="text"
            :maxlength="VERSION_LABEL_MAX + 20"
            autocomplete="off"
            placeholder="Evening cohort version"
            class="h-11 rounded-[12px] bg-surface-2 px-3 text-[15px] text-fg"
            :aria-invalid="error ? 'true' : undefined"
            :aria-describedby="error ? `${labelHintId} ${labelErrorId}` : labelHintId"
          />
          <p :id="labelHintId" class="m-0 text-[13px] text-muted-fg">
            Up to {{ VERSION_LABEL_MAX }} characters. Students don't see it.
          </p>
        </div>
        <p
          v-if="error"
          :id="labelErrorId"
          role="alert"
          class="m-0 flex gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
        >
          <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
          <span>{{ error }}</span>
        </p>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton
          color="neutral"
          variant="soft"
          label="Cancel"
          :disabled="busy"
          @click="open = false"
        />
        <UButton type="submit" form="new-draft-form" label="Create draft" :loading="busy" />
      </div>
    </template>
  </UModal>
</template>
