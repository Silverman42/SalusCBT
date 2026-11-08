<script setup lang="ts">
// Class banner (mockup screen 09): name, Open/Closed, version, extra time and
// created date, the class code with copy, the student join link, Edit and
// Close/Reopen (CL-1, CL-2, EX-21). Closing only stops new attempts.
import type { FunctionReturnType } from "convex/server";
import { computed, ref } from "vue";
import { api } from "~~/convex/_generated/api";
import { useAdminAction } from "~/composables/useAdminAction";
import { formatDate } from "~/lib/admin";
import { joinUrl, multiplierLabel } from "~/lib/tutor";

type ClassSummary = FunctionReturnType<typeof api.classes.mine>[number];

const props = defineProps<{ klass: ClassSummary; now: number }>();

const { $convex } = useNuxtApp();
const statusAction = useAdminAction();
const editOpen = ref(false);
const closeOpen = ref(false);

const isOpen = computed(() => props.klass.status === "open");
const link = computed(() => joinUrl(window.location.origin, props.klass.code));

async function setStatus(status: "open" | "closed") {
  await statusAction.run(
    "load",
    () => $convex.mutation(api.classes.update, { classId: props.klass.classId, status }),
    () =>
      status === "closed"
        ? `${props.klass.code} is closed. Past results stay visible.`
        : `${props.klass.code} is open for new attempts again.`,
  );
  closeOpen.value = false;
}
</script>

<template>
  <section
    class="relative flex flex-col gap-4 overflow-hidden rounded-[28px] bg-brand p-5 text-white sm:px-[30px] sm:py-6 lg:flex-row lg:items-center lg:gap-5"
    aria-labelledby="class-heading"
  >
    <div class="relative z-10 flex min-w-0 flex-1 flex-col gap-2">
      <div class="flex flex-wrap items-center gap-2.5">
        <h2
          id="class-heading"
          class="m-0 text-[22px] font-extrabold tracking-[-0.02em] break-words sm:text-[26px]"
        >
          {{ klass.name }}
        </h2>
        <span
          class="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold"
          :class="isOpen ? 'text-[#0F8F63]' : 'text-[#605A7E]'"
        >
          {{ isOpen ? "Open" : "Closed" }}
        </span>
      </div>
      <p class="m-0 text-sm text-salus-200">
        {{ klass.versionLabel || "Exam version" }} · {{ multiplierLabel(klass.timeMultiplier) }} ·
        created {{ formatDate(klass.createdAt, now) }}
      </p>
      <div class="mt-1 flex flex-wrap gap-2">
        <TutorCopyButton :text="link" label="Copy join link" copied="Join link copied" show-label />
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-bold text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          @click="editOpen = true"
        >
          <UIcon name="i-lucide-pencil" class="size-4" />
          Edit
        </button>
        <button
          type="button"
          class="inline-flex h-9 items-center gap-1.5 rounded-full bg-white/15 px-3.5 text-[13px] font-bold text-white hover:bg-white/25 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white disabled:opacity-60"
          :disabled="statusAction.busy.value"
          @click="isOpen ? (closeOpen = true) : setStatus('open')"
        >
          <UIcon :name="isOpen ? 'i-lucide-lock' : 'i-lucide-lock-open'" class="size-4" />
          {{ isOpen ? "Close class" : "Reopen class" }}
        </button>
      </div>
      <p class="m-0 text-[13px] break-all text-salus-200">
        Students join at <span class="font-mono">{{ link }}</span>
      </p>
    </div>

    <div
      class="relative z-10 flex items-center gap-2.5 self-start rounded-full bg-white py-2.5 pr-2.5 pl-[18px] text-salus-700 lg:self-center"
    >
      <span class="font-mono text-lg font-bold tracking-[0.06em]">{{ klass.code }}</span>
      <TutorCopyButton
        :text="klass.code"
        :label="`Copy class code ${klass.code}`"
        :copied="`Copied ${klass.code}`"
      />
    </div>

    <svg
      viewBox="0 0 200 132"
      width="200"
      height="132"
      class="pointer-events-none absolute -right-2 -bottom-6 flex-none opacity-60 max-lg:hidden lg:static lg:-my-6 lg:-mr-[30px] lg:opacity-100"
      aria-hidden="true"
    >
      <circle cx="150" cy="40" r="90" fill="#7457FF" />
      <circle cx="100" cy="58" r="20" fill="#fff" />
      <path d="M64 132 C64 104 80 88 100 88 C120 88 136 104 136 132 Z" fill="#fff" />
      <circle cx="52" cy="76" r="14" fill="#C3B6FF" />
      <path d="M26 132 C26 112 38 100 52 100 C66 100 78 112 78 132 Z" fill="#C3B6FF" />
      <circle cx="150" cy="76" r="14" fill="#A898FF" />
      <path d="M124 132 C124 112 136 100 150 100 C164 100 176 112 176 132 Z" fill="#A898FF" />
    </svg>

    <TutorClassForm v-model:open="editOpen" :klass="klass" />
    <AdminConfirmDialog
      v-model:open="closeOpen"
      :title="`Close ${klass.code}?`"
      description="Students can't start new attempts with this code. Attempts already started can still be submitted, and every result stays visible. You can reopen the class at any time."
      confirm-label="Close class"
      cancel-label="Keep it open"
      :busy="statusAction.busy.value"
      @confirm="setStatus('closed')"
    />
  </section>
</template>
