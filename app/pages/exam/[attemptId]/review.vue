<script setup lang="ts">
// Student answer review (T-216, LLD §8.3, §14.1, PRD EX-17, EX-18, PB-2),
// after mockup screen 07. Client only (routeRules `/exam/**`). Options come
// from `review.getReview` in the order the student saw them. The status and
// domain filters combine and are kept in the URL (`?filter=wrong&domain=2.0`)
// so a refresh or a shared bookmark keeps them.
import {
  parseDomainFilter,
  parseReviewFilter,
  type DomainFilter,
  type ReviewFilter,
} from "~/lib/resultView";
import { resultPath } from "~/lib/attemptPages";

useSeoMeta({ title: "Answer review · Salus", robots: "noindex" });

const route = useRoute();
const router = useRouter();
const attemptId = String(route.params.attemptId);

const { result, review, failure, loading, retry } = useStudentResult(attemptId, {
  withReview: true,
});

const filter = ref<ReviewFilter>(parseReviewFilter(route.query.filter));
const domain = ref<DomainFilter>(parseDomainFilter(route.query.domain));

watch([filter, domain], ([f, d]) => {
  const query: Record<string, string> = {};
  if (f !== "all") query.filter = f;
  if (d !== "all") query.domain = d;
  void router.replace({ query });
});
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[1100px] min-w-0 flex-1 flex-col gap-5 px-4 pt-2 pb-12 sm:px-5"
  >
    <template v-if="result && review">
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <UButton
          :to="resultPath(attemptId)"
          icon="i-lucide-arrow-left"
          label="Result"
          color="neutral"
          variant="soft"
          size="sm"
          class="rounded-full"
        />
        <h1
          class="m-0 rounded-full bg-surface-2 px-3 py-[7px] text-[13px] font-normal text-muted-fg"
        >
          Review · {{ result.result.scaled }}
          {{ result.result.passed ? "Pass" : `Below ${result.passScaled}` }}
        </h1>
      </div>

      <ResultReviewList v-model:filter="filter" v-model:domain="domain" :items="review" by-domain />
    </template>

    <ResultLoadState
      v-else
      :attempt-id="attemptId"
      :failure="failure"
      :loading="loading"
      what="the review"
      @retry="retry"
    />
  </section>
</template>
