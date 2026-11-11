<template>
  <div class="flex min-h-dvh flex-col bg-canvas text-fg">
    <AppHeader />
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
    <footer
      class="px-4 pb-6 text-xs text-muted-fg text-center flex-wrap sm:px-12 flex gap-5 items-center justify-center"
    >
      <span>Independent practice material. Not affiliated with or endorsed by CompTIA.</span>
      <span class="inline-flex items-center gap-2 px-2">
        Built by
        <a
          href="https://fibreware.dev"
          target="_blank"
          rel="noopener"
          aria-label="Fibreware"
          class="inline-flex rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          <img src="/fibreware-logo-light.png" alt="" class="h-3.5 w-auto dark:hidden" />
          <img src="/fibreware-logo-dark.png" alt="" class="hidden h-3.5 w-auto dark:block" />
        </a>
      </span>
    </footer>
  </div>
</template>
