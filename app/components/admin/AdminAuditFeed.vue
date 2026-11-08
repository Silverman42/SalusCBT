<script setup lang="ts">
// "Audit log" side card (mockup screen 10, AU-7): the latest events, live,
// with "View all" to /admin/audit.
import { api } from "~~/convex/_generated/api";
import { useMinuteClock } from "~/composables/useMinuteClock";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { adminErrorMessage, AUDIT_TONE_CLASSES, describeAudit, formatWhen } from "~/lib/admin";

const props = withDefaults(defineProps<{ limit?: number }>(), { limit: 6 });

const { data, error, loading } = useStaffQuery(api.admin.audit, {
  paginationOpts: { numItems: props.limit, cursor: null },
});
const now = useMinuteClock();
</script>

<template>
  <section
    class="flex flex-col gap-3.5 rounded-[28px] bg-surface px-[22px] py-5"
    aria-labelledby="audit-feed-heading"
  >
    <div class="flex items-center justify-between">
      <h2 id="audit-feed-heading" class="m-0 text-base font-extrabold">Audit log</h2>
      <NuxtLink to="/admin/audit" class="text-[13px] font-bold text-brand-ink hover:underline">
        View all
      </NuxtLink>
    </div>

    <p v-if="loading" class="m-0 text-sm text-muted-fg">Loading events…</p>
    <p v-else-if="error" class="m-0 text-sm font-semibold text-bad" role="alert">
      {{ adminErrorMessage(error, "load") }}
    </p>
    <p v-else-if="data?.page.length === 0" class="m-0 text-sm text-muted-fg">No events yet.</p>
    <ul v-else class="m-0 flex list-none flex-col gap-3.5 p-0">
      <li v-for="row in data?.page" :key="row.id" class="flex gap-3">
        <span
          class="grid size-8 flex-none place-items-center rounded-[10px]"
          :class="AUDIT_TONE_CLASSES[describeAudit(row).tone]"
          aria-hidden="true"
        >
          <UIcon :name="describeAudit(row).icon" class="size-[15px]" />
        </span>
        <div class="flex min-w-0 flex-col gap-0.5">
          <span class="text-[13.5px] leading-[1.35] wrap-anywhere">
            {{ describeAudit(row).text }}
          </span>
          <time :datetime="new Date(row.at).toISOString()" class="text-xs text-muted-fg">
            {{ formatWhen(row.at, now) }}
          </time>
        </div>
      </li>
    </ul>
  </section>
</template>
