<script setup lang="ts">
// /admin/exam (LLD §14.1): default exam versions, read-only until Stage 6.
// There is no admin query for versions yet, so this page explains where the
// default comes from; the "Default exam" sidebar item is in mockup screen 10.
definePageMeta({ middleware: "admin", layout: "staff", title: "Default exam" });
</script>

<template>
  <section
    class="flex flex-col gap-4 rounded-[28px] bg-surface px-[22px] py-5 sm:flex-row sm:items-start"
    aria-labelledby="default-exam-heading"
  >
    <span
      class="grid size-11 flex-none place-items-center rounded-[14px] bg-brand-soft text-brand-ink"
      aria-hidden="true"
    >
      <UIcon name="i-lucide-layers" class="size-5" />
    </span>
    <div class="flex max-w-[640px] flex-col gap-2">
      <h2 id="default-exam-heading" class="m-0 text-base font-extrabold">
        Security+ SY0-701 · from the seed import
      </h2>
      <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
        Students without a class code sit the default exam. Right now that's the version the seed
        script imported from the source exam. Each import is logged in the
        <NuxtLink to="/admin/audit" class="font-semibold text-brand-ink hover:underline">
          audit log
        </NuxtLink>
        as a published version and a change of default.
      </p>
      <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
        Choosing a different default version, and seeing every version here, comes with exam version
        publishing. Until then this page is read-only.
      </p>
    </div>
  </section>
</template>
