<script setup lang="ts">
// Shared result (CL-9, LLD §14.1, HLD §5.5): rendered on the server from
// `shareLinks.view`, CDN-cached for 60 s (`routeRules` in nuxt.config.ts), so
// a revoked link stops working within a minute. Unknown, malformed and
// revoked links all get the same 404 page. Not indexed; no referrer is sent,
// so the link doesn't leak through outbound requests.
import { ConvexHttpClient } from "convex/browser";
import { api } from "~~/convex/_generated/api";
import { formatDate, isPublicId } from "~/lib/resultView";

const route = useRoute();
const publicId = String(route.params.publicId ?? "");
const convexUrl = useRuntimeConfig().public.convexUrl;

const { data, error } = await useAsyncData(`share:${publicId}`, async () => {
  if (!isPublicId(publicId)) return null;
  const client = new ConvexHttpClient(convexUrl);
  return await client.query(api.shareLinks.view, { publicId });
});

if (import.meta.server) {
  const event = useRequestEvent();
  if (event && (error.value || data.value === null)) {
    setResponseStatus(event, error.value ? 503 : 404);
  }
}

useSeoMeta({
  title: () => (data.value ? `Shared result · ${data.value.result.result.scaled}` : "Salus"),
  description: "A Security+ style mock exam result shared from Salus.",
  robots: "noindex, nofollow",
  referrer: "no-referrer",
});
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[1280px] min-w-0 flex-col gap-5 px-4 pt-2 pb-12 sm:px-5"
  >
    <template v-if="data">
      <div class="flex flex-wrap items-center gap-2 text-[13px]">
        <span
          class="flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-[7px] font-bold text-brand-ink"
        >
          <UIcon name="i-lucide-share-2" class="size-3.5" />Shared result
        </span>
        <span class="rounded-full bg-surface-2 px-3 py-[7px] text-muted-fg">
          {{ data.result.examTitle }} ·
          {{ data.result.mode === "retake" ? "Retake (PBQ set B)" : "Standard" }} ·
          {{ formatDate(data.result.submittedAt) }}
        </span>
      </div>

      <ResultSummary :view="data.result">
        <template #actions>
          <UButton
            to="/"
            icon="i-lucide-play"
            label="Sit the mock exam yourself"
            size="xl"
            block
            class="h-14 text-base font-bold"
          />
          <div
            class="flex gap-2.5 rounded-[18px] bg-surface-2 p-3.5 text-[13px] leading-normal text-muted-fg"
          >
            <UIcon name="i-lucide-info" class="mt-0.5 size-4 flex-none text-brand-ink" />
            <span>
              Shared by the student who sat this exam. The link shows this one result and can be
              revoked at any time.
            </span>
          </div>
        </template>
      </ResultSummary>

      <ResultReviewList :items="data.review" />
    </template>

    <!-- Unknown, malformed or revoked: one state for all (SE-3). -->
    <div
      v-else
      class="mx-auto flex w-full max-w-[560px] flex-col items-center gap-4 rounded-[32px] bg-surface px-6 py-12 text-center sm:px-10"
    >
      <span class="grid size-14 place-items-center rounded-2xl bg-brand-soft text-brand-ink">
        <UIcon :name="error ? 'i-lucide-cloud-off' : 'i-lucide-link-2-off'" class="size-6" />
      </span>
      <h1 class="m-0 text-2xl font-extrabold tracking-[-0.02em]">
        {{ error ? "We couldn't load this result" : "We couldn't find that" }}
      </h1>
      <p class="m-0 text-[15px] leading-[1.55] text-pretty text-muted-fg">
        {{
          error
            ? "Something went wrong on our side. Try again in a minute."
            : "This share link doesn't exist or has been revoked by the student who made it."
        }}
      </p>
      <UButton to="/" icon="i-lucide-play" label="Sit the mock exam" size="lg" />
    </div>
  </section>
</template>
