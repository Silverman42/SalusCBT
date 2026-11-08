<script setup lang="ts">
// The tutor's classes (CL-1, CL-2): name and version, code with a copy
// button, extra time, open/closed, created date. A table on wide screens,
// cards on phones. Each class links to its live page.
import type { FunctionReturnType } from "convex/server";
import type { api } from "~~/convex/_generated/api";
import { formatDate } from "~/lib/admin";
import { classStatusBadge, multiplierLabel } from "~/lib/tutor";

type ClassSummary = FunctionReturnType<typeof api.classes.mine>[number];

defineProps<{ classes: ClassSummary[]; now: number }>();

const classLink = (c: ClassSummary) => `/tutor/classes/${c.classId}`;
</script>

<template>
  <div>
    <!-- Wide screens: a table. -->
    <table class="w-full border-separate border-spacing-y-0.5 text-sm max-md:hidden">
      <caption class="sr-only">
        Your classes
      </caption>
      <thead>
        <tr class="text-left text-xs font-bold tracking-[0.05em] text-muted-fg uppercase">
          <th scope="col" class="px-2.5 py-2 font-bold">Class</th>
          <th scope="col" class="px-2.5 py-2 font-bold">Code</th>
          <th scope="col" class="px-2.5 py-2 font-bold">Time</th>
          <th scope="col" class="px-2.5 py-2 font-bold">Status</th>
          <th scope="col" class="px-2.5 py-2 font-bold">Created</th>
          <th scope="col" class="w-10 px-2.5 py-2"><span class="sr-only">Open</span></th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="c in classes" :key="c.classId" class="group">
          <td class="rounded-l-[14px] px-2.5 py-3 group-hover:bg-surface-2">
            <NuxtLink
              :to="classLink(c)"
              class="font-bold text-fg hover:text-brand-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {{ c.name }}
            </NuxtLink>
            <div class="text-[13px] text-muted-fg">{{ c.versionLabel || "Exam version" }}</div>
          </td>
          <td class="px-2.5 py-3 group-hover:bg-surface-2">
            <span class="inline-flex items-center gap-2">
              <span class="font-mono font-bold tracking-[0.06em]">{{ c.code }}</span>
              <TutorCopyButton
                :text="c.code"
                :label="`Copy class code ${c.code}`"
                :copied="`Copied ${c.code}`"
              />
            </span>
          </td>
          <td class="px-2.5 py-3 text-muted-fg group-hover:bg-surface-2">
            {{ multiplierLabel(c.timeMultiplier) }}
          </td>
          <td class="px-2.5 py-3 group-hover:bg-surface-2">
            <AdminStatusBadge :badge="classStatusBadge(c.status)" />
          </td>
          <td class="px-2.5 py-3 text-muted-fg tabular-nums group-hover:bg-surface-2">
            {{ formatDate(c.createdAt, now) }}
          </td>
          <td class="rounded-r-[14px] px-2.5 py-3 group-hover:bg-surface-2">
            <NuxtLink
              :to="classLink(c)"
              class="grid size-8 place-items-center rounded-full text-muted-fg hover:bg-surface hover:text-fg"
              :aria-label="`Open ${c.name}`"
              tabindex="-1"
            >
              <UIcon name="i-lucide-chevron-right" class="size-[18px]" />
            </NuxtLink>
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Phones: cards. -->
    <ul class="m-0 flex list-none flex-col gap-2 p-0 md:hidden" aria-label="Your classes">
      <li
        v-for="c in classes"
        :key="c.classId"
        class="flex flex-col gap-2.5 rounded-[18px] bg-surface-2 p-3.5"
      >
        <div class="flex items-start gap-2">
          <NuxtLink :to="classLink(c)" class="min-w-0 flex-1 text-[15px] font-bold text-fg">
            {{ c.name }}
            <span class="block text-[13px] font-normal text-muted-fg">
              {{ c.versionLabel || "Exam version" }} · {{ multiplierLabel(c.timeMultiplier) }}
            </span>
          </NuxtLink>
          <AdminStatusBadge :badge="classStatusBadge(c.status)" />
        </div>
        <div class="flex items-center gap-2">
          <span class="font-mono text-[15px] font-bold tracking-[0.06em]">{{ c.code }}</span>
          <TutorCopyButton
            :text="c.code"
            :label="`Copy class code ${c.code}`"
            :copied="`Copied ${c.code}`"
          />
          <span class="flex-1" />
          <span class="text-[13px] text-muted-fg">Created {{ formatDate(c.createdAt, now) }}</span>
        </div>
      </li>
    </ul>
  </div>
</template>
