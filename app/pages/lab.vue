<script setup lang="ts">
// Practice lab (T-706, LB-1 to LB-9, mockup screen 12): Labs A–C in an
// in-browser terminal with checks, a reset and the cheat sheet; Lab D and the
// build-lab.sh download (T-308) for the student's own machine.
//
// The virtual lab is built on the client (seedLab uses Web Crypto and random
// bytes) and kept in memory only (LLD §13.2). "Reset lab" builds it again.
import { computed, markRaw, nextTick, onMounted, reactive, ref, shallowRef } from "vue";
import {
  browserLabStep,
  LAB_INSTRUCTIONS_URL,
  LAB_SCAN_WARNING,
  LAB_SCRIPT_URL,
  LAB_STEPS,
  LAB_WHERE_TO_RUN,
  type LabStep,
} from "#shared/lab";
import type { CheckedLab } from "~/lib/terminal/checks";
import { Shell } from "~/lib/terminal/runner";
import { seedLab, type LabSession } from "~/lib/terminal/seedLab";

useSeoMeta({
  title: "Practice lab · Salus",
  description:
    "Practise Security+ log, hash and permission tasks in an in-browser Linux terminal, or download build-lab.sh for your own machine.",
});

type TabId = CheckedLab | "lab-d";

const step = (id: string): LabStep => {
  const s = LAB_STEPS.find((x) => x.id === id);
  if (!s) throw new Error(`missing lab step ${id}`);
  return s;
};

const TABS: { value: TabId; label: string; topic: string; slot: TabId }[] = [
  { value: "lab-a", label: "Lab A", topic: "Logs", slot: "lab-a" },
  { value: "lab-b", label: "Lab B", topic: "Hashes", slot: "lab-b" },
  { value: "lab-c", label: "Lab C", topic: "Permissions", slot: "lab-c" },
  { value: "lab-d", label: "Lab D", topic: "Download", slot: "lab-d" },
];
const CHECKED: CheckedLab[] = ["lab-a", "lab-b", "lab-c"];
const browserSteps = Object.fromEntries(
  CHECKED.map((id) => [id, browserLabStep(step(id))]),
) as Record<CheckedLab, LabStep>;

const tab = ref<TabId>("lab-a");
const passed = reactive<Record<CheckedLab, boolean>>({
  "lab-a": false,
  "lab-b": false,
  "lab-c": false,
});

const session = shallowRef<LabSession>();
const shell = shallowRef<Shell>();
/** Bumped on reset so the check forms start empty. */
const generation = ref(0);
const loadError = ref(false);
const resetOpen = ref(false);
const resetting = ref(false);
const terminal = ref<{ focus: () => void }>();

const banner = computed(() =>
  generation.value === 0
    ? "Welcome to the Salus practice lab. Type 'help' to list the commands."
    : "Lab reset: every file was rebuilt and Lab B has a new tampered installer.",
);

async function build() {
  const s = await seedLab();
  session.value = markRaw(s);
  shell.value = markRaw(new Shell({ vfs: s.vfs }));
}

onMounted(async () => {
  try {
    await build();
  } catch {
    loadError.value = true;
  }
});

async function reset() {
  resetting.value = true;
  try {
    generation.value += 1;
    await build();
    for (const id of CHECKED) passed[id] = false;
    resetOpen.value = false;
    await nextTick();
    terminal.value?.focus();
  } catch {
    loadError.value = true;
  } finally {
    resetting.value = false;
  }
}

function openLabD() {
  tab.value = "lab-d";
  void nextTick(() =>
    document.getElementById("lab-tabs")?.scrollIntoView({ block: "start", behavior: "auto" }),
  );
}
</script>

<template>
  <section
    class="mx-auto grid w-full max-w-[1280px] min-w-0 gap-5 px-4 pt-2 pb-12 sm:px-5 lg:grid-cols-[minmax(0,1fr)_360px]"
  >
    <div class="flex min-w-0 flex-col gap-5">
      <!-- Banner, after mockup screen 12 -->
      <div class="flex items-center overflow-hidden rounded-[28px] bg-salus-500 text-white">
        <div class="flex min-w-0 flex-1 flex-col gap-2 px-6 py-7 sm:px-8">
          <span class="text-[13px] font-bold tracking-[0.06em] text-salus-100 uppercase">
            Practice · untimed
          </span>
          <h1
            class="m-0 text-[26px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[32px]"
          >
            Practice lab
          </h1>
          <p class="m-0 text-[15px] leading-[1.55] text-pretty text-salus-100">
            Type real Linux commands in the terminal: read an auth log, verify installer hashes and
            fix file permissions. Lab D scans your own machine, so it stays a download.
          </p>
        </div>
        <svg
          viewBox="0 0 300 150"
          class="hidden h-[150px] w-[300px] flex-none sm:block"
          aria-hidden="true"
        >
          <circle cx="230" cy="40" r="110" fill="#7457FF" />
          <rect x="60" y="30" width="190" height="110" rx="22" fill="#3A1FC9" />
          <circle cx="82" cy="50" r="5" fill="#C3B6FF" />
          <circle cx="98" cy="50" r="5" fill="#9C88FF" />
          <circle cx="114" cy="50" r="5" fill="#7457FF" />
          <path
            d="M82 80 l12 10 l-12 10"
            fill="none"
            stroke="#fff"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <rect x="104" y="84" width="80" height="11" rx="5.5" fill="#9C88FF" />
          <rect x="82" y="110" width="120" height="11" rx="5.5" fill="#7457FF" />
          <circle cx="250" cy="118" r="30" fill="#fff" />
          <circle cx="246" cy="114" r="11" fill="none" stroke="#6140FF" stroke-width="5" />
          <path d="M254 122 L264 132" stroke="#6140FF" stroke-width="5" stroke-linecap="round" />
        </svg>
      </div>

      <div id="lab-tabs" class="flex min-w-0 scroll-mt-4 flex-col gap-4">
        <UTabs
          v-model="tab"
          :items="TABS"
          :unmount-on-hide="false"
          variant="pill"
          :ui="{
            root: 'gap-4',
            list: 'w-full overflow-x-auto rounded-full bg-surface-2 p-[5px]',
            indicator: 'rounded-full',
            trigger: 'flex-none rounded-full px-4 py-2 text-[14px] font-semibold sm:flex-1',
            content: 'min-w-0 flex flex-col gap-4',
          }"
        >
          <template #default="{ item }">
            {{ item.label }}<span class="hidden sm:inline"> · {{ item.topic }}</span>
          </template>
          <template #trailing="{ item }">
            <template v-if="item.value !== 'lab-d' && passed[item.value as CheckedLab]">
              <UIcon name="i-lucide-circle-check" class="size-4 flex-none" />
              <span class="sr-only">, passed</span>
            </template>
          </template>

          <template v-for="id in CHECKED" :key="id" #[id]>
            <LabStepCard :step="browserSteps[id]">
              <LabCheckPanel
                v-if="session"
                :key="`${id}-${generation}`"
                :lab="id"
                :session="session"
                @result="(ok: boolean) => (passed[id] = ok)"
              />
            </LabStepCard>
          </template>

          <template #lab-d>
            <!-- LB-9: the warning comes before the download link. -->
            <div role="note" class="flex gap-3 rounded-[24px] bg-warn-soft px-5 py-4 text-warn">
              <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 flex-none" />
              <p class="m-0 text-[15px] leading-normal font-semibold">{{ LAB_SCAN_WARNING }}</p>
            </div>

            <div
              class="flex flex-col gap-4 rounded-[28px] bg-surface p-5 sm:flex-row sm:items-center sm:p-6"
            >
              <div class="flex min-w-0 flex-1 items-center gap-3">
                <span
                  class="grid size-11 flex-none place-items-center rounded-[14px] bg-brand-soft text-brand-ink"
                >
                  <UIcon name="i-lucide-terminal" class="size-5" />
                </span>
                <div class="flex min-w-0 flex-col">
                  <span class="font-mono text-[15px] font-semibold">build-lab.sh</span>
                  <span class="text-sm text-muted-fg">Bash script · creates ~/secplus-lab</span>
                </div>
              </div>
              <div class="flex flex-wrap gap-2">
                <UButton
                  :to="LAB_SCRIPT_URL"
                  external
                  download="build-lab.sh"
                  icon="i-lucide-download"
                  size="lg"
                  label="Download build-lab.sh"
                />
                <UButton
                  :to="LAB_INSTRUCTIONS_URL"
                  external
                  download
                  icon="i-lucide-file-text"
                  size="lg"
                  variant="soft"
                  label="Instructions (.md)"
                />
              </div>
            </div>

            <p class="m-0 text-[15px] leading-[1.6] text-muted-fg">
              <LabInlineCode :text="LAB_WHERE_TO_RUN" />
            </p>

            <LabStepCard :step="step('build')" />
            <LabStepCard :step="step('lab-d')" />
          </template>
        </UTabs>

        <div class="flex flex-wrap items-center justify-between gap-3">
          <h2 class="m-0 text-lg font-extrabold tracking-[-0.01em]">Terminal</h2>
          <UButton
            icon="i-lucide-refresh-cw"
            color="neutral"
            variant="soft"
            label="Reset lab"
            :disabled="!session"
            @click="resetOpen = true"
          />
        </div>

        <LabTerminal v-if="shell" ref="terminal" :shell="shell" :banner="banner" />
        <div
          v-else
          class="grid h-[300px] place-items-center rounded-[28px] bg-code px-6 text-center font-mono text-[13.5px] text-code-fg"
          role="status"
        >
          <span v-if="loadError">
            The lab couldn't start in this browser. Download build-lab.sh from the Lab D tab
            instead.
          </span>
          <span v-else class="inline-flex items-center gap-2">
            <UIcon name="i-lucide-loader-circle" class="size-4 motion-safe:animate-spin" />
            Building the lab…
          </span>
        </div>
      </div>
    </div>

    <aside class="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:self-start">
      <LabCheatSheet />
      <button
        type="button"
        class="flex items-center gap-3 rounded-[24px] bg-brand-soft px-[18px] py-4 text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
        @click="openLabD"
      >
        <UIcon name="i-lucide-download" class="size-5 flex-none text-brand-ink" />
        <span class="flex min-w-0 flex-1 flex-col">
          <span class="text-[14px] font-extrabold text-brand-ink">build-lab.sh</span>
          <span class="text-[12.5px] text-fg">Lab D and the download: machines you own only</span>
        </span>
        <UIcon name="i-lucide-chevron-right" class="size-4 flex-none text-brand-ink" />
      </button>
    </aside>

    <UModal
      v-model:open="resetOpen"
      title="Reset the lab?"
      description="Every file is rebuilt, as running build-lab.sh again does. Your Lab C fixes are undone, Lab B gets a new tampered installer and your check results are cleared."
      :dismissible="!resetting"
    >
      <template #footer>
        <div class="flex w-full flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <UButton
            color="neutral"
            variant="soft"
            label="Keep working"
            :disabled="resetting"
            autofocus
            @click="resetOpen = false"
          />
          <UButton
            icon="i-lucide-refresh-cw"
            label="Reset lab"
            :loading="resetting"
            data-testid="confirm-reset"
            @click="reset"
          />
        </div>
      </template>
    </UModal>
  </section>
</template>
