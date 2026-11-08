<script setup lang="ts">
// Command cheat sheet beside the terminal (T-706, LB-8, mockup screen 12):
// the Part 5 table, then every command the in-browser lab supports (the same
// list as `help`).
import { CHEAT_SHEET } from "~/lib/terminal/cheatSheet";
import { DEFAULT_COMMANDS } from "~/lib/terminal/commands";

const commands = [...DEFAULT_COMMANDS].sort((a, b) => (a.name < b.name ? -1 : 1));
</script>

<template>
  <section
    aria-labelledby="cheat-sheet-title"
    class="flex flex-col gap-3 rounded-[28px] bg-surface p-5"
  >
    <h2 id="cheat-sheet-title" class="m-0 text-base font-extrabold">Cheat sheet</h2>
    <ul class="m-0 flex list-none flex-col gap-2 p-0">
      <li
        v-for="row in CHEAT_SHEET"
        :key="row.command"
        class="flex flex-col gap-0.5 rounded-[14px] bg-surface-2 px-3 py-2"
      >
        <code class="font-mono text-[12.5px] font-semibold break-words text-brand-ink">{{
          row.command
        }}</code>
        <span class="text-[12.5px] leading-snug text-muted-fg">
          {{ row.description }}
          <template v-if="!row.inBrowser"> (Lab D, on your own machine)</template>
        </span>
      </li>
    </ul>

    <details class="group rounded-[14px] bg-surface-2 px-3 py-2">
      <summary
        class="cursor-pointer text-[13px] font-bold text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
      >
        Every command in this lab
      </summary>
      <dl class="m-0 mt-2 flex flex-col gap-1.5">
        <div v-for="c in commands" :key="c.name" class="flex flex-col">
          <dt class="font-mono text-[12.5px] font-semibold text-brand-ink">{{ c.name }}</dt>
          <dd class="m-0 text-[12.5px] leading-snug text-muted-fg">{{ c.summary }}</dd>
        </div>
      </dl>
      <p class="m-0 mt-2 text-[12.5px] leading-snug text-muted-fg">
        Pipes (<code class="font-mono text-fg">|</code>),
        <code class="font-mono text-fg">&gt;</code> and
        <code class="font-mono text-fg">&amp;&amp;</code> work. Anything else says “not available in
        this lab”.
      </p>
    </details>
  </section>
</template>
