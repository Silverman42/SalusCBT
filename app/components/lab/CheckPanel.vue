<script setup lang="ts">
// "Check your answer" for Labs A–C (T-706, LLD §13.2, LB-6). Lab A and B are
// answer entry; Lab C reads the lab's files as the student left them. The
// expected Lab A and C values are compared as hashes (lib/terminal/checks.ts),
// so the answers are not in the page as text.
import { reactive, ref, useId } from "vue";
import {
  checkLabA,
  checkLabB,
  checkLabC,
  LAB_A_FIELDS,
  type CheckedLab,
  type LabAField,
  type LabCItem,
  type LabCItemResult,
} from "~/lib/terminal/checks";
import type { LabSession } from "~/lib/terminal/seedLab";

const props = defineProps<{ lab: CheckedLab; session: LabSession }>();
const emit = defineEmits<{ result: [passed: boolean] }>();

const id = useId();
const busy = ref(false);

// ---- Lab A
const LAB_A_LABELS: Record<LabAField, { label: string; placeholder: string; mono?: boolean }> = {
  ip: { label: "1. Attacker IP address", placeholder: "e.g. 203.0.113.9", mono: true },
  account: { label: "2. Account it logged in to", placeholder: "user name", mono: true },
  failures: { label: "3. Failed password entries from that IP", placeholder: "a number" },
};
const answersA = reactive<Record<LabAField, string>>({ ip: "", account: "", failures: "" });
const resultA = ref<Record<LabAField, { ok: boolean; empty: boolean }>>();

// ---- Lab B
const answerB = ref("");
const resultB = ref<{ ok: boolean; empty: boolean }>();

// ---- Lab C
const LAB_C_LABELS: Record<LabCItem, string> = {
  shadow: "etc/shadow permissions",
  idRsa: "home/deploy/.ssh/id_rsa permissions",
  permitRootLogin: "PermitRootLogin in etc/ssh/sshd_config",
};
const resultC = ref<LabCItemResult[]>();

const summary = ref<{ ok: boolean; text: string }>();

async function check() {
  if (busy.value) return;
  busy.value = true;
  try {
    if (props.lab === "lab-a") {
      const r = await checkLabA(answersA);
      resultA.value = r;
      const right = LAB_A_FIELDS.filter((f) => r[f].ok).length;
      const ok = right === LAB_A_FIELDS.length;
      summary.value = {
        ok,
        text: ok
          ? "Lab A passed: all three answers are right."
          : `${right} of 3 answers right. Look at the ones marked “Not yet” and try again.`,
      };
      emit("result", ok);
    } else if (props.lab === "lab-b") {
      const r = checkLabB(answerB.value, props.session.tamperedFile);
      resultB.value = r;
      summary.value = r.empty
        ? { ok: false, text: "Type the name of the file that failed the check." }
        : r.ok
          ? { ok: true, text: "Lab B passed: that is the tampered installer." }
          : {
              ok: false,
              text: "Not yet: that file matches its published hash. Look for FAILED in the sha256sum -c output.",
            };
      emit("result", r.ok);
    } else {
      const r = await checkLabC(props.session.vfs);
      resultC.value = r;
      const ok = r.every((x) => x.ok);
      const right = r.filter((x) => x.ok).length;
      summary.value = {
        ok,
        text: ok
          ? "Lab C passed: both files are locked down and root can't log in over SSH."
          : `${right} of 3 fixes done. Run the Verify commands to see what is left.`,
      };
      emit("result", ok);
    }
  } finally {
    busy.value = false;
  }
}

function fieldState(field: LabAField): "ok" | "bad" | undefined {
  const r = resultA.value?.[field];
  if (!r) return undefined;
  return r.ok ? "ok" : "bad";
}
</script>

<template>
  <form
    class="flex flex-col gap-3 rounded-[20px] bg-surface-2 p-4 sm:p-5"
    :aria-labelledby="`${id}-title`"
    novalidate
    @submit.prevent="check"
  >
    <h3 :id="`${id}-title`" class="m-0 text-[15px] font-extrabold">Check your work</h3>

    <template v-if="lab === 'lab-a'">
      <div class="grid gap-3 sm:grid-cols-3">
        <div v-for="field in LAB_A_FIELDS" :key="field" class="flex min-w-0 flex-col gap-1.5">
          <label :for="`${id}-${field}`" class="text-[13px] font-semibold text-muted-fg">
            {{ LAB_A_LABELS[field].label }}
          </label>
          <UInput
            :id="`${id}-${field}`"
            v-model="answersA[field]"
            :name="field"
            autocomplete="off"
            autocapitalize="off"
            spellcheck="false"
            :inputmode="field === 'failures' ? 'numeric' : undefined"
            :maxlength="64"
            size="lg"
            :placeholder="LAB_A_LABELS[field].placeholder"
            :aria-invalid="fieldState(field) === 'bad' ? 'true' : undefined"
            :aria-describedby="fieldState(field) ? `${id}-${field}-state` : undefined"
            class="w-full"
            :ui="{
              base: `h-11 rounded-[14px] bg-surface ring-0 text-[15px] ${LAB_A_LABELS[field].mono ? 'font-mono' : ''}`,
            }"
          />
          <span
            v-if="fieldState(field)"
            :id="`${id}-${field}-state`"
            class="flex items-center gap-1 text-[13px] font-semibold text-fg"
          >
            <UIcon
              :name="fieldState(field) === 'ok' ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
              class="size-4 flex-none"
              :class="fieldState(field) === 'ok' ? 'text-ok' : 'text-bad'"
            />
            {{ fieldState(field) === "ok" ? "Right" : "Not yet" }}
          </span>
        </div>
      </div>
    </template>

    <template v-else-if="lab === 'lab-b'">
      <div class="flex flex-col gap-1.5">
        <label :for="`${id}-file`" class="text-[13px] font-semibold text-muted-fg">
          Which installer was tampered with?
        </label>
        <UInput
          :id="`${id}-file`"
          v-model="answerB"
          name="tamperedFile"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          :maxlength="128"
          size="lg"
          placeholder="file name, e.g. setup.exe"
          :aria-invalid="resultB && !resultB.ok ? 'true' : undefined"
          class="w-full sm:max-w-[360px]"
          :ui="{ base: 'h-11 rounded-[14px] bg-surface ring-0 font-mono text-[15px]' }"
        />
      </div>
    </template>

    <template v-else>
      <p class="m-0 text-[15px] leading-[1.6]">
        Make your fixes in the terminal, then check. The check reads the lab files as they are now.
      </p>
      <ul v-if="resultC" class="m-0 flex list-none flex-col gap-1.5 p-0">
        <li
          v-for="r in resultC"
          :key="r.item"
          class="flex items-start gap-2 text-[14px] leading-snug"
        >
          <UIcon
            :name="r.ok ? 'i-lucide-circle-check' : 'i-lucide-circle-x'"
            class="mt-px size-4 flex-none"
            :class="r.ok ? 'text-ok' : 'text-bad'"
          />
          <span>
            <span class="font-semibold">{{ LAB_C_LABELS[r.item] }}:</span>
            {{ r.ok ? "fixed" : "not yet" }}
            <span class="text-muted-fg"
              >(now <code class="font-mono">{{ r.current }}</code
              >)</span
            >
          </span>
        </li>
      </ul>
    </template>

    <div class="flex flex-wrap items-center gap-3">
      <UButton
        type="submit"
        :loading="busy"
        icon="i-lucide-check"
        :label="lab === 'lab-c' ? 'Check my fixes' : 'Check'"
      />
    </div>

    <div aria-live="polite" aria-atomic="true">
      <p
        v-if="summary"
        class="m-0 flex items-start gap-2 rounded-[14px] px-4 py-3 text-[14px] leading-snug font-semibold text-fg"
        :class="summary.ok ? 'bg-ok-soft' : 'bg-bad-soft'"
        :data-testid="`${lab}-result`"
      >
        <UIcon
          :name="summary.ok ? 'i-lucide-party-popper' : 'i-lucide-info'"
          class="mt-px size-4 flex-none"
        />
        <span>{{ summary.text }}</span>
      </p>
    </div>
  </form>
</template>
