<script setup lang="ts">
// PBQ 5 / B5: perimeter firewall (T-306). Contract in components/exam/QuestionPbq.vue.
// Layout after mockup screen 04: a network card (intro, requirements, SVG
// diagram), then the rule table with a native port and action <select> per
// rule. The answer always has one { port, action } per payload rule, values
// straight from `portChoices` / `actionChoices` (null when unset).
// In a container narrower than 48rem the table is shown as stacked cards; explicit ARIA table roles
// keep it a table for screen readers when the CSS display changes.
//
// Slot `rule-mark` ({ index }) adds a result column for review marks (T-309).
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, PayloadOf } from "~~/shared/content";
import { setFirewallCell } from "~/lib/examRunner";
import { actionLabel, firewallRows, ruleLabel } from "~/lib/pbq/firewall";
import PbqFirewallNetworkDiagram from "~/components/pbq/firewall/NetworkDiagram.vue";

const props = defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();
const slots = useSlots();

const payload = computed(() => props.question.payload as PayloadOf<"firewall">);
const uid = computed(() => `pbq-${props.question.questionId}`);
const rows = computed(() => firewallRows(payload.value, props.modelValue));
const labelOf = (i: number) => ruleLabel(props.question.displayNumber, i);

function setCell(i: number, field: "port" | "action", e: Event) {
  const choice = (e.target as HTMLSelectElement).value;
  emit(
    "update:modelValue",
    setFirewallCell(props.modelValue, payload.value.rules.length, i, field, choice || null),
  );
}

const selectBase =
  "h-[46px] w-full min-w-0 appearance-none rounded-[14px] border-2 pr-7 pl-3 @3xl:pr-9 @3xl:pl-3.5 @3xl:min-w-[150px] text-sm font-bold focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-70 [&>option]:bg-surface [&>option]:font-normal [&>option]:text-fg";
const UNSET = "border-dashed border-line bg-transparent font-semibold text-muted-fg";
function portClass(port: string | null) {
  return port ? "border-transparent bg-brand-soft font-mono text-brand-ink" : UNSET;
}
function actionClass(action: string | null) {
  if (action === "ALLOW") return "border-ok bg-ok-soft text-fg"; // text-fg: tinted text on -soft is below AA
  if (action === "DENY") return "border-bad bg-bad-soft text-fg";
  return action ? "border-transparent bg-surface-2 text-fg" : UNSET;
}

const headClass = "px-4 py-3 text-left text-xs font-bold tracking-[0.05em] text-muted-fg uppercase";
const cellClass = "@3xl:px-4 @3xl:py-3.5 @3xl:first:rounded-l-[20px] @3xl:last:rounded-r-[20px]";
const stripe = (i: number) => (i % 2 === 1 ? "@3xl:bg-surface-2" : "");
const cardLabel = "text-xs font-semibold text-muted-fg @3xl:hidden";
</script>

<template>
  <div class="flex w-full min-w-0 flex-col gap-4 sm:gap-5">
    <!-- Network -->
    <section
      class="@container flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:px-7 sm:py-6"
    >
      <slot name="heading" />
      <div class="flex min-w-0 flex-col gap-5 @5xl:flex-row @5xl:items-center @5xl:gap-8">
        <div class="flex min-w-0 flex-col gap-2 @5xl:w-[320px] @5xl:flex-none">
          <span class="text-[13px] font-bold tracking-[0.04em] text-brand-ink uppercase">
            Network
          </span>
          <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
            <ExamInlineText :text="payload.intro" />
          </p>
          <ul class="m-0 flex list-disc flex-col gap-1 pl-5 text-[15px] leading-normal">
            <li v-for="(req, i) in payload.requirements" :key="i">
              <ExamInlineText :text="req" />
            </li>
          </ul>
        </div>
        <PbqFirewallNetworkDiagram
          :id="`${uid}-diagram`"
          :diagram="payload.diagram"
          class="min-w-0 flex-1"
        />
      </div>
    </section>

    <!-- Rules -->
    <section class="@container flex min-w-0 flex-col gap-1 rounded-[28px] bg-surface p-3">
      <table
        role="table"
        class="w-full border-separate border-spacing-0 @max-3xl:block"
        :aria-describedby="`${uid}-rules-hint`"
      >
        <caption class="sr-only">
          Firewall rules, processed top to bottom
        </caption>
        <thead role="rowgroup" class="@max-3xl:sr-only">
          <tr role="row">
            <th role="columnheader" scope="col" :class="headClass" class="w-[60px]">Rule</th>
            <th role="columnheader" scope="col" :class="headClass">Source</th>
            <th role="columnheader" scope="col" :class="headClass">Destination</th>
            <th role="columnheader" scope="col" :class="headClass" class="w-[80px]">Protocol</th>
            <th role="columnheader" scope="col" :class="headClass" class="w-[170px]">Port</th>
            <th role="columnheader" scope="col" :class="headClass" class="w-[170px]">Action</th>
            <th
              v-if="slots['rule-mark']"
              role="columnheader"
              scope="col"
              :class="headClass"
              class="w-[160px]"
            >
              Result
            </th>
          </tr>
        </thead>
        <tbody role="rowgroup" class="@max-3xl:flex @max-3xl:flex-col @max-3xl:gap-2">
          <tr
            v-for="(rule, i) in payload.rules"
            :key="i"
            role="row"
            class="@max-3xl:grid @max-3xl:grid-cols-2 @max-3xl:gap-x-3 @max-3xl:gap-y-3 @max-3xl:rounded-[20px] @max-3xl:px-3 @max-3xl:py-3.5"
            :class="
              i % 2 === 1
                ? 'bg-surface-2 @3xl:bg-transparent'
                : '@max-3xl:border-2 @max-3xl:border-surface-2'
            "
          >
            <th
              role="rowheader"
              scope="row"
              :class="[cellClass, stripe(i)]"
              class="text-left font-extrabold text-brand-ink @max-3xl:col-span-2"
            >
              <span class="sr-only">Rule </span>{{ labelOf(i) }}
            </th>
            <td role="cell" :class="[cellClass, stripe(i)]" class="flex-col gap-0.5 @max-3xl:flex">
              <span :class="cardLabel" aria-hidden="true">Source</span>
              <span class="font-mono text-sm break-words">{{ rule.source }}</span>
            </td>
            <td role="cell" :class="[cellClass, stripe(i)]" class="flex-col gap-0.5 @max-3xl:flex">
              <span :class="cardLabel" aria-hidden="true">Destination</span>
              <span class="font-mono text-sm break-words">{{ rule.destination }}</span>
            </td>
            <td
              role="cell"
              :class="[cellClass, stripe(i)]"
              class="flex-col gap-0.5 @max-3xl:col-span-2 @max-3xl:flex"
            >
              <span :class="cardLabel" aria-hidden="true">Protocol</span>
              <span class="font-mono text-sm">{{ rule.protocol }}</span>
            </td>
            <td role="cell" :class="[cellClass, stripe(i)]" class="flex-col gap-1 @max-3xl:flex">
              <label
                :for="`${uid}-r${i}-port`"
                class="text-xs font-semibold text-muted-fg @3xl:sr-only"
              >
                <span class="sr-only">{{ `Rule ${labelOf(i)} ` }}</span
                >Port
              </label>
              <div class="relative">
                <select
                  :id="`${uid}-r${i}-port`"
                  :value="rows[i]?.port ?? ''"
                  :disabled="readOnly"
                  :class="[selectBase, portClass(rows[i]?.port ?? null)]"
                  @change="setCell(i, 'port', $event)"
                >
                  <option value="">Choose port</option>
                  <option v-for="port in payload.portChoices" :key="port" :value="port">
                    {{ port }}
                  </option>
                </select>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="pointer-events-none absolute top-1/2 right-2.5 size-4 @3xl:right-3.5 -translate-y-1/2"
                  aria-hidden="true"
                />
              </div>
            </td>
            <td role="cell" :class="[cellClass, stripe(i)]" class="flex-col gap-1 @max-3xl:flex">
              <label
                :for="`${uid}-r${i}-action`"
                class="text-xs font-semibold text-muted-fg @3xl:sr-only"
              >
                <span class="sr-only">{{ `Rule ${labelOf(i)} ` }}</span
                >Action
              </label>
              <div class="relative">
                <select
                  :id="`${uid}-r${i}-action`"
                  :value="rows[i]?.action ?? ''"
                  :disabled="readOnly"
                  :class="[selectBase, actionClass(rows[i]?.action ?? null)]"
                  @change="setCell(i, 'action', $event)"
                >
                  <option value="">Choose action</option>
                  <option v-for="action in payload.actionChoices" :key="action" :value="action">
                    {{ actionLabel(action) }}
                  </option>
                </select>
                <UIcon
                  name="i-lucide-chevron-down"
                  class="pointer-events-none absolute top-1/2 right-2.5 size-4 @3xl:right-3.5 -translate-y-1/2"
                  aria-hidden="true"
                />
              </div>
            </td>
            <td
              v-if="slots['rule-mark']"
              role="cell"
              :class="[cellClass, stripe(i)]"
              class="@max-3xl:col-span-2"
            >
              <slot name="rule-mark" :index="i" />
            </td>
          </tr>
        </tbody>
      </table>
      <p :id="`${uid}-rules-hint`" class="m-0 px-4 pt-1 text-[13px] text-muted-fg">
        A rule scores only if both port and action are correct.
      </p>
      <div class="p-2">
        <slot name="footer" />
      </div>
    </section>
  </div>
</template>
