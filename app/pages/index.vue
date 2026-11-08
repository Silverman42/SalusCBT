<script setup lang="ts">
// Placeholder landing in the mockup's style (screen 01). The start form, retake
// button and last-attempt badge are built in T-211.
useSeoMeta({
  title: "Salus · Security+ style mock exam",
  description: "Sit a full Security+ style mock exam. No sign-up.",
});
</script>

<template>
  <section class="grid flex-1 gap-10 px-4 pt-4 pb-12 sm:px-12 lg:grid-cols-[1fr_520px]">
    <div class="flex flex-col justify-center gap-7">
      <span
        class="flex items-center gap-2 self-start rounded-full bg-brand-soft px-3.5 py-2 text-[13px] font-semibold text-brand-ink"
      >
        <UIcon name="i-lucide-zap" class="size-3.5" />
        Security+ style practice exam · SY0-701
      </span>
      <h1
        class="m-0 text-4xl leading-[1.02] font-extrabold tracking-[-0.035em] text-balance sm:text-[60px]"
      >
        Sit a full mock exam. No sign-up.
      </h1>
      <p class="m-0 max-w-[520px] text-[19px] leading-[1.55] text-pretty text-muted-fg">
        Five performance-based questions, then 85 multiple-choice. 90 minutes, marked the moment you
        submit.
      </p>
    </div>
    <HeroArt class="hidden min-h-[480px] lg:block" />
  </section>
</template>
