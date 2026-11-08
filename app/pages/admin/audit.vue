<script setup lang="ts">
// /admin/audit (LLD §12.2, §14.1; AU-7): the whole audit log, newest first,
// 25 rows a page with "Load more" (Convex pagination via `continueCursor`).
// A table from md up, a list on phones. Rows use the mockup screen 10 wording.
import type { FunctionReturnType } from "convex/server";
import { computed, ref, shallowRef, watch } from "vue";
import { api } from "~~/convex/_generated/api";
import { useAuth } from "~/composables/useAuth";
import { useMinuteClock } from "~/composables/useMinuteClock";
import {
  adminErrorMessage,
  AUDIT_TONE_CLASSES,
  describeAudit,
  formatWhen,
  isSessionError,
} from "~/lib/admin";
import { SIGN_IN_PATH } from "~/lib/authGuard";

definePageMeta({ middleware: "admin", layout: "staff", title: "Audit log" });

type AuditRow = FunctionReturnType<typeof api.admin.audit>["page"][number];

const PAGE_SIZE = 25;

const auth = useAuth();
const { $convex } = useNuxtApp();
const route = useRoute();
const now = useMinuteClock();

const rows = shallowRef<AuditRow[]>([]);
const cursor = ref<string | null>(null);
const done = ref(false);
const loading = ref(false);
const error = ref("");
const loadedOnce = ref(false);

const view = computed(() =>
  rows.value.map((row) => ({
    row,
    ...describeAudit(row),
    when: formatWhen(row.at, now.value),
    iso: new Date(row.at).toISOString(),
  })),
);

async function load(reset: boolean) {
  if (loading.value) return;
  loading.value = true;
  error.value = "";
  try {
    const result = await $convex.query(api.admin.audit, {
      paginationOpts: { numItems: PAGE_SIZE, cursor: reset ? null : cursor.value },
    });
    rows.value = reset ? result.page : [...rows.value, ...result.page];
    cursor.value = result.continueCursor;
    done.value = result.isDone;
    loadedOnce.value = true;
  } catch (err) {
    error.value = adminErrorMessage(err, "load");
    if (isSessionError(err)) {
      await navigateTo(`${SIGN_IN_PATH}?redirect=${encodeURIComponent(route.fullPath)}`, {
        replace: true,
      });
    }
  } finally {
    loading.value = false;
  }
}

// Wait for the session so the first query is authenticated.
watch(
  () => !auth.isPending.value && auth.isSignedIn.value,
  (ready) => {
    if (ready && !loadedOnce.value) void load(true);
  },
  { immediate: true },
);
</script>

<template>
  <section
    class="flex flex-col gap-0.5 rounded-[28px] bg-surface px-4 py-3.5"
    aria-labelledby="audit-heading"
    :aria-busy="loading"
  >
    <div class="flex items-center gap-2 px-2 pt-1.5 pb-2.5">
      <h2 id="audit-heading" class="m-0 flex-1 text-base font-extrabold">Events</h2>
      <UButton
        color="neutral"
        variant="soft"
        size="sm"
        icon="i-lucide-refresh-cw"
        label="Refresh"
        class="font-bold"
        :disabled="loading"
        @click="load(true)"
      />
    </div>

    <p v-if="!loadedOnce && loading" class="m-0 px-2 py-2.5 text-sm text-muted-fg">
      Loading events…
    </p>
    <p v-else-if="loadedOnce && rows.length === 0" class="m-0 px-2 py-2.5 text-sm text-muted-fg">
      No events yet.
    </p>
    <template v-if="rows.length > 0">
      <table class="hidden w-full border-collapse text-sm md:table">
        <caption class="sr-only">
          Audit events, newest first
        </caption>
        <thead>
          <tr class="text-left text-xs font-bold tracking-[0.05em] text-muted-fg uppercase">
            <th scope="col" class="px-2.5 py-2 font-bold">Event</th>
            <th scope="col" class="px-2.5 py-2 font-bold">By</th>
            <th scope="col" class="px-2.5 py-2 font-bold">When</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in view" :key="item.row.id" class="border-t border-line align-top">
            <td class="px-2.5 py-3">
              <div class="flex items-center gap-3">
                <span
                  class="grid size-8 flex-none place-items-center rounded-[10px]"
                  :class="AUDIT_TONE_CLASSES[item.tone]"
                  aria-hidden="true"
                >
                  <UIcon :name="item.icon" class="size-[15px]" />
                </span>
                <span class="wrap-anywhere">{{ item.text }}</span>
              </div>
            </td>
            <td class="px-2.5 py-3 text-muted-fg wrap-anywhere">
              {{ item.row.actorEmail ?? "System" }}
            </td>
            <td class="px-2.5 py-3 whitespace-nowrap text-muted-fg">
              <time :datetime="item.iso">{{ item.when }}</time>
            </td>
          </tr>
        </tbody>
      </table>

      <ul class="m-0 flex list-none flex-col gap-3.5 px-2 py-1 md:hidden">
        <li v-for="item in view" :key="item.row.id" class="flex gap-3">
          <span
            class="grid size-8 flex-none place-items-center rounded-[10px]"
            :class="AUDIT_TONE_CLASSES[item.tone]"
            aria-hidden="true"
          >
            <UIcon :name="item.icon" class="size-[15px]" />
          </span>
          <div class="flex min-w-0 flex-col gap-0.5">
            <span class="text-[13.5px] leading-[1.35] wrap-anywhere">{{ item.text }}</span>
            <span class="text-xs text-muted-fg wrap-anywhere">
              <time :datetime="item.iso">{{ item.when }}</time>
              <template v-if="item.row.actorEmail"> · {{ item.row.actorEmail }}</template>
            </span>
          </div>
        </li>
      </ul>
    </template>

    <div aria-live="polite">
      <p
        v-if="error"
        class="m-0 mt-2 flex gap-2 rounded-2xl bg-bad-soft px-4 py-3 text-sm font-semibold text-bad"
      >
        <UIcon name="i-lucide-circle-alert" class="mt-0.5 size-4 flex-none" />
        <span>{{ error }}</span>
      </p>
    </div>

    <div v-if="loadedOnce && !done" class="flex justify-center pt-3 pb-1">
      <UButton
        color="neutral"
        variant="soft"
        label="Load more"
        icon="i-lucide-chevron-down"
        :loading="loading"
        class="font-bold"
        @click="load(false)"
      />
    </div>
  </section>
</template>
