<template>
  <div class="flex min-h-dvh flex-col bg-canvas text-fg">
    <AppHeader />
    <main class="flex flex-1 flex-col">
      <slot />
    </main>
    <footer class="px-4 pb-6 text-xs text-muted-fg sm:px-12">
      Independent practice material. Not affiliated with or endorsed by CompTIA.
    </footer>
  </div>
</template>
