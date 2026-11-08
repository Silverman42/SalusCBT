<script setup lang="ts">
// /tutor/attempts/[id] (T-506, LLD §14.1, PRD CL-7): a tutor sees exactly what
// the student sees in review. Header after mockup screen 09 (student name,
// class link, submitted time); then the result summary of screen 06 and the
// filterable answer review of screen 07, reusing the student components with
// `classes.attemptResult` / `classes.attemptReview`. `NOT_FOUND` (another
// tutor's class, unfinished or classless attempt) shows "not found".
import { computed, ref, watch } from "vue";
import type { Id } from "~~/convex/_generated/dataModel";
import { api } from "~~/convex/_generated/api";
import { useAdminAction } from "~/composables/useAdminAction";
import { useMinuteClock } from "~/composables/useMinuteClock";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { deletedMessage } from "~/lib/admin";
import {
  parseDomainFilter,
  parseReviewFilter,
  type DomainFilter,
  type ReviewFilter,
} from "~/lib/resultView";
import {
  ATTEMPT_LOAD_TEXT,
  attemptBackLink,
  attemptHeading,
  attemptLoadState,
  attemptMetaLine,
  attemptPageTitle,
  classPath,
} from "~/lib/tutorAttempt";

definePageMeta({ middleware: "tutor", layout: "staff", title: "Attempt review" });

const route = useRoute();
const router = useRouter();
const { $convex } = useNuxtApp();
const now = useMinuteClock();
const attemptId = String(route.params.id ?? "") as Id<"attempts">;

const result = useStaffQuery(api.classes.attemptResult, { attemptId });
const review = useStaffQuery(api.classes.attemptReview, { attemptId });

/** Set while deleting, so the page keeps its last data until it navigates away. */
const leaving = ref(false);
const state = computed(() => {
  const haveData = result.data.value !== undefined && review.data.value !== undefined;
  if (leaving.value && haveData) return "ready";
  return attemptLoadState([result.error.value, review.error.value], haveData);
});
const view = computed(() => result.data.value ?? null);
const back = computed(() => attemptBackLink(view.value));

const filter = ref<ReviewFilter>(parseReviewFilter(route.query.filter));
const domain = ref<DomainFilter>(parseDomainFilter(route.query.domain));
watch([filter, domain], ([f, d]) => {
  const query: Record<string, string> = {};
  if (f !== "all") query.filter = f;
  if (d !== "all") query.domain = d;
  void router.replace({ query });
});

const deleteAction = useAdminAction();
const confirmOpen = ref(false);

async function remove() {
  const target = view.value;
  if (!target) return;
  leaving.value = true;
  const done = await deleteAction.run(
    "deleteAttempts",
    () => $convex.mutation(api.classes.deleteAttempts, { attemptIds: [attemptId] }),
    ({ deleted }) => deletedMessage(1, deleted),
  );
  confirmOpen.value = false;
  if (done) await navigateTo(classPath(target.classId), { replace: true });
  else leaving.value = false;
}

useHead({ title: () => `${attemptPageTitle(view.value)} · Tutor · Salus` });
</script>

<template>
  <div class="flex min-w-0 flex-col gap-[18px]">
    <NuxtLink
      :to="back.to"
      class="-mt-2 inline-flex max-w-full min-w-0 items-center gap-1 self-start text-sm font-semibold text-muted-fg hover:text-fg"
    >
      <UIcon name="i-lucide-arrow-left" class="size-4 flex-none" />
      <span class="truncate">{{ back.label }}</span>
    </NuxtLink>

    <template v-if="state === 'ready' && view && review.data.value">
      <section
        class="flex flex-col gap-3 rounded-[28px] bg-surface px-5 py-5 sm:flex-row sm:items-center sm:px-[30px] sm:py-6"
        aria-labelledby="attempt-heading"
      >
        <div class="flex min-w-0 flex-1 flex-col gap-1.5">
          <div class="flex flex-wrap items-center gap-2.5">
            <h2
              id="attempt-heading"
              class="m-0 text-[22px] font-extrabold tracking-[-0.02em] break-words sm:text-[26px]"
            >
              {{ attemptHeading(view) }}
            </h2>
            <NuxtLink
              :to="classPath(view.classId)"
              class="inline-flex max-w-full min-w-0 items-center gap-1.5 rounded-full bg-brand-soft px-3 py-[5px] text-[13px] font-bold text-fg hover:underline"
            >
              <UIcon name="i-lucide-users" class="size-3.5 flex-none text-brand-ink" />
              <span class="truncate">{{ view.className.trim() || "Class" }}</span>
            </NuxtLink>
          </div>
          <p class="m-0 text-sm text-muted-fg">{{ attemptMetaLine(view, now) }}</p>
        </div>
        <UButton
          color="error"
          variant="soft"
          icon="i-lucide-trash-2"
          label="Delete attempt"
          class="self-start sm:self-center"
          :disabled="deleteAction.busy.value"
          @click="confirmOpen = true"
        />
      </section>

      <div class="attempt-summary min-w-0">
        <ResultSummary :view="view" />
      </div>

      <ResultReviewList
        v-model:filter="filter"
        v-model:domain="domain"
        :items="review.data.value"
        by-domain
      />

      <AdminConfirmDialog
        v-model:open="confirmOpen"
        :title="`Delete ${attemptHeading(view)}'s attempt?`"
        description="This is permanent: the answers, score and share links of this attempt are deleted and can't be recovered. The deletion is recorded in the audit log."
        confirm-label="Delete attempt"
        cancel-label="Keep it"
        :busy="deleteAction.busy.value"
        @confirm="remove"
      />
    </template>

    <p
      v-else-if="state === 'loading'"
      role="status"
      aria-live="polite"
      class="m-0 flex items-center gap-2 text-sm text-muted-fg"
    >
      <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" aria-hidden="true" />
      Loading attempt…
    </p>

    <section
      v-else-if="state !== 'ready'"
      class="flex flex-col items-start gap-3 rounded-[28px] bg-surface px-[22px] py-5"
      aria-labelledby="attempt-missing-heading"
      role="alert"
    >
      <h2 id="attempt-missing-heading" class="m-0 text-base font-extrabold">
        {{ ATTEMPT_LOAD_TEXT[state].title }}
      </h2>
      <p class="m-0 text-sm text-muted-fg">{{ ATTEMPT_LOAD_TEXT[state].body }}</p>
      <UButton color="neutral" variant="soft" to="/tutor" label="Back to your classes" />
    </section>
  </div>
</template>

<style scoped>
/*
 * ResultSummary picks two columns and shows its illustration by viewport
 * width, which assumes a full-width page. Here the staff sidebar takes 248px,
 * so from 1024px to ~1350px the score banner would be squeezed under its
 * 340px illustration. Lay it out by the space it actually has.
 */
.attempt-summary {
  container-type: inline-size;
}
@container (max-width: 1099px) {
  .attempt-summary > :deep(.grid) {
    grid-template-columns: minmax(0, 1fr);
  }
}
@container (max-width: 719px) {
  .attempt-summary :deep(svg[viewBox="0 0 340 280"]) {
    display: none;
  }
}
</style>
