<script setup lang="ts">
// Time calls and pacing alerts above the question (mockup screen 02, EX-4,
// EX-5, LLD §14.3). Each shows once and can be dismissed. Not a live region:
// <ExamTimer> announces them, so they are read once even after a refresh.
import type { AlertId, PacingAlert } from "~/lib/pacing";

defineProps<{ alerts: readonly PacingAlert[] }>();
defineEmits<{ dismiss: [id: AlertId] }>();
</script>

<template>
  <section v-if="alerts.length" aria-label="Time and pacing" class="flex flex-col gap-2">
    <TransitionGroup
      enter-active-class="motion-safe:transition motion-safe:duration-200"
      enter-from-class="motion-safe:-translate-y-1 opacity-0"
    >
      <div
        v-for="a in alerts"
        :key="a.id"
        class="flex items-start gap-3 rounded-[20px] px-[18px] py-3.5 sm:items-center"
        :class="a.tone === 'warn' ? 'bg-warn-soft' : 'bg-brand-soft'"
      >
        <UIcon
          :name="a.group === 'call' ? 'i-lucide-bell' : 'i-lucide-gauge'"
          class="mt-0.5 size-[18px] flex-none sm:mt-0"
          :class="a.tone === 'warn' ? 'text-warn' : 'text-brand-ink'"
          aria-hidden="true"
        />
        <p class="m-0 flex min-w-0 flex-1 flex-col gap-x-3 gap-y-0.5 sm:flex-row sm:flex-wrap">
          <span
            class="text-[15px] font-bold"
            :class="a.tone === 'warn' ? 'text-fg' : 'text-brand-ink'"
          >
            {{ a.title }}
          </span>
          <span v-if="a.detail" class="text-sm text-fg">{{ a.detail }}</span>
        </p>
        <button
          type="button"
          class="-m-1.5 grid size-8 flex-none place-items-center rounded-full text-fg hover:bg-surface/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          :aria-label="`Dismiss: ${a.title}`"
          @click="$emit('dismiss', a.id)"
        >
          <UIcon name="i-lucide-x" class="size-[18px]" aria-hidden="true" />
        </button>
      </div>
    </TransitionGroup>
  </section>
</template>
