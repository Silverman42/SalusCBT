<script setup lang="ts">
// One exam version in the editor (mockup screen 11; LLD §10; ED-1–ED-3,
// ED-8, ED-9): header with status, Preview as student and Publish, PBQ /
// multiple-choice tabs, the question list (add, select, reorder), the MCQ
// form or the PBQ template form (T-608), the
// live validation list with jump-to-question, totals, and the line's
// published versions with Restore. Published, archived and other people's
// drafts are read-only. Live: `getDraft`, `validate`, `myVersions`.
import { computed, nextTick, ref, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useEditorAction } from "~/composables/useEditorAction";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { formatDate } from "~/lib/admin";
import {
  copyActionLabel,
  editorErrorMessage,
  entriesIn,
  latestPublishedIds,
  moveItem,
  readOnlyReason,
  SECTION_LABEL,
  validationIssuesOf,
  versionName,
  versionStatusBadge,
  versionSubtitle,
  versionTotals,
  type DraftEntry,
  type Section,
  type VersionSummary,
} from "~/lib/editor";
import {
  previewModeLabel,
  previewPath,
  savePreviewTicket,
  type PreviewMode,
} from "~/lib/editorPreview";

const props = defineProps<{ versionId: Id<"examVersions"> }>();

const { $convex } = useNuxtApp();
const toast = useToast();
const draft = useStaffQuery(api.editor.getDraft, { versionId: props.versionId });
const check = useStaffQuery(api.editor.validate, { versionId: props.versionId });
const mine = useStaffQuery(api.editor.myVersions, {});

const version = computed(() => draft.data.value?.version ?? null);
const entries = computed(() => draft.data.value?.questions ?? []);
const editable = computed(() => version.value?.editable ?? false);
const allVersions = computed(() => mine.data.value ?? []);
const totals = computed(() => versionTotals(entries.value));
const errorCount = computed(
  () => (check.data.value ?? []).filter((i) => i.severity === "error").length,
);
const warnings = computed(
  () => (check.data.value ?? []).filter((i) => i.severity === "warning").length,
);

useHead({ title: () => (version.value ? `${version.value.label} · Question editor` : "") });

// ------------------------------------------------------------ tabs & list

type Tab = "pbq" | "mcq";
const TAB_SECTIONS: Record<Tab, Section[]> = { pbq: ["pbqA", "pbqB"], mcq: ["mcq"] };
const tab = ref<Tab>("mcq");
const tabEntries = computed(() =>
  entries.value.filter((e) => TAB_SECTIONS[tab.value].includes(e.question.section)),
);

/** A question id, "new" for the add form, or null before anything loads. */
const selectedId = ref<string | null>(null);
const selected = computed<DraftEntry | null>(
  () => entries.value.find((e) => e.question._id === selectedId.value) ?? null,
);
const nextNumber = computed(() => String(totals.value.pbqA + totals.value.mcq + 1));

watch(
  entries,
  (list) => {
    if (selectedId.value === "new" || selected.value) return;
    // First load, or the selected question was removed: pick the first in the tab.
    if (selectedId.value === null && entriesIn(list, "mcq").length === 0 && list.length > 0)
      tab.value = "pbq";
    selectedId.value =
      list.find((e) => TAB_SECTIONS[tab.value].includes(e.question.section))?.question._id ?? null;
  },
  { immediate: true },
);

// ------------------------------------------------- selection & unsaved work

const formDirty = ref(false);
const pending = ref<{ id: string | null; tab: Tab } | null>(null);
const discardOpen = ref(false);
const formRef = ref<{ focusHeading: () => void } | null>(null);

function go(id: string | null, toTab: Tab, focus = false) {
  if (formDirty.value && id !== selectedId.value) {
    pending.value = { id, tab: toTab };
    discardOpen.value = true;
    return;
  }
  tab.value = toTab;
  selectedId.value = id;
  formDirty.value = false;
  if (focus) void nextTick(() => formRef.value?.focusHeading());
}

function confirmDiscard() {
  const next = pending.value;
  discardOpen.value = false;
  pending.value = null;
  formDirty.value = false;
  if (next) go(next.id, next.tab, true);
}

function tabOf(section: Section): Tab {
  return section === "mcq" ? "mcq" : "pbq";
}

function selectQuestion(id: string) {
  const entry = entries.value.find((e) => e.question._id === id);
  if (entry) go(id, tabOf(entry.question.section), true);
}

function switchTab(next: Tab) {
  if (next === tab.value) return;
  const first = entries.value.find((e) => TAB_SECTIONS[next].includes(e.question.section));
  go(first?.question._id ?? (next === "mcq" && editable.value ? "new" : null), next);
}

function addQuestion() {
  go("new", "mcq", true);
}

function onSaved(questionId: string) {
  formDirty.value = false;
  selectedId.value = questionId;
}

// ------------------------------------------------------------- reordering

const reorderAction = useEditorAction();
const announcement = ref("");

async function move(section: Section, index: number, delta: -1 | 1) {
  const ids = entriesIn(entries.value, section).map((e) => e.question._id);
  const next = moveItem(ids, index, delta);
  if (!next) return;
  const ok = await reorderAction.run("reorder", () =>
    $convex
      .mutation(api.editor.reorder, {
        versionId: props.versionId,
        section,
        questionIds: next,
      })
      .then(() => true),
  );
  if (ok !== null)
    announcement.value = `Moved to position ${index + delta + 1} of ${ids.length} in ${SECTION_LABEL[section]}.`;
}

// --------------------------------------------------------------- removing

const removeAction = useEditorAction();
const removeOpen = ref(false);

async function remove() {
  const entry = selected.value;
  if (!entry) return;
  const list = entriesIn(entries.value, entry.question.section);
  const at = list.findIndex((e) => e.question._id === entry.question._id);
  const neighbour = list[at + 1] ?? list[at - 1] ?? null;
  const ok = await removeAction.run(
    "delete",
    () =>
      $convex
        .mutation(api.editor.deleteQuestion, {
          versionId: props.versionId,
          questionId: entry.question._id,
        })
        .then(() => true),
    { success: () => `Question ${entry.question.displayNumber} removed.` },
  );
  removeOpen.value = false;
  if (ok === null) return;
  formDirty.value = false;
  selectedId.value = neighbour?.question._id ?? (editable.value ? "new" : null);
  void nextTick(() => formRef.value?.focusHeading());
}

// ------------------------------------------------------------- publishing

const publishAction = useEditorAction();
const publishOpen = ref(false);
const publishIssues = ref<string[]>([]);

async function publish() {
  publishIssues.value = [];
  const result = await publishAction.run(
    "publish",
    () => $convex.mutation(api.editor.publish, { versionId: props.versionId }),
    {
      success: (r) =>
        `${versionName(r)} published · ${r.totalPoints} points${r.isDefault ? " · now the default exam" : ""}.`,
      onError: (err) => {
        publishIssues.value = validationIssuesOf(err) ?? [];
        return publishIssues.value.length === 0;
      },
    },
  );
  if (result) publishOpen.value = false;
}

// ------------------------------------------------------------- previewing

const previewAction = useEditorAction();
const previewOpen = ref(false);
const previewMode = ref<PreviewMode>("standard");

/**
 * ED-1: start a preview attempt and open it in the editor's preview page.
 * The preview's anon token stays in this tab's sessionStorage, never in the
 * student identity (`useAnonIdentity`).
 */
async function startPreview() {
  const mode = previewMode.value === "retake" && totals.value.pbqB > 0 ? "retake" : "standard";
  const result = await previewAction.run("preview", () =>
    $convex.mutation(api.editor.previewAttempt, { versionId: props.versionId, mode }),
  );
  if (!result) return;
  let storage: Storage | null = null;
  try {
    storage = window.sessionStorage;
  } catch {
    storage = null;
  }
  const kept = savePreviewTicket(storage, {
    attemptId: result.attemptId,
    versionId: props.versionId,
    anonToken: result.anonToken,
  });
  if (!kept) {
    toast.add({
      title: "This browser blocks session storage, so the preview can't open.",
      color: "error",
      icon: "i-lucide-circle-alert",
    });
    return;
  }
  previewOpen.value = false;
  await navigateTo(previewPath(props.versionId, result.attemptId));
}

const selectedIssues = computed(() =>
  (check.data.value ?? []).filter((i) => i.questionId === selected.value?.question._id),
);

// ------------------------------------------------ drafts from this version

const draftOpen = ref(false);
const draftSource = ref<VersionSummary | null>(null);
const draftTitle = ref<string | undefined>();
const line = computed(() =>
  version.value
    ? allVersions.value
        .filter(
          (v) =>
            v.status === "published" &&
            v.examId === version.value!.examId &&
            v.ownerId === version.value!.ownerId,
        )
        .sort((a, b) => b.versionNo - a.versionNo)
    : [],
);
const latest = computed(() => latestPublishedIds(allVersions.value));

function newDraftFrom(source: VersionSummary) {
  draftSource.value = source;
  draftTitle.value =
    copyActionLabel(source, latest.value) === "Restore"
      ? `Restore ${source.label} ${versionName(source)}`
      : undefined;
  draftOpen.value = true;
}

const now = Date.now();
const subtitle = computed(() =>
  version.value ? versionSubtitle(version.value, allVersions.value) : "",
);
</script>

<template>
  <div class="flex flex-col gap-4">
    <NuxtLink
      to="/tutor/versions"
      class="inline-flex items-center gap-1.5 self-start text-sm font-semibold text-muted-fg hover:text-fg"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4" />
      All versions
    </NuxtLink>

    <p v-if="draft.loading.value" class="m-0 text-sm text-muted-fg">Loading version…</p>
    <p
      v-else-if="draft.error.value"
      class="m-0 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
      role="alert"
    >
      {{ editorErrorMessage(draft.error.value, "load") }}
    </p>

    <template v-else-if="version">
      <!-- Header strip -->
      <section
        class="flex flex-col gap-3.5 rounded-[28px] bg-surface px-5 py-4 xl:flex-row xl:items-center"
        aria-labelledby="version-heading"
      >
        <div class="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <div class="flex min-w-0 flex-col">
            <h2 id="version-heading" class="m-0 truncate text-[17px] font-extrabold">
              {{ version.label }}
            </h2>
            <span class="text-[13px] text-muted-fg">{{ subtitle }}</span>
          </div>
          <AdminStatusBadge :badge="versionStatusBadge(version.status)" />
        </div>
        <div
          class="flex gap-1.5 self-start rounded-full bg-surface-2 p-[5px]"
          role="group"
          aria-label="Question type"
        >
          <button
            v-for="t in ['pbq', 'mcq'] as const"
            :key="t"
            type="button"
            class="rounded-full px-4 py-2 text-sm"
            :class="
              tab === t
                ? 'bg-brand font-bold text-white'
                : 'font-semibold text-muted-fg hover:text-fg'
            "
            :aria-pressed="tab === t"
            @click="switchTab(t)"
          >
            {{
              t === "pbq"
                ? `PBQs · ${totals.pbqA + totals.pbqB}`
                : `Multiple choice · ${totals.mcq}`
            }}
          </button>
        </div>
        <UButton
          v-if="version.authored"
          color="neutral"
          variant="outline"
          icon="i-lucide-eye"
          label="Preview as student"
          class="justify-center self-start font-semibold xl:self-auto"
          :disabled="entries.length === 0"
          @click="previewOpen = true"
        />
        <UButton
          v-if="editable"
          :label="`Publish ${versionName(version)}`"
          icon="i-lucide-upload"
          class="justify-center self-start xl:self-auto"
          :disabled="!check.data.value || errorCount > 0"
          aria-describedby="issues-heading"
          @click="publishOpen = true"
        />
      </section>

      <p
        v-if="readOnlyReason(version)"
        class="m-0 flex flex-col gap-3 rounded-[20px] bg-surface-2 px-4 py-3 text-sm sm:flex-row sm:items-center"
      >
        <span class="flex flex-1 gap-2">
          <UIcon name="i-lucide-lock" class="mt-0.5 size-4 flex-none" />
          <span>{{ readOnlyReason(version) }}</span>
        </span>
        <UButton
          v-if="version.status !== 'draft'"
          color="neutral"
          variant="soft"
          size="sm"
          class="justify-center self-start font-bold sm:self-auto"
          :label="mine.data.value ? copyActionLabel(version, latest) : 'New draft from this'"
          @click="newDraftFrom(version)"
        />
      </p>

      <p class="sr-only" aria-live="polite">{{ announcement }}</p>

      <div
        class="grid gap-4 lg:grid-cols-[300px_minmax(0,1fr)] 2xl:grid-cols-[300px_minmax(0,1fr)_300px]"
      >
        <EditorQuestionList
          class="lg:col-start-1 lg:row-start-1"
          :entries="tabEntries"
          :sections="tab === 'pbq' ? ['pbqA', 'pbqB'] : ['mcq']"
          :issues="check.data.value ?? []"
          :selected-id="selectedId"
          :editable="editable"
          :busy="reorderAction.busy.value"
          :can-add="tab === 'mcq'"
          @select="selectQuestion"
          @move="move"
          @add="addQuestion"
        />

        <div
          class="rounded-[28px] bg-surface px-5 py-6 sm:px-[30px] sm:py-7 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start"
        >
          <EditorMcqForm
            v-if="selectedId === 'new' || selected?.question.kind === 'mcq'"
            ref="formRef"
            :key="selectedId ?? 'none'"
            :version-id="versionId"
            :entry="selectedId === 'new' ? null : selected"
            :next-number="nextNumber"
            :editable="editable"
            @saved="onSaved"
            @remove="removeOpen = true"
            @dirty="(d: boolean) => (formDirty = d)"
          />
          <EditorPbqForm
            v-else-if="selected"
            ref="formRef"
            :key="selected.question._id"
            :version-id="versionId"
            :entry="selected"
            :editable="editable"
            :issues="selectedIssues"
            @saved="onSaved"
            @remove="removeOpen = true"
            @dirty="(d: boolean) => (formDirty = d)"
          />
          <p v-else class="m-0 text-sm text-muted-fg">
            {{ tab === "pbq" ? "This version has no PBQs." : "No multiple-choice questions yet." }}
          </p>
        </div>

        <div
          class="flex flex-col gap-4 max-lg:order-first lg:col-start-1 lg:row-start-2 2xl:col-start-3 2xl:row-start-1 2xl:self-start"
        >
          <EditorIssuePanel
            :issues="check.data.value"
            :failed="!!check.error.value"
            @jump="selectQuestion"
          />

          <section
            class="flex flex-col gap-2.5 rounded-[28px] bg-surface px-[22px] py-5"
            aria-labelledby="totals-heading"
          >
            <h2 id="totals-heading" class="m-0 text-base font-extrabold">Version totals</h2>
            <dl class="m-0 flex flex-col gap-2.5 text-sm">
              <div class="flex justify-between gap-3">
                <dt class="text-muted-fg">Points</dt>
                <dd class="m-0 font-extrabold">{{ totals.points }}</dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted-fg">Questions</dt>
                <dd class="m-0 text-right font-extrabold">
                  {{ totals.pbqA + totals.pbqB }} PBQ · {{ totals.mcq }} MC
                </dd>
              </div>
              <div class="flex justify-between gap-3">
                <dt class="text-muted-fg">PBQ sets</dt>
                <dd class="m-0 text-right font-extrabold">
                  A {{ totals.pbqA }} · B {{ totals.pbqB }}
                </dd>
              </div>
            </dl>
          </section>

          <section
            v-if="line.length > 0"
            class="flex flex-col gap-2.5 rounded-[28px] bg-surface px-[22px] py-5"
            aria-labelledby="line-heading"
          >
            <h2 id="line-heading" class="m-0 text-base font-extrabold">Published versions</h2>
            <ul class="m-0 flex list-none flex-col gap-2 p-0">
              <li
                v-for="v in line"
                :key="v.versionId"
                class="flex items-center justify-between gap-3 text-sm"
              >
                <NuxtLink
                  v-if="v.authored && v.versionId !== version.versionId"
                  :to="`/tutor/versions/${v.versionId}`"
                  class="truncate hover:underline"
                  :class="latest.has(v.versionId) ? '' : 'text-muted-fg'"
                >
                  {{ versionName(v) }} · {{ formatDate(v.publishedAt ?? v.updatedAt, now) }}
                </NuxtLink>
                <span
                  v-else
                  class="truncate"
                  :class="latest.has(v.versionId) ? '' : 'text-muted-fg'"
                >
                  {{ versionName(v) }} · {{ formatDate(v.publishedAt ?? v.updatedAt, now) }}
                </span>
                <AdminStatusBadge
                  v-if="latest.has(v.versionId)"
                  :badge="{ label: 'Latest', tone: 'ok' }"
                />
                <UButton
                  v-else
                  variant="link"
                  size="sm"
                  label="Restore"
                  class="p-0 font-bold"
                  :aria-label="`Restore ${versionName(v)}`"
                  @click="newDraftFrom(v)"
                />
              </li>
            </ul>
          </section>
        </div>
      </div>

      <!-- Dialogs -->
      <UModal
        v-model:open="publishOpen"
        :title="`Publish ${version.label} ${versionName(version)}?`"
        description="Publishing creates a version that can never be changed. Classes can then use it; attempts already started keep the version they started on."
        :dismissible="!publishAction.busy.value"
      >
        <template #body>
          <div class="flex flex-col gap-3 text-sm">
            <p class="m-0">
              {{ totals.points }} points · {{ totals.pbqA + totals.pbqB }} PBQ ·
              {{ totals.mcq }} multiple choice.
              <template v-if="warnings > 0">
                {{ warnings === 1 ? "1 warning" : `${warnings} warnings` }} won't stop publishing.
              </template>
            </p>
            <p v-if="version.isDefault" class="m-0 font-semibold">
              This becomes the default exam for students without a class code.
            </p>
            <div
              v-if="publishIssues.length > 0"
              role="alert"
              class="flex flex-col gap-1 rounded-2xl bg-bad-soft px-4 py-3 font-semibold text-bad"
            >
              <span>Publishing was blocked:</span>
              <ul class="m-0 list-disc pl-5">
                <li v-for="(issue, i) in publishIssues" :key="i">{{ issue }}</li>
              </ul>
            </div>
          </div>
        </template>
        <template #footer>
          <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton
              color="neutral"
              variant="soft"
              label="Not yet"
              :disabled="publishAction.busy.value"
              autofocus
              @click="publishOpen = false"
            />
            <UButton
              :label="`Publish ${versionName(version)}`"
              :loading="publishAction.busy.value"
              @click="publish"
            />
          </div>
        </template>
      </UModal>

      <UModal
        v-model:open="previewOpen"
        title="Preview as a student"
        description="Sit this version exactly as a student would, then submit to see the marking and the review. Previews never appear in class results or stats; starting a new one replaces your last preview of that paper."
        :dismissible="!previewAction.busy.value"
      >
        <template #body>
          <fieldset class="m-0 flex flex-col gap-2 border-0 p-0 text-sm">
            <legend class="mb-2 p-0 font-bold">Which paper?</legend>
            <label
              v-for="m in ['standard', 'retake'] as const"
              :key="m"
              class="flex items-center gap-3 rounded-[16px] bg-surface-2 px-4 py-3"
              :class="m === 'retake' && totals.pbqB === 0 ? 'opacity-60' : ''"
            >
              <input
                v-model="previewMode"
                type="radio"
                name="preview-mode"
                :value="m"
                class="size-5 flex-none accent-brand"
                :disabled="m === 'retake' && totals.pbqB === 0"
              />
              <span class="flex flex-col">
                <span class="font-bold">{{ previewModeLabel(m) }}</span>
                <span class="text-[13px] text-muted-fg">
                  {{
                    m === "retake"
                      ? totals.pbqB === 0
                        ? "This version has no set B PBQs."
                        : `${totals.pbqB} PBQs, then the multiple-choice questions`
                      : `${totals.pbqA} PBQs, then the multiple-choice questions`
                  }}
                </span>
              </span>
            </label>
          </fieldset>
        </template>
        <template #footer>
          <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <UButton
              color="neutral"
              variant="soft"
              label="Cancel"
              :disabled="previewAction.busy.value"
              @click="previewOpen = false"
            />
            <UButton
              icon="i-lucide-play"
              label="Start preview"
              :loading="previewAction.busy.value"
              @click="startPreview"
            />
          </div>
        </template>
      </UModal>

      <AdminConfirmDialog
        v-model:open="removeOpen"
        :title="
          selected ? `Remove question ${selected.question.displayNumber}?` : 'Remove question?'
        "
        description="The question and its answer key are removed from this draft, and the questions after it are renumbered."
        confirm-label="Remove question"
        cancel-label="Keep it"
        :busy="removeAction.busy.value"
        @confirm="remove"
      />

      <AdminConfirmDialog
        v-model:open="discardOpen"
        title="Discard your changes?"
        description="This question has changes that aren't saved yet."
        confirm-label="Discard changes"
        cancel-label="Keep editing"
        @confirm="confirmDiscard"
      />

      <EditorNewDraftDialog
        v-model:open="draftOpen"
        :versions="allVersions"
        :source="draftSource"
        :title="draftTitle"
      />
    </template>
  </div>
</template>
