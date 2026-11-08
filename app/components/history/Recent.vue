<script setup lang="ts">
// "Attempt history" card of mockup screen 06, for the result page (T-215):
// the last few attempts and the reminder that history lives in this browser.
const { rows, firstLoad, pager } = useAttemptHistory(3);
</script>

<template>
  <section
    aria-labelledby="recent-attempts"
    class="flex flex-1 flex-col gap-3 rounded-[28px] bg-surface px-6 py-[22px]"
  >
    <div class="flex items-baseline gap-3">
      <h2 id="recent-attempts" class="m-0 flex-1 text-base font-extrabold">Attempt history</h2>
      <NuxtLink to="/history" class="text-[13px] font-semibold text-brand-ink hover:underline">
        See all
      </NuxtLink>
    </div>
    <HistoryAttemptRow v-for="row in rows" :key="row.attemptId" :row="row" compact />
    <p v-if="firstLoad" class="m-0 text-sm text-muted-fg">Loading…</p>
    <p v-else-if="pager.error" class="m-0 text-sm text-muted-fg">{{ pager.error }}</p>
    <div class="flex-1" />
    <div
      role="note"
      class="flex gap-2.5 rounded-[18px] bg-surface-2 p-3.5 text-[13px] leading-normal text-muted-fg"
    >
      <UIcon name="i-lucide-info" class="mt-0.5 size-4 flex-none text-brand-ink" />
      <span>
        History lives in this browser only.
        <NuxtLink to="/history" class="font-semibold text-brand-ink underline">
          Export it on your history page
        </NuxtLink>
        to keep it — the file holds your private ID.
      </span>
    </div>
  </section>
</template>
