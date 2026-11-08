<script setup lang="ts">
// LB-9 (T-308): MVP lab page. Download build-lab.sh plus the lab steps.
// The in-browser terminal for Labs A–C replaces most of this in Stage 7 (LB-1 to LB-8).
import {
  LAB_INSTRUCTIONS_URL,
  LAB_SCAN_WARNING,
  LAB_SCRIPT_URL,
  LAB_STEPS,
  LAB_WHERE_TO_RUN,
} from "#shared/lab";

useSeoMeta({
  title: "Practice lab · Salus",
  description:
    "Download build-lab.sh and practise Security+ log, hash, permission and nmap tasks on your own Linux machine.",
});
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[880px] min-w-0 flex-col gap-6 px-4 pt-4 pb-12 sm:px-12"
  >
    <!-- Banner, after mockup screen 12 -->
    <div class="flex items-center overflow-hidden rounded-[28px] bg-salus-500 text-white">
      <div class="flex min-w-0 flex-1 flex-col gap-2 px-6 py-7 sm:px-8">
        <span class="text-[13px] font-bold tracking-[0.06em] text-salus-100 uppercase">
          Practice · untimed
        </span>
        <h1 class="m-0 text-[26px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[32px]">
          Practice lab
        </h1>
        <p class="m-0 text-[15px] leading-[1.55] text-pretty text-salus-100">
          Build a small practice lab on your own computer and type every command yourself: read an
          auth log, verify installer hashes, fix file permissions and scan your own machine.
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
      </svg>
    </div>

    <!-- LB-9: the warning comes before the download link. -->
    <div role="note" class="flex gap-3 rounded-3xl bg-warn-soft px-5 py-4 text-warn">
      <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 flex-none" />
      <p class="m-0 text-[15px] leading-normal font-semibold">{{ LAB_SCAN_WARNING }}</p>
    </div>

    <div
      class="flex flex-col gap-4 rounded-[28px] bg-surface p-5 sm:flex-row sm:items-center sm:p-6"
    >
      <div class="flex min-w-0 flex-1 items-center gap-3">
        <span
          class="grid size-11 flex-none place-items-center rounded-2xl bg-brand-soft text-brand-ink"
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

    <ol class="m-0 flex list-none flex-col gap-4 p-0">
      <li
        v-for="step in LAB_STEPS"
        :id="step.id"
        :key="step.id"
        class="flex min-w-0 flex-col gap-3 rounded-[28px] bg-surface p-5 sm:p-6"
      >
        <h2 class="m-0 text-lg font-extrabold tracking-[-0.01em]">{{ step.title }}</h2>

        <p v-for="(para, pi) in step.intro" :key="`i${pi}`" class="m-0 text-[15px] leading-[1.6]">
          <LabInlineCode :text="para" />
        </p>

        <ol
          v-if="step.questions"
          class="m-0 flex list-decimal flex-col gap-1 pl-6 text-[15px] leading-[1.6]"
        >
          <li v-for="(q, qi) in step.questions" :key="qi">
            <LabInlineCode :text="q" />
          </li>
        </ol>

        <pre
          v-if="step.commands"
          class="m-0 overflow-x-auto rounded-xl bg-code px-5 py-4 font-mono text-[13px] leading-[1.75] text-code-fg"
        ><code>{{ step.commands }}</code></pre>

        <p
          v-for="(para, pi) in step.outro"
          :key="`o${pi}`"
          class="m-0 text-[15px] leading-[1.6] text-muted-fg"
        >
          <LabInlineCode :text="para" />
        </p>
      </li>
    </ol>

    <p
      class="m-0 flex items-center gap-2 rounded-3xl bg-brand-soft px-5 py-4 text-sm font-semibold text-brand-ink"
    >
      <UIcon name="i-lucide-sparkles" class="size-4 flex-none" />
      An in-browser terminal for Labs A–C is on the way. Lab D stays a download because it scans
      your own machine.
    </p>
  </section>
</template>
