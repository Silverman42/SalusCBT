<script setup lang="ts">
// Save state from useAttempt (EX-11), announced politely to screen readers.
// "Saving…" only shows when a save takes a moment, so every click doesn't
// flicker (and isn't announced twice).
import type { SyncStatus } from "~/lib/attemptSync";

const props = defineProps<{
  saving: boolean;
  online: boolean;
  persistent: boolean;
  pendingCount: number;
  saveError: string | null;
  syncStatus: SyncStatus;
}>();

const SAVING_DELAY_MS = 600;
const slow = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
const busy = computed(() => props.saving || props.pendingCount > 0);
watch(
  busy,
  (b) => {
    clearTimeout(timer);
    if (!b) slow.value = false;
    else timer = setTimeout(() => (slow.value = true), SAVING_DELAY_MS);
  },
  { immediate: true },
);
onBeforeUnmount(() => clearTimeout(timer));

type Tone = "ok" | "busy" | "warn" | "bad";
const state = computed<{ tone: Tone; icon: string; label: string; short: string }>(() => {
  if (props.syncStatus === "stopped") {
    return {
      tone: "bad",
      icon: "i-lucide-triangle-alert",
      label: "Saving stopped. Your answers are kept on this device.",
      short: "Not saving",
    };
  }
  if (props.syncStatus === "closed") {
    return { tone: "ok", icon: "i-lucide-lock", label: "Exam closed", short: "Closed" };
  }
  if (!props.online) {
    return {
      tone: "warn",
      icon: "i-lucide-cloud-off",
      label: props.persistent
        ? "Offline. Answers are kept on this device and sent when you reconnect."
        : "Offline. Keep this tab open: answers are sent when you reconnect.",
      short: "Offline",
    };
  }
  if (busy.value && props.saveError) {
    return {
      tone: "warn",
      icon: "i-lucide-rotate-cw",
      label: "Not saved yet. Retrying…",
      short: "Retrying",
    };
  }
  if (busy.value && slow.value) {
    return { tone: "busy", icon: "i-lucide-loader-circle", label: "Saving…", short: "Saving" };
  }
  return { tone: "ok", icon: "i-lucide-circle-check", label: "All answers saved", short: "Saved" };
});

const toneClass: Record<Tone, string> = {
  ok: "text-muted-fg",
  busy: "text-muted-fg",
  warn: "text-warn",
  bad: "text-bad",
};
</script>

<template>
  <div
    role="status"
    aria-live="polite"
    class="flex min-w-0 items-center gap-1.5 text-[13px] font-semibold"
    :class="toneClass[state.tone]"
    :title="state.label"
  >
    <UIcon
      :name="state.icon"
      class="size-4 flex-none"
      :class="[state.tone === 'busy' ? 'animate-spin' : '', state.tone === 'ok' ? 'text-ok' : '']"
      aria-hidden="true"
    />
    <span class="sr-only">{{ state.label }}</span>
    <span class="hidden truncate xl:inline" aria-hidden="true">{{ state.short }}</span>
  </div>
</template>
