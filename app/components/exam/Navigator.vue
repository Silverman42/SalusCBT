<script setup lang="ts">
// Question grid (mockup screen 02, EX-8). One tab stop: arrow keys move
// between cells (roving tabindex), Home/End to the row ends (Ctrl for the
// whole grid), Enter or Space opens the question.
import { gridMove, type NavCellState, type NavigatorCell } from "~/lib/examRunner";

const props = defineProps<{ cells: NavigatorCell[]; currentIndex: number; answered: number }>();
const emit = defineEmits<{ jump: [index: number] }>();

const COLUMNS = 10;
const focusIndex = ref(props.currentIndex);
watch(
  () => props.currentIndex,
  (i) => (focusIndex.value = i),
);
// Function refs: a v-for ref array isn't guaranteed to follow the source order.
const buttons: (HTMLButtonElement | null)[] = [];
function setButton(i: number, el: unknown) {
  buttons[i] = el instanceof HTMLButtonElement ? el : null;
}

function onKeydown(e: KeyboardEvent, index: number) {
  const next = gridMove(index, e.key, props.cells.length, COLUMNS, e.ctrlKey || e.metaKey);
  if (next === null) return;
  e.preventDefault();
  e.stopPropagation();
  focusIndex.value = next;
  buttons[next]?.focus();
}

const STATE_TEXT: Record<NavCellState, string> = {
  answered: "answered",
  flagged: "flagged",
  unanswered: "unanswered",
};

function cellLabel(cell: NavigatorCell, index: number) {
  const name = cell.label.startsWith("P") ? `PBQ ${cell.label.slice(1)}` : `Question ${cell.label}`;
  const parts = [name, STATE_TEXT[cell.state]];
  if (cell.partial) parts.push("partly answered");
  if (index === props.currentIndex) parts.push("current");
  return parts.join(", ");
}

function cellClass(cell: NavigatorCell, index: number) {
  if (index === props.currentIndex) return "bg-surface text-fg ring-2 ring-inset ring-fg";
  switch (cell.state) {
    case "flagged":
      return "bg-warn text-canvas";
    case "answered":
      return "bg-brand text-white";
    default:
      return "bg-surface-2 text-muted-fg hover:text-fg";
  }
}

const pct = computed(() =>
  props.cells.length ? Math.round((props.answered / props.cells.length) * 100) : 0,
);
</script>

<template>
  <nav
    aria-labelledby="navigator-title"
    class="flex flex-col gap-[18px] rounded-[28px] bg-surface p-5 sm:p-6"
  >
    <div class="flex items-baseline justify-between">
      <h2 id="navigator-title" class="m-0 text-[17px] font-extrabold">Navigator</h2>
      <span class="text-[13px] text-muted-fg">{{ answered }} answered</span>
    </div>
    <div class="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
      <div class="h-full rounded-full bg-brand" :style="{ width: `${pct}%` }" />
    </div>
    <p id="navigator-help" class="sr-only">
      Use the arrow keys to move between questions and Enter to open one.
    </p>
    <ul class="m-0 grid list-none grid-cols-10 gap-1.5 p-0" aria-describedby="navigator-help">
      <li v-for="(cell, i) in cells" :key="i">
        <button
          :ref="(el) => setButton(i, el)"
          type="button"
          :tabindex="i === focusIndex ? 0 : -1"
          :aria-label="cellLabel(cell, i)"
          :aria-current="i === currentIndex ? 'step' : undefined"
          class="grid aspect-square w-full place-items-center rounded-[9px] text-[11px] font-bold tabular-nums focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          :class="cellClass(cell, i)"
          @click="emit('jump', i)"
          @keydown="onKeydown($event, i)"
          @focus="focusIndex = i"
        >
          {{ cell.label }}
        </button>
      </li>
    </ul>
    <div class="grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] text-muted-fg" aria-hidden="true">
      <span class="flex items-center gap-2"
        ><i class="size-3 rounded-[4px] bg-brand" />Answered</span
      >
      <span class="flex items-center gap-2"><i class="size-3 rounded-[4px] bg-warn" />Flagged</span>
      <span class="flex items-center gap-2">
        <i class="size-3 rounded-[4px] border border-line bg-surface-2" />Unanswered
      </span>
      <span class="flex items-center gap-2"
        ><i class="size-3 rounded-[4px] border-2 border-fg" />Current</span
      >
    </div>
  </nav>
</template>
