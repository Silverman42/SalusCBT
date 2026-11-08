<script setup lang="ts">
// PBQ 2 / B2 · Insecure services with nmap (T-303, LLD §14.4, PB-1).
// Contract in components/exam/QuestionPbq.vue. Layout after mockup screen 03
// (no nmap-specific screen): the scan in the dark panel on the left, with its
// PORT table as rows that can be picked, and the answers on the right.
//
// Picking: the "target" is the answer input focused last (the first one at
// the start). Clicking a row, or Enter / Space on it, writes its port into the
// target and moves the target on to the next empty input. The rows are one
// Tab stop; ↑ ↓ Home End move between them. `portPair` parts have two inputs,
// cleartext first and secure second. Ports can always be typed too (a secure
// port the answer needs may not be open on the host).
//
// Slot `part-mark` ({ part }) after each part is for review marks (T-309).
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, PortPart } from "~~/shared/content";
import {
  nextEmptySlot,
  parseNmapScan,
  portSlots,
  sameSlot,
  scanTitle,
  setSlot,
  slotLabel,
  slotValue,
  slotsHoldingPort,
  type PortSlot,
} from "~/lib/pbq/nmap";

const props = defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();

const payload = computed(() =>
  props.question.payload.template === "nmap" ? props.question.payload : null,
);
const parts = computed<PortPart[]>(() => payload.value?.parts ?? []);
const uid = computed(() => `pbq-${props.question.questionId}`);
const scan = computed(() => parseNmapScan(payload.value?.scan ?? ""));
const title = computed(() => scanTitle(scan.value));
const canPick = computed(() => !props.readOnly && scan.value.rows.length > 0);

// --- answers ---------------------------------------------------------------

const slotId = (s: PortSlot) => `${uid.value}-${s.partId}-${s.side}`;
const target = ref<PortSlot | null>(null);
watch(
  parts,
  (ps) => {
    target.value = portSlots(ps)[0] ?? null;
  },
  { immediate: true },
);
const targetLabel = computed(() => (target.value ? slotLabel(parts.value, target.value) : ""));
const announcement = ref("");

function onType(part: PortPart, side: 0 | 1, e: Event) {
  const v = (e.target as HTMLInputElement).value;
  emit("update:modelValue", setSlot(props.modelValue, part, side, v), { debounce: true });
}

// --- picking rows ----------------------------------------------------------

const activeRow = ref(0);
const scanEl = ref<HTMLElement | null>(null);

function pick(rowIndex: number) {
  const row = scan.value.rows[rowIndex];
  const slot = target.value;
  const part = parts.value.find((p) => p.id === slot?.partId);
  if (!canPick.value || !row || !slot || !part) return;
  activeRow.value = rowIndex;
  const next = setSlot(props.modelValue, part, slot.side, row.port);
  emit("update:modelValue", next);
  const label = slotLabel(parts.value, slot);
  const after = nextEmptySlot(parts.value, next ?? undefined, slot);
  target.value = after;
  announcement.value = sameSlot(slot, after)
    ? `Port ${row.port} entered in ${label}.`
    : `Port ${row.port} entered in ${label}. Next: ${slotLabel(parts.value, after)}.`;
}

function onRowKey(e: KeyboardEvent, i: number) {
  const last = scan.value.rows.length - 1;
  const to =
    e.key === "ArrowDown"
      ? Math.min(i + 1, last)
      : e.key === "ArrowUp"
        ? Math.max(i - 1, 0)
        : e.key === "Home"
          ? 0
          : e.key === "End"
            ? last
            : null;
  if (to === null) return;
  e.preventDefault();
  activeRow.value = to;
  scanEl.value?.querySelector<HTMLButtonElement>(`[data-row="${to}"]`)?.focus();
}

/** Port → the inputs currently holding it, for the row badges. */
const holders = computed(
  () =>
    new Map(
      scan.value.rows.map((r) => [r.port, slotsHoldingPort(parts.value, props.modelValue, r.port)]),
    ),
);
const rowClass = (port: string) =>
  (holders.value.get(port) ?? []).length ? "bg-salus-500/15" : "";

const fieldClass =
  "h-12 w-full min-w-0 rounded-[16px] border-2 bg-surface-2 px-3.5 font-mono text-sm text-fg placeholder:text-muted-fg focus:border-brand focus:outline-none disabled:opacity-70";
const slotClass = (s: PortSlot) =>
  canPick.value && sameSlot(target.value, s) ? "border-brand/50" : "border-transparent";
</script>

<template>
  <div class="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
    <!-- Scan output -->
    <section
      class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg lg:self-start"
      :aria-labelledby="`${uid}-scan-title`"
    >
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 pt-4 pb-2">
        <UIcon name="i-lucide-radar" class="size-[18px] flex-none" />
        <span :id="`${uid}-scan-title`" class="min-w-0 truncate font-mono text-sm font-semibold">
          {{ title }}
        </span>
        <span class="text-xs whitespace-nowrap text-code-muted">
          {{ scan.rows.length }} open {{ scan.rows.length === 1 ? "port" : "ports" }}
        </span>
      </div>
      <p v-if="canPick" :id="`${uid}-pick-hint`" class="m-0 px-5 pb-2 text-xs text-code-muted">
        Pick a port row (click, or ↑ ↓ and Enter) to fill
        <span class="font-bold text-salus-300">{{ targetLabel }}</span
        >.
      </p>

      <div
        ref="scanEl"
        role="region"
        :tabindex="canPick ? undefined : 0"
        :aria-label="`${title} output`"
        class="relative max-h-[60vh] min-w-0 overflow-auto pt-1 pb-4 font-mono text-[12.5px] leading-[2] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-salus-300"
      >
        <div class="min-w-max">
          <pre class="m-0 px-5 font-mono whitespace-pre">{{ scan.before.join("\n") }}</pre>

          <table v-if="scan.header" class="mx-3 my-1 border-separate border-spacing-0 text-left">
            <caption class="sr-only">
              Open ports
            </caption>
            <thead>
              <tr class="text-code-muted">
                <th scope="col" class="px-2 font-semibold">PORT</th>
                <th scope="col" class="px-2 font-semibold">STATE</th>
                <th scope="col" class="px-2 font-semibold">SERVICE</th>
                <th scope="col" class="px-2 font-semibold">VERSION</th>
                <th scope="col" class="px-2"><span class="sr-only">Used in</span></th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(row, i) in scan.rows"
                :key="`${row.port}/${row.protocol}`"
                class="group"
                :class="canPick ? 'cursor-pointer' : ''"
                @click="pick(i)"
              >
                <th
                  scope="row"
                  class="rounded-l-[10px] px-2 font-normal group-hover:bg-white/8"
                  :class="rowClass(row.port)"
                >
                  <button
                    v-if="canPick"
                    :data-row="i"
                    type="button"
                    :tabindex="i === activeRow ? 0 : -1"
                    :aria-describedby="`${uid}-pick-hint`"
                    class="rounded-[6px] px-1 -mx-1 font-bold text-code-fg focus-visible:outline-2 focus-visible:outline-salus-300"
                    @keydown="onRowKey($event, i)"
                    @focus="activeRow = i"
                  >
                    {{ row.port }}/{{ row.protocol }}
                  </button>
                  <span v-else>{{ row.port }}/{{ row.protocol }}</span>
                </th>
                <td
                  v-for="(cell, ci) in [row.state, row.service, row.version]"
                  :key="ci"
                  class="px-2 whitespace-pre group-hover:bg-white/8"
                  :class="rowClass(row.port)"
                >
                  {{ cell }}
                </td>
                <td
                  class="rounded-r-[10px] px-2 group-hover:bg-white/8"
                  :class="rowClass(row.port)"
                >
                  <span class="flex gap-1">
                    <span
                      v-for="h in holders.get(row.port)"
                      :key="h"
                      class="rounded-full bg-salus-500 px-2 text-[11px] leading-[1.6] font-bold whitespace-nowrap text-white"
                      >{{ h }}</span
                    >
                  </span>
                </td>
              </tr>
            </tbody>
          </table>

          <pre v-if="scan.after.length" class="m-0 px-5 font-mono whitespace-pre">{{
            scan.after.join("\n")
          }}</pre>
        </div>
      </div>
      <span class="sr-only" aria-live="polite" aria-atomic="true">{{ announcement }}</span>
    </section>

    <!-- Scenario and answers -->
    <section class="flex min-w-0 flex-col gap-5 rounded-[28px] bg-surface p-5 sm:p-7 lg:self-start">
      <slot name="heading" />
      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-bold tracking-[0.04em] text-brand-ink uppercase">
          Scenario
        </span>
        <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
          <ExamInlineText :text="payload?.intro ?? ''" />
        </p>
      </div>

      <div v-for="part in parts" :key="part.id" class="flex min-w-0 flex-col gap-2">
        <template v-if="part.kind === 'portPair'">
          <span :id="`${uid}-${part.id}-label`" class="text-sm font-semibold">
            {{ part.id }} · <ExamInlineText :text="part.prompt" />
          </span>
          <div class="grid grid-cols-2 gap-2">
            <div v-for="side in [0, 1] as const" :key="side" class="flex min-w-0 flex-col gap-1">
              <span
                :id="`${slotId({ partId: part.id, side })}-label`"
                class="text-xs font-semibold text-muted-fg"
              >
                {{ side === 0 ? "Cleartext port" : "Secure port" }}
              </span>
              <input
                :id="slotId({ partId: part.id, side })"
                :value="slotValue(modelValue, { partId: part.id, side })"
                :disabled="readOnly"
                :class="[fieldClass, slotClass({ partId: part.id, side })]"
                :aria-labelledby="`${uid}-${part.id}-label ${slotId({ partId: part.id, side })}-label`"
                inputmode="numeric"
                placeholder="e.g. 8080"
                autocomplete="off"
                maxlength="200"
                @focus="target = { partId: part.id, side }"
                @input="onType(part, side, $event)"
              />
            </div>
          </div>
        </template>
        <template v-else>
          <label :for="slotId({ partId: part.id, side: 0 })" class="text-sm font-semibold">
            {{ part.id }} · <ExamInlineText :text="part.prompt" />
          </label>
          <input
            :id="slotId({ partId: part.id, side: 0 })"
            :value="slotValue(modelValue, { partId: part.id, side: 0 })"
            :disabled="readOnly"
            :class="[fieldClass, slotClass({ partId: part.id, side: 0 })]"
            inputmode="numeric"
            placeholder="e.g. 8080"
            autocomplete="off"
            maxlength="200"
            @focus="target = { partId: part.id, side: 0 }"
            @input="onType(part, 0, $event)"
          />
        </template>
        <slot name="part-mark" :part="part" />
      </div>

      <slot name="footer" />
    </section>
  </div>
</template>
