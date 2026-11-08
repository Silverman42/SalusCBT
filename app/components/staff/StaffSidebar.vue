<script setup lang="ts">
// Sidebar body for layouts/staff.vue (mockup screens 09 and 10): logo, the
// area's links, and the signed-in person's chip with "Sign out" (AU-4).
// Browser only (staff pages are client-rendered).
import { computed } from "vue";
import { api } from "~~/convex/_generated/api";
import { useStaffQuery } from "~/composables/useStaffQuery";
import { displayName, initials } from "~/lib/admin";
import { HOME_BY_ROLE } from "~/lib/authGuard";
import { activeNavItem, ROLE_LABEL, STAFF_NAV, staffAreaOf } from "~/lib/staffNav";

defineEmits<{ navigate: [] }>();

const route = useRoute();
const area = computed(() => staffAreaOf(route.path));
const items = computed(() => STAFF_NAV[area.value]);
const active = computed(() => activeNavItem(items.value, route.path));

const { data: me } = useStaffQuery(api.profiles.me, {});
const role = computed(() => me.value?.role ?? area.value);
</script>

<template>
  <div class="flex h-full flex-col gap-1.5">
    <NuxtLink
      :to="HOME_BY_ROLE[area]"
      class="flex items-center gap-2.5 px-2 pb-[22px] text-fg"
      @click="$emit('navigate')"
    >
      <span class="grid size-9 place-items-center rounded-[12px] bg-brand text-white">
        <UIcon name="i-lucide-shield" class="size-[18px]" />
      </span>
      <span class="text-xl font-extrabold tracking-[-0.02em]">Salus</span>
      <span class="sr-only">{{ ROLE_LABEL[area] }} home</span>
    </NuxtLink>

    <nav :aria-label="`${ROLE_LABEL[area]} sections`">
      <ul class="m-0 flex list-none flex-col gap-1.5 p-0">
        <li v-for="item in items" :key="item.to">
          <NuxtLink
            :to="item.to"
            :aria-current="active?.to === item.to ? 'page' : undefined"
            class="flex items-center gap-3 rounded-[16px] px-3.5 py-3 text-[15px] transition-colors"
            :class="
              active?.to === item.to
                ? 'bg-brand-soft font-bold text-brand-ink'
                : 'font-semibold text-muted-fg hover:bg-surface-2 hover:text-fg'
            "
            @click="$emit('navigate')"
          >
            <UIcon :name="item.icon" class="size-[18px] flex-none" />
            {{ item.label }}
          </NuxtLink>
        </li>
      </ul>
    </nav>

    <div class="flex-1" />

    <div class="flex items-center gap-2.5 rounded-[18px] bg-surface-2 p-3">
      <span
        class="grid size-9 flex-none place-items-center rounded-full text-sm font-extrabold"
        :class="role === 'admin' ? 'bg-fg text-canvas' : 'bg-brand text-white'"
        aria-hidden="true"
      >
        {{ me ? initials(me.name, me.email) : "" }}
      </span>
      <div class="flex min-w-0 flex-1 flex-col">
        <span class="truncate text-sm font-bold">
          {{ me ? displayName(me.name, me.email) : "Loading…" }}
        </span>
        <span class="text-xs text-muted-fg">{{ ROLE_LABEL[role] }}</span>
      </div>
      <AuthSignOutButton compact />
    </div>
  </div>
</template>
