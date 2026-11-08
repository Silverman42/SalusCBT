<script setup lang="ts">
// Copies `text` to the clipboard and confirms with a toast (class codes and
// join links, CL-1). The icon switches to a tick for two seconds.
import { onScopeDispose, ref } from "vue";

const props = defineProps<{
  text: string;
  /** Accessible name, e.g. "Copy class code SEC-4K7Q". */
  label: string;
  /** Toast title on success. */
  copied?: string;
  /** Show `label` as visible text next to the icon. */
  showLabel?: boolean;
}>();

const toast = useToast();
const done = ref(false);
let timer: ReturnType<typeof setTimeout> | undefined;
onScopeDispose(() => clearTimeout(timer));

async function copy() {
  try {
    await navigator.clipboard.writeText(props.text);
    done.value = true;
    clearTimeout(timer);
    timer = setTimeout(() => (done.value = false), 2000);
    toast.add({ title: props.copied ?? "Copied", color: "success", icon: "i-lucide-copy-check" });
  } catch {
    toast.add({
      title: "Couldn't copy. Select the text and copy it yourself.",
      color: "error",
      icon: "i-lucide-circle-alert",
    });
  }
}
</script>

<template>
  <button
    type="button"
    class="inline-flex flex-none items-center justify-center gap-1.5 rounded-full bg-brand-soft font-bold text-brand-ink transition-colors hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    :class="showLabel ? 'h-9 px-3.5 text-[13px]' : 'size-[34px]'"
    :aria-label="showLabel ? undefined : label"
    @click="copy"
  >
    <UIcon :name="done ? 'i-lucide-check' : 'i-lucide-copy'" class="size-4 flex-none" />
    <span v-if="showLabel">{{ label }}</span>
  </button>
</template>
