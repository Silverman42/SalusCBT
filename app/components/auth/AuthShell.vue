<script setup lang="ts">
// Two-column frame for /sign-in and /invite/[token], after mockup screen 08:
// a brand panel on the left (wide screens only) and the form on the right.
defineProps<{
  /** Line under the panel headline. */
  tagline?: string;
}>();
</script>

<template>
  <section
    class="mx-auto grid w-full max-w-[1280px] min-w-0 flex-1 gap-5 px-4 pt-2 pb-10 sm:px-12 lg:grid-cols-[minmax(0,500px)_minmax(0,1fr)] lg:px-5"
  >
    <div
      class="hidden flex-col overflow-hidden rounded-[32px] bg-salus-500 text-white lg:flex"
      aria-hidden="true"
    >
      <div class="flex items-center gap-2.5 px-9 pt-8">
        <span class="text-[13px] font-bold tracking-[0.06em] text-salus-100 uppercase">
          Staff
        </span>
      </div>
      <svg viewBox="0 0 520 420" class="mx-auto my-auto block w-full max-w-[460px]">
        <circle cx="260" cy="210" r="190" fill="#7457FF" />
        <rect x="110" y="140" width="300" height="200" rx="36" fill="#fff" />
        <path
          d="M126 162 L260 258 L394 162"
          fill="none"
          stroke="#C3B6FF"
          stroke-width="12"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <path
          d="M130 322 L222 244 M390 322 L298 244"
          fill="none"
          stroke="#EAE5FF"
          stroke-width="10"
          stroke-linecap="round"
        />
        <rect x="228" y="52" width="250" height="78" rx="39" fill="#3A1FC9" />
        <g fill="#fff">
          <circle cx="268" cy="91" r="9" />
          <circle cx="302" cy="91" r="9" />
          <circle cx="336" cy="91" r="9" />
          <circle cx="370" cy="91" r="9" />
          <circle cx="404" cy="91" r="9" />
        </g>
        <rect x="428" y="78" width="6" height="26" rx="3" fill="#C3B6FF" />
        <circle cx="96" cy="330" r="46" fill="#3A1FC9" />
        <circle cx="96" cy="330" r="18" fill="none" stroke="#fff" stroke-width="8" />
        <path
          d="M110 344 L160 394 M140 374 l14 -14 M152 386 l12 -12"
          fill="none"
          stroke="#fff"
          stroke-width="8"
          stroke-linecap="round"
        />
        <g fill="#fff">
          <rect x="452" y="282" width="6" height="26" rx="3" />
          <rect x="442" y="292" width="26" height="6" rx="3" />
        </g>
        <circle cx="80" cy="110" r="8" fill="#C3B6FF" />
      </svg>
      <div class="flex flex-col gap-2 px-10 pb-10">
        <span class="text-[28px] leading-[1.15] font-extrabold tracking-[-0.02em]">
          No passwords. Just a code in your inbox.
        </span>
        <span class="text-[15px] text-salus-100">
          {{ tagline ?? "Tutors join by invitation from the admin." }}
        </span>
      </div>
    </div>

    <div class="flex min-w-0 items-start justify-center pt-6 sm:pt-12 lg:items-center lg:pt-0">
      <div class="flex w-full max-w-[440px] min-w-0 flex-col gap-6">
        <slot />
      </div>
    </div>
  </section>
</template>
