<script setup lang="ts">
// Header "Sign out" (AU-4). Browser only: render inside <ClientOnly> on
// staff pages, which are client-rendered anyway.
import { ref } from "vue";
import { useAuth } from "~/composables/useAuth";

const auth = useAuth();
const busy = ref(false);

async function signOut() {
  if (busy.value) return;
  busy.value = true;
  try {
    await auth.signOut();
  } finally {
    busy.value = false;
    // Even if the request failed, leave the staff area; its guard checks again.
    await navigateTo("/sign-in", { replace: true });
  }
}
</script>

<template>
  <button
    type="button"
    class="flex items-center gap-2 rounded-full border-[1.5px] border-line px-4 py-[11px] text-sm font-semibold whitespace-nowrap text-fg hover:border-brand disabled:opacity-60 sm:px-5"
    :disabled="busy"
    @click="signOut"
  >
    <UIcon name="i-lucide-log-out" class="size-4" />
    {{ busy ? "Signing out…" : "Sign out" }}
  </button>
</template>
