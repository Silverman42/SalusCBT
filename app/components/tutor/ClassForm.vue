<script setup lang="ts">
// Create or edit a class (CL-1, CL-3, EX-21) in a modal: name, exam version
// (published only: the default or the tutor's own) and extra time. Errors
// show inline. Calls `classes.create` / `classes.update`.
import type { FunctionReturnType } from "convex/server";
import { computed, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { isSessionError } from "~/lib/admin";
import { SIGN_IN_PATH } from "~/lib/authGuard";
import {
  CLASS_NAME_MAX,
  classNameProblem,
  MULTIPLIER_OPTIONS,
  tutorErrorMessage,
  versionOptions,
} from "~/lib/tutor";

type ClassSummary = FunctionReturnType<typeof api.classes.mine>[number];

const open = defineModel<boolean>("open", { required: true });
const props = defineProps<{
  /** The class to edit; omitted to create one. */
  klass?: ClassSummary | null;
}>();
const emit = defineEmits<{ created: [result: { classId: Id<"classes">; code: string }] }>();

const { $convex } = useNuxtApp();
const toast = useToast();
const route = useRoute();
const { data: versions, error: versionsError } = useStaffQuery(api.editor.myVersions, {});

const nameId = useId();
const versionId = useId();
const multiplierId = useId();
const errorId = useId();
const hintId = useId();

const name = ref("");
const version = ref<Id<"examVersions"> | undefined>(undefined);
const multiplier = ref<number>(1);
const error = ref("");
const saving = ref(false);

const editing = computed(() => !!props.klass);
const options = computed(() => {
  const list = versionOptions(versions.value ?? []);
  // A class may still point at a version that is no longer published.
  const current = props.klass;
  if (current && !list.some((o) => o.value === current.versionId)) {
    list.unshift({
      label: `${current.versionLabel} (no longer published)`,
      value: current.versionId,
    });
  }
  return list;
});
const versionsLoading = computed(() => versions.value === undefined && !versionsError.value);

watch(
  open,
  (isOpen) => {
    if (!isOpen) return;
    error.value = "";
    name.value = props.klass?.name ?? "";
    multiplier.value = props.klass?.timeMultiplier ?? 1;
    version.value = props.klass?.versionId ?? options.value[0]?.value;
  },
  { immediate: true },
);

// The versions list may arrive after the modal opens.
watch(options, (list) => {
  if (open.value && version.value === undefined) version.value = list[0]?.value;
});

async function save() {
  if (saving.value) return;
  error.value = classNameProblem(name.value);
  if (!error.value && !version.value) error.value = "Pick an exam version.";
  if (error.value) return;
  saving.value = true;
  try {
    const current = props.klass;
    if (current) {
      await $convex.mutation(api.classes.update, {
        classId: current.classId,
        name: name.value.trim(),
        versionId: version.value,
        timeMultiplier: multiplier.value,
      });
      toast.add({ title: "Class saved", color: "success", icon: "i-lucide-circle-check" });
    } else {
      const result = await $convex.mutation(api.classes.create, {
        name: name.value.trim(),
        versionId: version.value!,
        timeMultiplier: multiplier.value,
      });
      toast.add({
        title: `Class created · ${result.code}`,
        description: "Share the code with your students.",
        color: "success",
        icon: "i-lucide-circle-check",
      });
      emit("created", result);
    }
    open.value = false;
  } catch (err) {
    error.value = tutorErrorMessage(err, editing.value ? "update" : "create");
    if (isSessionError(err)) {
      await navigateTo(`${SIGN_IN_PATH}?redirect=${encodeURIComponent(route.fullPath)}`, {
        replace: true,
      });
    }
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    :title="editing ? 'Edit class' : 'New class'"
    :description="
      editing
        ? 'Changes to the version or time apply to attempts started from now on.'
        : 'Students join with the class code you get next.'
    "
    :dismissible="!saving"
  >
    <template #body>
      <form :id="`${nameId}-form`" class="flex flex-col gap-4" novalidate @submit.prevent="save">
        <div class="flex flex-col gap-1.5">
          <label :for="nameId" class="text-sm font-semibold">Class name</label>
          <UInput
            :id="nameId"
            v-model="name"
            :maxlength="CLASS_NAME_MAX"
            autocomplete="off"
            placeholder="Cyber Ops · Evening cohort"
            size="lg"
            class="w-full"
            autofocus
            :aria-invalid="error && classNameProblem(name) ? 'true' : undefined"
            :aria-describedby="error ? errorId : undefined"
          />
        </div>

        <div class="flex flex-col gap-1.5">
          <label :for="versionId" class="text-sm font-semibold">Exam version</label>
          <USelect
            :id="versionId"
            v-model="version"
            :items="options"
            :loading="versionsLoading"
            :placeholder="versionsLoading ? 'Loading versions…' : 'No published versions'"
            :disabled="options.length === 0"
            size="lg"
            class="w-full"
          />
          <p v-if="versionsError" class="m-0 text-[13px] font-semibold text-bad">
            {{ tutorErrorMessage(versionsError, "load") }}
          </p>
        </div>

        <div class="flex flex-col gap-1.5">
          <label :for="multiplierId" class="text-sm font-semibold">Exam time</label>
          <USelect
            :id="multiplierId"
            v-model="multiplier"
            :items="MULTIPLIER_OPTIONS"
            size="lg"
            class="w-full"
            :aria-describedby="hintId"
          />
          <p :id="hintId" class="m-0 text-[13px] text-muted-fg">
            Extra time is an accommodation for the whole class. Pacing alerts scale with it.
          </p>
        </div>

        <div aria-live="assertive" aria-atomic="true">
          <p
            v-if="error"
            :id="errorId"
            class="m-0 flex gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
          >
            <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-[18px] flex-none" />
            <span>{{ error }}</span>
          </p>
        </div>
      </form>
    </template>
    <template #footer>
      <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <UButton
          color="neutral"
          variant="soft"
          label="Cancel"
          :disabled="saving"
          @click="open = false"
        />
        <UButton
          type="submit"
          :form="`${nameId}-form`"
          :label="editing ? 'Save class' : 'Create class'"
          :icon="editing ? 'i-lucide-check' : 'i-lucide-plus'"
          :loading="saving"
        />
      </div>
    </template>
  </UModal>
</template>
