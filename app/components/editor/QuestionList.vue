<script setup lang="ts">
// Question list (mockup screen 11 left card): search, "add", and one row per
// question with its number, a short stem and an issue dot. Reorder uses
// up/down buttons (keyboard accessible) and is off while searching, since
// a filtered list hides neighbours.
import { computed, ref, useId } from "vue";
import {
  entriesIn,
  issuesByQuestion,
  matchesSearch,
  questionPreview,
  SECTION_LABEL,
  type DraftEntry,
  type Issue,
  type Section,
} from "~/lib/editor";

const props = defineProps<{
  entries: DraftEntry[];
  sections: Section[];
  issues: Issue[];
  selectedId: string | null;
  editable: boolean;
  /** A reorder is in flight. */
  busy: boolean;
  /** Show the "add" button (MCQ tab only; PBQ forms come later). */
  canAdd: boolean;
}>();

const emit = defineEmits<{
  select: [questionId: string];
  move: [section: Section, index: number, delta: -1 | 1];
  add: [];
}>();

const searchId = useId();
const query = ref("");
const dots = computed(() => issuesByQuestion(props.issues));
const searching = computed(() => query.value.trim() !== "");

const groups = computed(() =>
  props.sections.map((section) => {
    const all = entriesIn(props.entries, section);
    return {
      section,
      total: all.length,
      rows: all
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => matchesSearch(entry, query.value)),
    };
  }),
);
const shown = computed(() => groups.value.reduce((n, g) => n + g.rows.length, 0));
</script>

<template>
  <section
    class="flex min-h-0 flex-col gap-0.5 rounded-[28px] bg-surface p-2.5"
    aria-label="Questions"
  >
    <div class="flex items-center gap-2 px-2.5 pt-2 pb-3">
      <label :for="searchId" class="sr-only">Search questions</label>
      <div class="relative min-w-0 flex-1">
        <UIcon
          name="i-lucide-search"
          class="pointer-events-none absolute top-1/2 left-3.5 size-[15px] -translate-y-1/2 text-muted-fg"
        />
        <input
          :id="searchId"
          v-model="query"
          type="search"
          placeholder="Search"
          autocomplete="off"
          class="h-10 w-full rounded-full bg-surface-2 pr-3 pl-9 text-sm text-fg placeholder:text-muted-fg"
        />
      </div>
      <UButton
        v-if="editable && canAdd"
        icon="i-lucide-plus"
        aria-label="Add a question"
        class="size-10 flex-none justify-center rounded-full"
        @click="emit('add')"
      />
    </div>
    <p class="sr-only" aria-live="polite">
      {{ searching ? `${shown} matching ${shown === 1 ? "question" : "questions"}` : "" }}
    </p>

    <div class="flex min-h-0 flex-col gap-2 overflow-y-auto lg:max-h-[min(70dvh,720px)]">
      <div v-for="group in groups" :key="group.section" class="flex flex-col gap-0.5">
        <h3
          v-if="sections.length > 1"
          class="m-0 px-2.5 pt-1 pb-1 text-xs font-bold tracking-[0.06em] text-muted-fg uppercase"
        >
          {{ SECTION_LABEL[group.section] }} · {{ group.total }}
        </h3>
        <p v-if="group.rows.length === 0" class="m-0 px-2.5 py-2 text-[13px] text-muted-fg">
          {{ searching ? "No matches." : "No questions yet." }}
        </p>
        <ul class="m-0 flex list-none flex-col gap-0.5 p-0">
          <li
            v-for="{ entry, index } in group.rows"
            :key="entry.question._id"
            class="flex items-center gap-1 rounded-[16px]"
            :class="entry.question._id === selectedId ? 'bg-brand-soft' : ''"
          >
            <button
              type="button"
              class="flex min-w-0 flex-1 items-center gap-2.5 rounded-[16px] px-2.5 py-[11px] text-left hover:bg-surface-2"
              :class="
                entry.question._id === selectedId
                  ? 'text-brand-ink hover:bg-transparent'
                  : 'text-fg'
              "
              :aria-current="entry.question._id === selectedId ? 'true' : undefined"
              @click="emit('select', entry.question._id)"
            >
              <span class="w-[34px] flex-none text-[13px] font-extrabold">
                Q{{ entry.question.displayNumber }}
              </span>
              <span class="min-w-0 flex-1 truncate text-[13.5px]">
                {{ questionPreview(entry.question) }}
              </span>
              <span
                v-if="dots.get(entry.question._id)"
                class="size-2 flex-none rounded-full"
                :class="dots.get(entry.question._id) === 'error' ? 'bg-bad' : 'bg-warn'"
              />
              <span v-if="dots.get(entry.question._id)" class="sr-only">
                ({{ dots.get(entry.question._id) === "error" ? "has errors" : "has warnings" }})
              </span>
            </button>
            <div v-if="editable && !searching" class="flex flex-none pr-1">
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-chevron-up"
                :aria-label="`Move question ${entry.question.displayNumber} up`"
                :disabled="busy || index === 0"
                @click="emit('move', group.section, index, -1)"
              />
              <UButton
                color="neutral"
                variant="ghost"
                size="xs"
                icon="i-lucide-chevron-down"
                :aria-label="`Move question ${entry.question.displayNumber} down`"
                :disabled="busy || index === group.total - 1"
                @click="emit('move', group.section, index, 1)"
              />
            </div>
          </li>
        </ul>
      </div>
    </div>
  </section>
</template>
