<script setup lang="ts">
// Live attempt table (mockup screen 09; CL-5, CL-7, CL-8, CL-11): filter
// chips, sortable columns, multi-select delete (confirmed, permanent) and
// CSV download. Rows arrive live from `classes.attempts`; submitted rows
// link to the tutor review page (T-506). A table on wide screens, cards on
// phones.
import type { FunctionReturnType } from "convex/server";
import { computed, ref, useId, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import type { Id } from "~~/convex/_generated/dataModel";
import { useAdminAction } from "~/composables/useAdminAction";
import { deletedMessage, MAX_DELETE_ATTEMPTS } from "~/lib/admin";
import {
  ATTEMPT_FILTERS,
  attemptCount,
  attemptName,
  attemptResultBadge,
  attemptWhen,
  csvFilename,
  filterCounts,
  filterLabel,
  formatDuration,
  formatScore,
  matchesFilter,
  nextSort,
  pruneSelection,
  relativeTime,
  selectionState,
  sortAttempts,
  type AttemptFilter,
  type SortDir,
  type SortKey,
} from "~/lib/tutor";

type Row = FunctionReturnType<typeof api.classes.attempts>[number];

const props = defineProps<{
  rows: Row[];
  classId: Id<"classes">;
  className: string;
  passScaled: number;
  now: number;
}>();

const { $convex } = useNuxtApp();
const deleteAction = useAdminAction();
const exportAction = useAdminAction();

const filter = ref<AttemptFilter>("all");
const sort = ref<{ key: SortKey; dir: SortDir }>({ key: "when", dir: "desc" });
const selected = ref<Set<string>>(new Set());
const confirmOpen = ref(false);
const sortId = useId();

const counts = computed(() => filterCounts(props.rows));
const visible = computed(() =>
  sortAttempts(
    props.rows.filter((r) => matchesFilter(r, filter.value)),
    sort.value.key,
    sort.value.dir,
  ),
);
const selectedRows = computed(() => props.rows.filter((r) => selected.value.has(r.attemptId)));
const headerState = computed(() => selectionState(selected.value, visible.value));
const tooMany = computed(() => selectedRows.value.length > MAX_DELETE_ATTEMPTS);
const deleteLabel = computed(() => attemptCount(selectedRows.value.length));

// Rows deleted elsewhere (or filtered out) leave the selection.
watch(visible, (rows) => {
  const next = pruneSelection(selected.value, rows);
  if (next.size !== selected.value.size) selected.value = next;
});

const COLUMNS: { key: SortKey; label: string; class: string }[] = [
  { key: "name", label: "Name", class: "" },
  { key: "when", label: "Submitted", class: "" },
  { key: "score", label: "Score", class: "w-[80px]" },
  { key: "result", label: "Result", class: "w-[120px]" },
  { key: "time", label: "Time", class: "w-[96px]" },
];

function ariaSort(key: SortKey): "ascending" | "descending" | "none" {
  if (sort.value.key !== key) return "none";
  return sort.value.dir === "asc" ? "ascending" : "descending";
}

function toggle(id: string, on: boolean | "indeterminate") {
  const next = new Set(selected.value);
  if (on === true) next.add(id);
  else next.delete(id);
  selected.value = next;
}

function toggleAll(on: boolean | "indeterminate") {
  const next = new Set(selected.value);
  for (const r of visible.value) {
    if (on === true) next.add(r.attemptId);
    else next.delete(r.attemptId);
  }
  selected.value = next;
}

function whenText(r: Row): string {
  const at = relativeTime(attemptWhen(r), props.now);
  if (r.status !== "submitted") return `Started ${at === "Just now" ? "just now" : at}`;
  return r.submittedBy === "timer" ? `${at} · time up` : at;
}

const reviewLink = (r: Row) => `/tutor/attempts/${r.attemptId}`;

async function remove() {
  const ids = selectedRows.value.map((r) => r.attemptId);
  const result = await deleteAction.run(
    "deleteAttempts",
    () => $convex.mutation(api.classes.deleteAttempts, { attemptIds: ids }),
    ({ deleted }) => deletedMessage(ids.length, deleted),
  );
  confirmOpen.value = false;
  if (result) selected.value = new Set();
}

async function downloadCsv() {
  const csv = await exportAction.run("load", () =>
    $convex.action(api.classes.exportCsv, { classId: props.classId }),
  );
  if (csv === null) return;
  // The server's CSV already starts with a UTF-8 BOM (for Excel).
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = csvFilename(props.className, Date.now());
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
</script>

<template>
  <section
    class="flex min-w-0 flex-col rounded-[28px] bg-surface px-3.5 py-2.5"
    aria-labelledby="attempts-heading"
  >
    <div class="flex flex-wrap items-center gap-2.5 px-1.5 pt-2 pb-3">
      <h2 id="attempts-heading" class="m-0 flex flex-1 items-center gap-2 text-base font-extrabold">
        Attempts
        <span class="inline-flex items-center gap-1.5 text-xs font-bold text-ok">
          <span class="size-2 rounded-full bg-ok motion-safe:animate-pulse" aria-hidden="true" />
          Live
        </span>
      </h2>
      <UButton
        v-if="selectedRows.length > 0"
        color="error"
        variant="soft"
        size="sm"
        icon="i-lucide-trash-2"
        :label="`Delete ${selectedRows.length}`"
        :aria-label="`Delete ${deleteLabel}`"
        :disabled="tooMany"
        class="font-bold"
        @click="confirmOpen = true"
      />
      <UButton
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-download"
        label="CSV"
        aria-label="Download results as CSV"
        :loading="exportAction.busy.value"
        :disabled="rows.length === 0"
        class="font-bold"
        @click="downloadCsv"
      />
    </div>
    <p v-if="tooMany" class="m-0 px-1.5 pb-2 text-sm font-semibold text-bad" role="alert">
      Delete at most {{ MAX_DELETE_ATTEMPTS }} attempts at a time.
    </p>

    <div class="flex flex-wrap gap-1.5 px-1.5 pb-3" role="group" aria-label="Filter attempts">
      <button
        v-for="f in ATTEMPT_FILTERS"
        :key="f"
        type="button"
        class="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        :class="filter === f ? 'bg-brand text-white' : 'bg-surface-2 text-muted-fg hover:text-fg'"
        :aria-pressed="filter === f"
        @click="filter = f"
      >
        {{ filterLabel(f, passScaled) }}
        <span class="tabular-nums" :class="filter === f ? 'text-salus-200' : ''">
          {{ counts[f] }}
        </span>
      </button>
    </div>

    <p v-if="rows.length === 0" class="m-0 px-2.5 pb-4 text-sm text-muted-fg">
      No attempts yet. They appear here the moment a student starts with the class code.
    </p>
    <p v-else-if="visible.length === 0" class="m-0 px-2.5 pb-4 text-sm text-muted-fg">
      No attempts match this filter.
    </p>

    <template v-else>
      <!-- Wide screens: a sortable table. -->
      <div class="overflow-x-auto max-md:hidden">
        <table class="w-full border-separate border-spacing-y-0.5 text-sm">
          <caption class="sr-only">
            Attempts in
            {{
              className
            }},
            {{
              filterLabel(filter, passScaled).toLowerCase()
            }}, sorted by
            {{
              COLUMNS.find((c) => c.key === sort.key)?.label.toLowerCase()
            }}
            {{
              sort.dir === "asc" ? "ascending" : "descending"
            }}
          </caption>
          <thead>
            <tr class="text-left text-xs tracking-[0.05em] text-muted-fg uppercase">
              <th scope="col" class="w-[38px] px-2.5 py-2">
                <UCheckbox
                  :model-value="headerState"
                  :aria-label="
                    headerState === true ? 'Clear selection' : 'Select all shown attempts'
                  "
                  @update:model-value="toggleAll"
                />
              </th>
              <th
                v-for="col in COLUMNS"
                :key="col.key"
                scope="col"
                class="px-2.5 py-1 font-bold"
                :class="col.class"
                :aria-sort="ariaSort(col.key)"
              >
                <button
                  type="button"
                  class="-mx-1.5 inline-flex items-center gap-1 rounded-[8px] px-1.5 py-1 font-bold tracking-[0.05em] uppercase hover:text-fg focus-visible:outline-2 focus-visible:outline-brand"
                  :class="sort.key === col.key ? 'text-fg' : ''"
                  @click="sort = nextSort(sort, col.key)"
                >
                  {{ col.label }}
                  <UIcon
                    :name="
                      sort.key !== col.key
                        ? 'i-lucide-chevrons-up-down'
                        : sort.dir === 'asc'
                          ? 'i-lucide-chevron-up'
                          : 'i-lucide-chevron-down'
                    "
                    class="size-3.5"
                    aria-hidden="true"
                  />
                </button>
              </th>
              <th scope="col" class="w-[84px] px-2.5 py-2"><span class="sr-only">Review</span></th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="r in visible"
              :key="r.attemptId"
              :class="selected.has(r.attemptId) ? 'bg-brand-soft' : 'hover:bg-surface-2'"
            >
              <td class="rounded-l-[14px] px-2.5 py-[11px]">
                <UCheckbox
                  :model-value="selected.has(r.attemptId)"
                  :aria-label="`Select ${attemptName(r)}`"
                  @update:model-value="toggle(r.attemptId, $event)"
                />
              </td>
              <td class="px-2.5 py-[11px] font-semibold">
                {{ attemptName(r) }}
                <span v-if="r.mode === 'retake'" class="ml-1 text-xs font-bold text-muted-fg">
                  Retake
                </span>
              </td>
              <td class="px-2.5 py-[11px] text-muted-fg">{{ whenText(r) }}</td>
              <td class="px-2.5 py-[11px] font-extrabold tabular-nums">
                {{ formatScore(r.scaled) }}
              </td>
              <td class="px-2.5 py-[11px]">
                <AdminStatusBadge :badge="attemptResultBadge(r, passScaled)" />
              </td>
              <td class="px-2.5 py-[11px] text-muted-fg tabular-nums">
                {{ formatDuration(r.timeUsedSec) }}
              </td>
              <td class="rounded-r-[14px] px-2.5 py-[11px] text-right">
                <NuxtLink
                  v-if="r.status === 'submitted'"
                  :to="reviewLink(r)"
                  class="text-[13px] font-bold text-brand-ink hover:underline"
                  :aria-label="`Review ${attemptName(r)}'s attempt`"
                >
                  Review
                </NuxtLink>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Phones: cards with a sort picker. -->
      <div class="flex flex-col gap-2 md:hidden">
        <div class="flex items-center gap-2 px-1.5 pb-1">
          <UCheckbox
            :model-value="headerState"
            label="Select all"
            @update:model-value="toggleAll"
          />
          <span class="flex-1" />
          <label :for="sortId" class="text-[13px] text-muted-fg">Sort</label>
          <select
            :id="sortId"
            class="h-8 rounded-full bg-surface-2 px-3 text-[13px] font-bold text-fg"
            :value="`${sort.key}:${sort.dir}`"
            @change="
              (e) => {
                const [key, dir] = (e.target as HTMLSelectElement).value.split(':');
                sort = { key: key as SortKey, dir: dir as SortDir };
              }
            "
          >
            <option value="when:desc">Newest</option>
            <option value="when:asc">Oldest</option>
            <option value="score:desc">Highest score</option>
            <option value="score:asc">Lowest score</option>
            <option value="name:asc">Name A–Z</option>
            <option value="time:desc">Most time used</option>
          </select>
        </div>
        <ul class="m-0 flex list-none flex-col gap-2 p-0" aria-label="Attempts">
          <li
            v-for="r in visible"
            :key="r.attemptId"
            class="flex items-start gap-3 rounded-[18px] p-3.5"
            :class="selected.has(r.attemptId) ? 'bg-brand-soft' : 'bg-surface-2'"
          >
            <UCheckbox
              class="mt-0.5"
              :model-value="selected.has(r.attemptId)"
              :aria-label="`Select ${attemptName(r)}`"
              @update:model-value="toggle(r.attemptId, $event)"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <div class="flex items-center gap-2">
                <span class="min-w-0 flex-1 truncate text-[15px] font-bold">{{
                  attemptName(r)
                }}</span>
                <span class="text-base font-extrabold tabular-nums">{{
                  formatScore(r.scaled)
                }}</span>
              </div>
              <div class="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-muted-fg">
                <AdminStatusBadge :badge="attemptResultBadge(r, passScaled)" />
                <span>{{ whenText(r) }}</span>
                <span v-if="r.timeUsedSec !== undefined" class="tabular-nums">
                  · {{ formatDuration(r.timeUsedSec) }}
                </span>
                <span v-if="r.mode === 'retake'" class="font-bold">· Retake</span>
              </div>
              <NuxtLink
                v-if="r.status === 'submitted'"
                :to="reviewLink(r)"
                class="mt-1 self-start text-[13px] font-bold text-brand-ink"
                :aria-label="`Review ${attemptName(r)}'s attempt`"
              >
                Review answers
              </NuxtLink>
            </div>
          </li>
        </ul>
      </div>
    </template>

    <AdminConfirmDialog
      v-model:open="confirmOpen"
      :title="`Delete ${deleteLabel}?`"
      description="This is permanent: the answers, scores and share links of these attempts are deleted and can't be recovered. The deletion is recorded in the audit log."
      :confirm-label="`Delete ${deleteLabel}`"
      cancel-label="Keep them"
      :busy="deleteAction.busy.value"
      @confirm="remove"
    />
  </section>
</template>
