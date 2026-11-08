<script setup lang="ts">
// /privacy (LLD §14.1, PRD PR-1 to PR-5, EX-20, SE-3; T-219). Server-rendered.
// Keep the retention periods in step with convex/privacy.ts (30 days) and
// PR-5 (attempts kept until deleted).

useSeoMeta({
  title: "Privacy · Salus",
  description:
    "What Salus stores in your browser and on the server, how long it is kept, and how to export your progress or ask for deletion.",
});

interface Item {
  what: string;
  detail: string;
  kept: string;
}

const browserItems: Item[] = [
  {
    what: "Anonymous ID",
    detail:
      "A random code made the first time you visit, plus the display name you type, if any. It is how the site knows which attempts are yours.",
    kept: "Until you clear this site's data",
  },
  {
    what: "Answers in progress",
    detail:
      "A copy of your answers while you sit an exam, so a refresh or a dropped connection loses nothing.",
    kept: "Removed when the attempt ends",
  },
  {
    what: "Theme",
    detail: "Light or dark, if you change it.",
    kept: "Until you clear this site's data",
  },
];

const serverItems: Item[] = [
  {
    what: "Your attempts",
    detail:
      "Answers, flags, scores, start and finish times, the class you joined and your display name. Linked to a scrambled (hashed) copy of your anonymous ID, never the ID itself.",
    kept: "Until a tutor or the admin deletes them",
  },
  {
    what: "Share links",
    detail: "Only if you make one. You can revoke it from the same browser.",
    kept: "Until revoked or the attempt is deleted",
  },
  {
    what: "Hashed IP address",
    detail:
      "A one-way hash of your IP address, used only to stop abuse (rate limits) and for the staff audit log. The address itself isn't kept.",
    kept: "Deleted after 30 days",
  },
];

const staffItems: Item[] = [
  {
    what: "Email and role",
    detail: "Used only to send sign-in codes and invitations.",
    kept: "While the account exists",
  },
  {
    what: "Sign-in record",
    detail:
      "Sign-ins, sign-outs and failed codes in the audit log, with a hashed IP address. The sign-in system also keeps the IP address and browser of each session, and a per-address request counter.",
    kept: "IP addresses and hashes deleted after 30 days",
  },
];

const notCollected = [
  "No student emails, real names or accounts. A display name is optional unless you join a class.",
  "No advertising or analytics trackers.",
  "No IP addresses beyond the 30 days above.",
];
</script>

<template>
  <section
    class="mx-auto flex w-full max-w-[880px] min-w-0 flex-col gap-6 px-4 pt-4 pb-12 sm:px-12"
  >
    <header class="flex flex-col gap-3">
      <span
        class="grid size-14 place-items-center rounded-[18px] bg-brand-soft text-brand-ink"
        aria-hidden="true"
      >
        <UIcon name="i-lucide-shield-check" class="size-6" />
      </span>
      <h1 class="m-0 text-[28px] font-extrabold tracking-[-0.03em] sm:text-[34px]">Privacy</h1>
      <p class="m-0 text-base leading-[1.55] text-pretty text-muted-fg">
        Students don't sign up or give an email. Here is everything Salus keeps, where it lives and
        for how long.
      </p>
    </header>

    <section
      aria-labelledby="privacy-browser"
      class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
    >
      <h2 id="privacy-browser" class="m-0 flex items-center gap-2 text-lg font-extrabold">
        <UIcon name="i-lucide-monitor-smartphone" class="size-5 text-brand" aria-hidden="true" />
        In your browser
      </h2>
      <dl class="m-0 flex flex-col divide-y divide-line">
        <div
          v-for="item in browserItems"
          :key="item.what"
          class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6"
        >
          <dt class="flex-none font-semibold sm:w-44">{{ item.what }}</dt>
          <dd class="m-0 flex min-w-0 flex-1 flex-col gap-1">
            <span class="text-[15px] leading-[1.55]">{{ item.detail }}</span>
            <span class="text-sm font-semibold text-muted-fg">{{ item.kept }}</span>
          </dd>
        </div>
      </dl>
    </section>

    <section
      aria-labelledby="privacy-server"
      class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
    >
      <h2 id="privacy-server" class="m-0 flex items-center gap-2 text-lg font-extrabold">
        <UIcon name="i-lucide-server" class="size-5 text-brand" aria-hidden="true" />
        On our server
      </h2>
      <dl class="m-0 flex flex-col divide-y divide-line">
        <div
          v-for="item in serverItems"
          :key="item.what"
          class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6"
        >
          <dt class="flex-none font-semibold sm:w-44">{{ item.what }}</dt>
          <dd class="m-0 flex min-w-0 flex-1 flex-col gap-1">
            <span class="text-[15px] leading-[1.55]">{{ item.detail }}</span>
            <span class="text-sm font-semibold text-muted-fg">{{ item.kept }}</span>
          </dd>
        </div>
      </dl>
      <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
        Your tutor sees the attempts made with their class code. The admin can see all attempts.
        Nobody else can, unless you share a link.
      </p>
    </section>

    <section
      aria-labelledby="privacy-file"
      class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
    >
      <h2 id="privacy-file" class="m-0 flex items-center gap-2 text-lg font-extrabold">
        <UIcon name="i-lucide-file-key" class="size-5 text-brand" aria-hidden="true" />
        Moving your progress to another device
      </h2>
      <p class="m-0 text-[15px] leading-[1.55]">
        Your history is tied to the anonymous ID in this browser. Use
        <strong>Export progress</strong> on your history page to download
        <span class="font-mono text-sm">salus-progress.json</span>, then
        <strong>Import progress</strong> on the other device. Export before clearing your browser
        data, or your past results can't be found again.
      </p>
      <div role="note" class="flex gap-3 rounded-[24px] bg-warn-soft px-5 py-4 text-warn">
        <UIcon name="i-lucide-triangle-alert" class="mt-0.5 size-5 flex-none" aria-hidden="true" />
        <p class="m-0 text-[15px] leading-normal font-semibold">
          The file contains your anonymous ID. Anyone who has it can see and continue your attempts,
          so keep it private, like a password.
        </p>
      </div>
    </section>

    <section
      aria-labelledby="privacy-delete"
      class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
    >
      <h2 id="privacy-delete" class="m-0 flex items-center gap-2 text-lg font-extrabold">
        <UIcon name="i-lucide-trash-2" class="size-5 text-brand" aria-hidden="true" />
        Deleting your results
      </h2>
      <p class="m-0 text-[15px] leading-[1.55]">
        Ask your tutor to delete attempts made in their class, or ask the site admin for any other
        attempt. Deleting is permanent and also removes the attempt's share links. Clearing your
        browser data removes only what's in your browser, not what's on the server.
      </p>
    </section>

    <section
      aria-labelledby="privacy-staff"
      class="flex min-w-0 flex-col gap-4 rounded-[28px] bg-surface p-5 sm:p-6"
    >
      <h2 id="privacy-staff" class="m-0 flex items-center gap-2 text-lg font-extrabold">
        <UIcon name="i-lucide-key-round" class="size-5 text-brand" aria-hidden="true" />
        Tutors and the admin
      </h2>
      <dl class="m-0 flex flex-col divide-y divide-line">
        <div
          v-for="item in staffItems"
          :key="item.what"
          class="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:gap-6"
        >
          <dt class="flex-none font-semibold sm:w-44">{{ item.what }}</dt>
          <dd class="m-0 flex min-w-0 flex-1 flex-col gap-1">
            <span class="text-[15px] leading-[1.55]">{{ item.detail }}</span>
            <span class="text-sm font-semibold text-muted-fg">{{ item.kept }}</span>
          </dd>
        </div>
      </dl>
      <p class="m-0 text-[15px] leading-[1.55] text-muted-fg">
        Signing in sets a session cookie, which expires after 7 days without use.
      </p>
    </section>

    <section
      aria-labelledby="privacy-not"
      class="flex min-w-0 flex-col gap-3 rounded-[28px] bg-brand-soft p-5 text-brand-ink sm:p-6"
    >
      <h2 id="privacy-not" class="m-0 text-lg font-extrabold">What we don't collect</h2>
      <ul class="m-0 flex flex-col gap-2 p-0">
        <li
          v-for="line in notCollected"
          :key="line"
          class="flex gap-2 text-[15px] leading-[1.55] font-semibold"
        >
          <UIcon name="i-lucide-check" class="mt-1 size-4 flex-none" aria-hidden="true" />
          {{ line }}
        </li>
      </ul>
    </section>
  </section>
</template>
