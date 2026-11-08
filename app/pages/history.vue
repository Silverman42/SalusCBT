<script setup lang="ts">
// Student history (T-217, LLD §4, §14.1, PRD EX-19, EX-20). Client only
// (routeRules `/history`): the anon token lives in localStorage. Lists
// `review.myAttempts` newest first, with links to result, review or resume,
// and moves progress between devices with Export / Import. The export file
// is a secret (EX-20); an import replaces this browser's ID only after the
// student confirms.
import { IMPORT_SAME_ID, importConfirmText } from "~/lib/history";
import type { ImportPreview } from "~/composables/useAnonIdentity";

useSeoMeta({
  title: "Your history · Salus",
  description: "Your past Salus mock exam attempts, with export and import of your progress.",
  robots: "noindex",
});

const { token, persistent, ready, exportProgress, importProgress } = useAnonIdentity();
const { pager, rows, firstLoad, loadMore, retry } = useAttemptHistory();

const fileInput = ref<HTMLInputElement | null>(null);
const importError = ref<string | null>(null);
const importDone = ref(false);
const exported = ref(false);
const preview = ref<Extract<ImportPreview, { ok: true }> | null>(null);
const confirmOpen = ref(false);
const reading = ref(false);

function onExport() {
  exportProgress();
  exported.value = true;
}

function pickFile() {
  importError.value = null;
  importDone.value = false;
  fileInput.value?.click();
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  importError.value = null;
  importDone.value = false;
  reading.value = true;
  try {
    const res = await importProgress(file);
    if (!res.ok) {
      importError.value = res.error;
    } else if (res.token === token.value) {
      importError.value = IMPORT_SAME_ID;
    } else {
      preview.value = res;
      confirmOpen.value = true;
    }
  } finally {
    reading.value = false;
  }
}

function confirmImport() {
  preview.value?.confirm();
  preview.value = null;
  confirmOpen.value = false;
  importDone.value = true;
}

watch(confirmOpen, (open) => {
  if (!open) preview.value = null;
});
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[960px] min-w-0 flex-1 flex-col gap-5 px-4 pt-2 pb-12 sm:px-5"
  >
    <div class="flex flex-wrap items-center gap-3">
      <h1 class="m-0 flex-1 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[34px]">
        Your history
      </h1>
      <UButton to="/" icon="i-lucide-play" label="Start mock exam" size="lg" />
    </div>

    <div
      v-if="ready && !persistent"
      role="alert"
      class="flex gap-3 rounded-[22px] bg-warn-soft px-5 py-4 text-fg"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="mt-0.5 size-5 flex-none text-warn"
        aria-hidden="true"
      />
      <p class="m-0 text-[15px] leading-normal font-semibold">
        This browser can't save progress (storage is blocked, for example in a private window). Your
        anonymous ID lasts only until you close this tab: export your progress before you leave.
      </p>
    </div>

    <!-- Move progress (EX-20) -->
    <section
      aria-labelledby="move-progress"
      class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
    >
      <h2 id="move-progress" class="m-0 flex items-center gap-2 text-lg font-extrabold">
        <UIcon name="i-lucide-file-key" class="size-5 text-brand" aria-hidden="true" />
        Keep your progress
      </h2>
      <p class="m-0 text-[15px] leading-[1.55]">
        Your history is tied to the anonymous ID in this browser.
        <strong>Export progress</strong> downloads
        <span class="font-mono text-sm">salus-progress.json</span>;
        <strong>Import progress</strong> on another device (or after clearing this browser) brings
        the same history back.
      </p>
      <div role="note" class="flex gap-3 rounded-[22px] bg-warn-soft px-5 py-4 text-fg">
        <UIcon
          name="i-lucide-triangle-alert"
          class="mt-0.5 size-5 flex-none text-warn"
          aria-hidden="true"
        />
        <p class="m-0 text-[15px] leading-normal font-semibold">
          The file contains your anonymous ID. Anyone who has it can see and continue your attempts,
          so keep it private, like a password.
        </p>
      </div>
      <div class="flex flex-col gap-2 sm:flex-row">
        <UButton
          icon="i-lucide-download"
          label="Export progress"
          size="lg"
          class="justify-center rounded-full"
          :disabled="!token"
          @click="onExport"
        />
        <UButton
          icon="i-lucide-upload"
          label="Import progress"
          size="lg"
          variant="soft"
          class="justify-center rounded-full"
          :loading="reading"
          :disabled="!ready"
          @click="pickFile"
        />
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="hidden"
          aria-hidden="true"
          tabindex="-1"
          @change="onFile"
        />
      </div>
      <p v-if="exported" role="status" class="m-0 text-sm font-semibold text-ok">
        Downloaded salus-progress.json. Store it somewhere private.
      </p>
      <p v-if="importError" role="alert" class="m-0 text-sm font-semibold text-bad">
        {{ importError }}
      </p>
      <p v-if="importDone" role="status" class="m-0 text-sm font-semibold text-ok">
        Progress imported. The history below now comes from the file's anonymous ID.
      </p>
    </section>

    <!-- Attempts (EX-19) -->
    <section aria-labelledby="attempts" class="flex min-w-0 flex-col gap-3">
      <h2 id="attempts" class="m-0 text-xl font-extrabold tracking-[-0.01em]">Attempts</h2>

      <ul v-if="rows.length" class="m-0 flex list-none flex-col gap-2.5 p-0">
        <HistoryAttemptRow v-for="row in rows" :key="row.attemptId" :row="row" />
      </ul>

      <div
        v-if="firstLoad"
        role="status"
        aria-live="polite"
        class="flex items-center gap-3 rounded-[22px] bg-surface px-6 py-6 text-[15px] font-semibold text-muted-fg"
      >
        <UIcon name="i-lucide-loader-circle" class="size-5 animate-spin" aria-hidden="true" />
        Loading your attempts…
      </div>

      <div
        v-else-if="pager.error"
        role="alert"
        class="flex flex-col items-start gap-3 rounded-[22px] bg-surface px-6 py-6"
      >
        <p class="m-0 text-[15px] font-semibold text-bad">{{ pager.error }}</p>
        <UButton icon="i-lucide-rotate-cw" label="Try again" variant="soft" @click="retry" />
      </div>

      <div
        v-else-if="pager.isDone && rows.length === 0"
        class="flex flex-col items-center gap-3 rounded-[28px] bg-surface px-6 py-10 text-center"
      >
        <span class="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
          <UIcon name="i-lucide-history" class="size-6" />
        </span>
        <p class="m-0 text-lg font-extrabold">No attempts yet</p>
        <p class="m-0 max-w-[440px] text-[15px] leading-[1.55] text-pretty text-muted-fg">
          Attempts you start in this browser appear here. Took the exam on another device? Import
          its progress file above.
        </p>
        <UButton to="/" icon="i-lucide-play" label="Start mock exam" size="lg" />
      </div>

      <UButton
        v-if="!pager.isDone && rows.length && !pager.error"
        label="Show older attempts"
        icon="i-lucide-chevron-down"
        variant="soft"
        size="lg"
        class="self-center rounded-full"
        :loading="pager.loading"
        @click="loadMore"
      />
    </section>

    <AdminConfirmDialog
      v-model:open="confirmOpen"
      title="Replace this browser's progress?"
      :description="preview ? importConfirmText(preview) : ''"
      confirm-label="Import and replace"
      cancel-label="Cancel"
      @confirm="confirmImport"
    />
  </section>
</template>
