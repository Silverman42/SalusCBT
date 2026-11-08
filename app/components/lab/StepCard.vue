<script setup lang="ts">
// One lab step from shared/lab.ts (title, intro, questions, commands, outro).
// Inline `code` in the text is marked with backticks (LabInlineCode).
import type { LabStep } from "#shared/lab";

defineProps<{ step: LabStep; headingLevel?: 2 | 3 }>();
</script>

<template>
  <div :id="step.id" class="flex min-w-0 flex-col gap-3 rounded-[28px] bg-surface p-5 sm:p-6">
    <component :is="`h${headingLevel ?? 2}`" class="m-0 text-lg font-extrabold tracking-[-0.01em]">
      {{ step.title }}
    </component>

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

    <!-- Focusable so keyboard users can scroll long lines at phone width (axe, X-01). -->
    <pre
      v-if="step.commands"
      tabindex="0"
      :aria-label="`${step.title}: commands`"
      class="m-0 overflow-x-auto rounded-[18px] bg-code px-5 py-4 font-mono text-[13px] leading-[1.75] text-code-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
    ><code>{{ step.commands }}</code></pre>

    <p
      v-for="(para, pi) in step.outro"
      :key="`o${pi}`"
      class="m-0 text-[15px] leading-[1.6] text-muted-fg"
    >
      <LabInlineCode :text="para" />
    </p>

    <slot />
  </div>
</template>
