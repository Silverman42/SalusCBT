<script setup lang="ts">
// /tutor/versions (LLD §14.1; ED-3, ED-7): the caller's exam versions, with
// "New draft" (copy the default exam or one of your versions) and "Restore"
// for an older published version (a new draft from it). The cards follow
// mockup screen 11's side panels; client-rendered, Convex checks every call.
import { computed, ref } from "vue";
import { api } from "~~/convex/_generated/api";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { formatDate } from "~/lib/admin";
import {
  copyActionLabel,
  defaultSource,
  editorErrorMessage,
  groupVersions,
  latestPublishedIds,
  versionName,
  versionStatusBadge,
  versionSubtitle,
  type VersionSummary,
} from "~/lib/editor";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Question editor" });

const { data, error, loading } = useStaffQuery(api.editor.myVersions, {});
const versions = computed(() => data.value ?? []);
const groups = computed(() => groupVersions(versions.value));
const latest = computed(() => latestPublishedIds(versions.value));
const now = Date.now();

const dialogOpen = ref(false);
const dialogSource = ref<VersionSummary | null>(null);
const dialogTitle = ref<string | undefined>(undefined);

function newDraft(source: VersionSummary | null) {
  dialogSource.value = source ?? defaultSource(versions.value);
  dialogTitle.value =
    source && copyActionLabel(source, latest.value) === "Restore"
      ? `Restore ${source.label} ${versionName(source)}`
      : undefined;
  dialogOpen.value = true;
}

const sections = computed(() =>
  [
    {
      id: "drafts",
      title: "Drafts",
      empty: "No drafts yet. Start one from the default exam to write your own questions.",
      rows: groups.value.drafts,
    },
    { id: "published", title: "Published", empty: "", rows: groups.value.published },
    { id: "archived", title: "Archived", empty: "", rows: groups.value.archived },
  ].filter((s) => s.rows.length > 0 || s.empty),
);

function when(v: VersionSummary): string {
  return v.publishedAt !== null
    ? `Published ${formatDate(v.publishedAt, now)}`
    : `Edited ${formatDate(v.updatedAt, now)}`;
}
</script>

<template>
  <div class="flex flex-col gap-[18px]">
    <section
      class="flex flex-col gap-3.5 rounded-[28px] bg-brand-soft p-5 sm:flex-row sm:items-center sm:px-[22px]"
      aria-labelledby="versions-intro"
    >
      <span
        class="grid size-11 flex-none place-items-center rounded-[14px] bg-brand text-white"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-layers" class="size-5" />
      </span>
      <div class="flex min-w-0 flex-1 flex-col gap-0.5">
        <h2 id="versions-intro" class="m-0 text-base font-extrabold text-brand-ink">
          Exam versions
        </h2>
        <p class="m-0 text-[13px] text-muted-fg">
          Edit a draft, then publish it for your classes. Published versions never change; attempts
          keep the version they started on.
        </p>
      </div>
      <UButton
        icon="i-lucide-plus"
        label="New draft"
        size="lg"
        class="justify-center self-start sm:self-auto"
        :disabled="loading || versions.length === 0"
        @click="newDraft(null)"
      />
    </section>

    <p v-if="loading" class="m-0 text-sm text-muted-fg">Loading versions…</p>
    <p
      v-else-if="error"
      class="m-0 rounded-[16px] bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
      role="alert"
    >
      {{ editorErrorMessage(error, "load") }}
    </p>

    <template v-else>
      <section
        v-for="section in sections"
        :key="section.id"
        class="flex flex-col gap-0.5 rounded-[28px] bg-surface px-4 py-3.5"
        :aria-labelledby="`versions-${section.id}`"
      >
        <h2 :id="`versions-${section.id}`" class="m-0 px-2 pt-1.5 pb-2.5 text-base font-extrabold">
          {{ section.title }}
          <span class="font-semibold text-muted-fg">· {{ section.rows.length }}</span>
        </h2>
        <p v-if="section.rows.length === 0" class="m-0 px-2 py-2.5 text-sm text-muted-fg">
          {{ section.empty }}
        </p>
        <ul v-else class="m-0 flex list-none flex-col gap-0.5 p-0">
          <li
            v-for="v in section.rows"
            :key="v.versionId"
            class="flex flex-col gap-2 rounded-[14px] px-2 py-2.5 sm:flex-row sm:items-center sm:gap-3"
          >
            <div class="flex min-w-0 flex-1 flex-col gap-0.5">
              <div class="flex flex-wrap items-center gap-2">
                <NuxtLink
                  v-if="v.authored"
                  :to="`/tutor/versions/${v.versionId}`"
                  class="truncate text-[15px] font-bold text-fg hover:underline"
                >
                  {{ v.label }}
                </NuxtLink>
                <span v-else class="truncate text-[15px] font-bold">{{ v.label }}</span>
                <AdminStatusBadge :badge="versionStatusBadge(v.status)" />
                <AdminStatusBadge
                  v-if="v.isDefault && latest.has(v.versionId)"
                  :badge="{ label: 'Default exam', tone: 'brand' }"
                />
              </div>
              <span class="text-[13px] text-muted-fg">
                {{ versionSubtitle(v, versions) }} · {{ when(v) }}
                <template v-if="v.status !== 'draft'"> · {{ v.totalPoints }} points</template>
              </span>
            </div>
            <div class="flex flex-none gap-2">
              <UButton
                v-if="v.authored"
                :to="`/tutor/versions/${v.versionId}`"
                color="neutral"
                variant="soft"
                size="sm"
                class="font-bold"
                :label="v.editable ? 'Edit' : 'View'"
                :aria-label="`${v.editable ? 'Edit' : 'View'} ${v.label} ${versionName(v)}`"
              />
              <UButton
                color="neutral"
                variant="soft"
                size="sm"
                class="font-bold"
                :label="copyActionLabel(v, latest)"
                :aria-label="`${copyActionLabel(v, latest)}: ${v.label} ${versionName(v)}`"
                @click="newDraft(v)"
              />
            </div>
          </li>
        </ul>
      </section>
    </template>

    <EditorNewDraftDialog
      v-model:open="dialogOpen"
      :versions="versions"
      :source="dialogSource"
      :title="dialogTitle"
    />
  </div>
</template>
