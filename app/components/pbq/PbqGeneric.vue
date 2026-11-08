<script setup lang="ts">
// Generic PBQ view for every template until T-302 to T-306 add the dedicated
// components (contract in components/exam/QuestionPbq.vue). Layout after
// mockup screens 03 (artefacts left, answers right) and 04 (firewall rules).
// Artefacts are plain <pre> text; nothing is parsed or highlighted yet.
import type { AttemptPaperPbq } from "~/composables/useAttempt";
import type { AnswerValue, PbqPart } from "~~/shared/content";
import { optionLetter, setFirewallCell, setPbqPart } from "~/lib/examRunner";

const props = defineProps<{
  question: AttemptPaperPbq;
  modelValue: AnswerValue | undefined;
  readOnly: boolean;
}>();
const emit = defineEmits<{
  "update:modelValue": [value: AnswerValue | null, opts?: { debounce?: boolean }];
}>();

const payload = computed(() => props.question.payload);
const uid = computed(() => `pbq-${props.question.questionId}`);

/** Read-only artefacts shown in the dark code panel. */
const artefacts = computed<{ title: string; text: string }[]>(() => {
  const p = payload.value;
  switch (p.template) {
    case "sshLog":
      return [{ title: "/var/log/auth.log", text: p.log }];
    case "nmap":
      return [{ title: "nmap -sV", text: p.scan }];
    case "hashCheck":
      return [
        { title: "vendor_hashes.txt", text: p.vendorHashes },
        { title: "sha256sum", text: p.computed },
      ];
    case "permissions":
      return [
        { title: "ls -l", text: p.listings },
        { title: "sshd_config", text: p.sshdConfig },
      ];
    case "firewall":
      return [];
  }
  return [];
});

const parts = computed<PbqPart[]>(() =>
  payload.value.template === "firewall" ? [] : payload.value.parts,
);
const lineCount = (text: string) => text.split("\n").length;

// --- part answers ----------------------------------------------------------

function partAnswer(id: string): string | string[] | undefined {
  return props.modelValue?.kind === "pbq" ? props.modelValue.parts[id] : undefined;
}
function textOf(id: string): string {
  const a = partAnswer(id);
  return typeof a === "string" ? a : "";
}
function pairOf(id: string, i: 0 | 1): string {
  const a = partAnswer(id);
  return Array.isArray(a) ? (a[i] ?? "") : "";
}
function setText(id: string, value: string, debounce: boolean) {
  emit("update:modelValue", setPbqPart(props.modelValue, id, value), { debounce });
}
function setPair(id: string, i: 0 | 1, value: string) {
  const pair = [pairOf(id, 0), pairOf(id, 1)];
  pair[i] = value;
  const answer = pair[0] === "" && pair[1] === "" ? [] : pair;
  emit("update:modelValue", setPbqPart(props.modelValue, id, answer), { debounce: true });
}
const inputValue = (e: Event) => (e.target as HTMLInputElement).value;

const INPUT_MODE: Partial<Record<PbqPart["kind"], "numeric" | "decimal" | "text">> = {
  integer: "numeric",
  octal: "numeric",
  port: "numeric",
  portPair: "numeric",
};
const PLACEHOLDER: Partial<Record<PbqPart["kind"], string>> = {
  ip: "e.g. 192.0.2.10",
  integer: "e.g. 12",
  octal: "e.g. 0644",
  port: "e.g. 8080",
  directive: "Directive name",
  path: "e.g. /etc/example",
};
const isPractice = (part: PbqPart) => "scored" in part && !part.scored;

// --- firewall --------------------------------------------------------------

function ruleCell(i: number, field: "port" | "action"): string {
  const rules = props.modelValue?.kind === "firewall" ? props.modelValue.rules : [];
  return rules[i]?.[field] ?? "";
}
function setRule(i: number, field: "port" | "action", e: Event) {
  if (payload.value.template !== "firewall") return;
  const v = (e.target as HTMLSelectElement).value;
  emit(
    "update:modelValue",
    setFirewallCell(props.modelValue, payload.value.rules.length, i, field, v || null),
  );
}
const ruleLabel = (i: number) => `${props.question.displayNumber}${String.fromCharCode(97 + i)}`;

const fieldClass =
  "w-full min-w-0 rounded-[16px] border-2 border-transparent bg-surface-2 px-3.5 text-sm text-fg placeholder:text-muted-fg focus:border-brand focus:outline-none disabled:opacity-70";
</script>

<template>
  <!-- Firewall (mockup screen 04) -->
  <div v-if="payload.template === 'firewall'" class="flex min-w-0 flex-col gap-4 sm:gap-5">
    <section class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:px-7 sm:py-6">
      <slot name="heading" />
      <div class="flex min-w-0 flex-col gap-5 lg:flex-row lg:gap-8">
        <div class="flex min-w-0 flex-col gap-2 lg:w-[340px] lg:flex-none">
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
        <pre
          tabindex="0"
          aria-label="Network diagram"
          class="m-0 min-w-0 flex-1 overflow-x-auto rounded-[24px] bg-code p-4 font-mono text-[12.5px] leading-relaxed text-code-fg"
          >{{ payload.diagram }}</pre>
      </div>
    </section>

    <section
      class="flex min-w-0 flex-col gap-1 rounded-[28px] bg-surface p-3"
      aria-label="Firewall rules"
    >
      <div
        class="hidden grid-cols-[60px_1fr_180px_180px] gap-4 px-4 py-3 text-xs font-bold tracking-[0.05em] text-muted-fg uppercase md:grid"
        aria-hidden="true"
      >
        <span>Rule</span><span>Traffic</span><span>Port</span><span>Action</span>
      </div>
      <div
        v-for="(rule, i) in payload.rules"
        :key="i"
        class="grid grid-cols-[48px_1fr] items-center gap-x-3 gap-y-3 rounded-[20px] px-3 py-3.5 md:grid-cols-[60px_1fr_180px_180px] md:gap-4 md:px-4"
        :class="i % 2 === 1 ? 'bg-surface-2' : ''"
      >
        <span class="font-extrabold text-brand-ink">{{ ruleLabel(i) }}</span>
        <span class="min-w-0 font-mono text-sm break-words">
          {{ rule.source }} → {{ rule.destination }} · {{ rule.protocol }}
        </span>
        <label class="col-span-2 flex flex-col gap-1 md:col-span-1">
          <span class="text-xs font-semibold text-muted-fg md:sr-only">
            Rule {{ ruleLabel(i) }} port
          </span>
          <select
            :value="ruleCell(i, 'port')"
            :disabled="readOnly"
            :class="fieldClass"
            class="h-[46px] font-bold"
            @change="setRule(i, 'port', $event)"
          >
            <option value="">Choose port</option>
            <option v-for="port in payload.portChoices" :key="port" :value="port">
              {{ port }}
            </option>
          </select>
        </label>
        <label class="col-span-2 flex flex-col gap-1 md:col-span-1">
          <span class="text-xs font-semibold text-muted-fg md:sr-only">
            Rule {{ ruleLabel(i) }} action
          </span>
          <select
            :value="ruleCell(i, 'action')"
            :disabled="readOnly"
            :class="fieldClass"
            class="h-[46px] font-bold"
            @change="setRule(i, 'action', $event)"
          >
            <option value="">Choose action</option>
            <option v-for="action in payload.actionChoices" :key="action" :value="action">
              {{ action === "ALLOW" ? "Allow" : action === "DENY" ? "Deny" : action }}
            </option>
          </select>
        </label>
      </div>
      <div class="p-2">
        <slot name="footer" />
      </div>
    </section>
  </div>

  <!-- Text, port, pick and MCQ parts (mockup screen 03) -->
  <div v-else class="grid min-w-0 gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_420px]">
    <div class="flex min-w-0 flex-col gap-4 sm:gap-5 lg:order-1">
      <section
        v-for="art in artefacts"
        :key="art.title"
        class="flex min-w-0 flex-col overflow-hidden rounded-[28px] bg-code text-code-fg"
      >
        <div class="flex items-center gap-3 px-5 py-4">
          <UIcon name="i-lucide-file-text" class="size-[18px] flex-none" />
          <span class="min-w-0 truncate font-mono text-sm font-semibold">{{ art.title }}</span>
          <span class="text-xs whitespace-nowrap text-code-muted">
            {{ lineCount(art.text) }} lines
          </span>
        </div>
        <pre
          tabindex="0"
          :aria-label="art.title"
          class="m-0 max-h-[60vh] min-w-0 overflow-auto px-5 pt-1 pb-4 font-mono text-[12.5px] leading-[2] focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-salus-300"
          >{{ art.text }}</pre>
      </section>
    </div>

    <section
      class="flex min-w-0 flex-col gap-5 rounded-[28px] bg-surface p-5 sm:p-7 lg:order-2 lg:self-start"
    >
      <slot name="heading" />
      <div class="flex flex-col gap-2">
        <span class="text-[13px] font-bold tracking-[0.04em] text-brand-ink uppercase">
          Scenario
        </span>
        <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
          <ExamInlineText :text="payload.intro" />
        </p>
      </div>

      <div v-for="part in parts" :key="part.id" class="flex min-w-0 flex-col gap-2">
        <!-- MCQ part (hashCheck 3b, 3c) -->
        <fieldset v-if="part.kind === 'mcq'" class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend class="mb-2 p-0 text-sm font-semibold">
            {{ part.id }} · <ExamInlineText :text="part.prompt" />
          </legend>
          <label
            v-for="(opt, oi) in part.options"
            :key="opt.id"
            class="flex cursor-pointer items-center gap-3 rounded-[16px] border-2 px-3 py-2.5 text-[15px] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand"
            :class="textOf(part.id) === opt.id ? 'border-brand bg-brand-soft' : 'border-line'"
          >
            <input
              type="radio"
              class="sr-only"
              :name="`${uid}-${part.id}`"
              :value="opt.id"
              :checked="textOf(part.id) === opt.id"
              :disabled="readOnly"
              @change="setText(part.id, opt.id, false)"
            />
            <span
              class="grid size-7 flex-none place-items-center rounded-[8px] text-[13px] font-bold"
              :class="
                textOf(part.id) === opt.id ? 'bg-brand text-white' : 'bg-surface-2 text-muted-fg'
              "
              aria-hidden="true"
              >{{ optionLetter(oi) }}</span
            >
            <span class="min-w-0 flex-1"><ExamInlineText :text="opt.text" /></span>
          </label>
        </fieldset>

        <template v-else>
          <label
            :id="`${uid}-${part.id}-label`"
            :for="`${uid}-${part.id}`"
            class="flex flex-wrap items-center gap-2 text-sm font-semibold"
          >
            <span>{{ part.id }} · <ExamInlineText :text="part.prompt" /></span>
            <span
              v-if="isPractice(part)"
              class="rounded-full bg-surface-2 px-2.5 py-[3px] text-[11px] font-bold text-muted-fg"
            >
              Practice · not scored
            </span>
          </label>

          <select
            v-if="part.kind === 'pick'"
            :id="`${uid}-${part.id}`"
            :value="textOf(part.id)"
            :disabled="readOnly"
            :class="fieldClass"
            class="h-12"
            @change="setText(part.id, inputValue($event), false)"
          >
            <option value="">Choose a file</option>
            <option v-for="c in part.choices" :key="c" :value="c">{{ c }}</option>
          </select>

          <div v-else-if="part.kind === 'portPair'" class="grid grid-cols-2 gap-2">
            <div v-for="side in [0, 1] as const" :key="side" class="flex min-w-0 flex-col gap-1">
              <span :id="`${uid}-${part.id}-${side}`" class="text-xs font-semibold text-muted-fg">
                {{ side === 0 ? "Cleartext port" : "Secure port" }}
              </span>
              <input
                :id="side === 0 ? `${uid}-${part.id}` : undefined"
                :value="pairOf(part.id, side)"
                :disabled="readOnly"
                :class="fieldClass"
                class="h-12 font-mono"
                :aria-labelledby="`${uid}-${part.id}-label ${uid}-${part.id}-${side}`"
                inputmode="numeric"
                autocomplete="off"
                maxlength="200"
                @input="setPair(part.id, side, inputValue($event))"
              />
            </div>
          </div>

          <textarea
            v-else-if="isPractice(part)"
            :id="`${uid}-${part.id}`"
            :value="textOf(part.id)"
            :disabled="readOnly"
            :class="fieldClass"
            class="min-h-[72px] py-3 font-mono"
            rows="2"
            spellcheck="false"
            autocapitalize="off"
            maxlength="200"
            @input="setText(part.id, inputValue($event), true)"
          />

          <input
            v-else
            :id="`${uid}-${part.id}`"
            :value="textOf(part.id)"
            :disabled="readOnly"
            :class="fieldClass"
            class="h-12 font-mono"
            :inputmode="INPUT_MODE[part.kind] ?? 'text'"
            :placeholder="PLACEHOLDER[part.kind]"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            maxlength="200"
            @input="setText(part.id, inputValue($event), true)"
          />
        </template>
      </div>

      <slot name="footer" />
    </section>
  </div>
</template>
