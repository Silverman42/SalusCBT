<script setup lang="ts">
// Share / copy / revoke for one submitted attempt (CL-9), for the student
// result page (T-215 drops it into `ResultSummary`'s `#actions` slot).
// Client only: it needs the anon token from localStorage.
import type { Id } from "~~/convex/_generated/dataModel";
import { api } from "~~/convex/_generated/api";
import { errorCodeOf } from "~/lib/attemptSync";
import { shareUrl } from "~/lib/resultView";

const props = defineProps<{ attemptId: string }>();

const { $convex } = useNuxtApp();
const { token } = useAnonIdentity();

const publicId = ref<string | null>(null);
const loading = ref(true);
const busy = ref(false);
const copied = ref(false);
const error = ref<string | null>(null);

const url = computed(() =>
  publicId.value && import.meta.client ? shareUrl(window.location.origin, publicId.value) : "",
);

function message(err: unknown): string {
  switch (errorCodeOf(err)) {
    case "RATE_LIMITED":
      return "You've made a lot of share links today. Try again tomorrow.";
    case "NOT_FOUND":
      return "We couldn't find that result in this browser.";
    default:
      return "Something went wrong. Try again.";
  }
}

watch(
  token,
  async (tok) => {
    if (!tok) return;
    loading.value = true;
    try {
      const link = await $convex.query(api.shareLinks.forAttempt, {
        attemptId: props.attemptId as Id<"attempts">,
        anonToken: tok,
      });
      publicId.value = link?.publicId ?? null;
    } catch (err) {
      error.value = message(err);
    } finally {
      loading.value = false;
    }
  },
  { immediate: true },
);

async function create() {
  if (!token.value) return;
  busy.value = true;
  error.value = null;
  try {
    const res = await $convex.mutation(api.shareLinks.create, {
      attemptId: props.attemptId as Id<"attempts">,
      anonToken: token.value,
    });
    publicId.value = res.publicId;
  } catch (err) {
    error.value = message(err);
  } finally {
    busy.value = false;
  }
}

async function revoke() {
  if (!token.value || !publicId.value) return;
  busy.value = true;
  error.value = null;
  try {
    await $convex.mutation(api.shareLinks.revoke, {
      publicId: publicId.value,
      anonToken: token.value,
    });
    publicId.value = null;
    copied.value = false;
  } catch (err) {
    error.value = message(err);
  } finally {
    busy.value = false;
  }
}

async function copy() {
  try {
    await navigator.clipboard.writeText(url.value);
    copied.value = true;
    setTimeout(() => (copied.value = false), 2000);
  } catch {
    error.value = "Couldn't copy. Select the link and copy it yourself.";
  }
}
</script>

<template>
  <div class="flex flex-col gap-3 rounded-[28px] bg-surface px-6 py-[22px]">
    <span class="flex items-center gap-2 font-extrabold">
      <UIcon name="i-lucide-share-2" class="size-[18px] text-brand-ink" />Share this result
    </span>
    <p class="m-0 text-[13px] leading-normal text-muted-fg">
      Anyone with the link sees your score, domains and full review with the answers. No name or
      class is shown. You can revoke it from this browser.
    </p>
    <template v-if="publicId">
      <label class="sr-only" for="share-url">Share link</label>
      <input
        id="share-url"
        readonly
        :value="url"
        class="w-full rounded-[16px] bg-surface-2 px-4 py-3 font-mono text-[13px] text-fg"
        @focus="($event.target as HTMLInputElement).select()"
      />
      <div class="flex flex-wrap gap-2">
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-copy'"
          :label="copied ? 'Copied' : 'Copy link'"
          @click="copy"
        />
        <UButton
          icon="i-lucide-link-2-off"
          label="Revoke"
          color="error"
          variant="soft"
          :loading="busy"
          @click="revoke"
        />
      </div>
    </template>
    <UButton
      v-else
      icon="i-lucide-share-2"
      label="Create share link"
      variant="soft"
      size="lg"
      block
      :loading="busy || loading"
      :disabled="!token"
      @click="create"
    />
    <p v-if="error" role="alert" class="m-0 text-sm font-semibold text-bad">{{ error }}</p>
  </div>
</template>
