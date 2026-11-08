<script setup lang="ts">
// Firewall PBQ network diagram (T-306), drawn as SVG from the payload's ASCII
// art after mockup screen 04: sources, the firewall, the protected zones.
// All labels are SVG text nodes (no HTML injection, SE-6). Colours are theme
// tokens, so it reads in light and dark. Two layouts, picked by the width it
// gets (container query): wide, and a narrow stacked one so text stays full
// size at 375 px. The original text is
// always one click away, and is all that shows when it can't be parsed.
import { describeDiagram, diagramLayout, parseNetworkDiagram } from "~/lib/pbq/firewall";

const props = defineProps<{ diagram: string; id: string }>();

const net = computed(() => parseNetworkDiagram(props.diagram));
const layouts = computed(() =>
  net.value
    ? [
        { key: "wide", cls: "hidden @2xl:block", layout: diagramLayout(net.value, true) },
        { key: "narrow", cls: "mx-auto @2xl:hidden", layout: diagramLayout(net.value, false) },
      ]
    : [],
);
const label = computed(() => (net.value ? describeDiagram(net.value) : "Network diagram"));

const BOX_FILL = { source: "fill-surface-2", zone: "fill-brand-soft", firewall: "fill-brand" };
const TITLE_FILL = { source: "fill-fg", zone: "fill-brand-ink", firewall: "fill-white" };
const preClass =
  "m-0 min-w-0 overflow-x-auto rounded-[20px] bg-code p-4 font-mono text-[12.5px] leading-relaxed text-code-fg";
</script>

<template>
  <figure
    :id="id"
    tabindex="0"
    role="region"
    aria-label="Network diagram"
    class="@container m-0 flex min-w-0 flex-col gap-2 rounded-[24px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
  >
    <template v-if="net">
      <svg
        v-for="v in layouts"
        :key="v.key"
        :class="v.cls"
        :viewBox="`0 0 ${v.layout.width} ${v.layout.height}`"
        class="h-auto w-full"
        :style="{ maxWidth: `${v.layout.width}px` }"
        role="img"
        :aria-label="label"
      >
        <g class="stroke-line" fill="none" stroke-width="3" stroke-dasharray="6 7">
          <path v-for="(d, i) in v.layout.links" :key="i" :d="d" />
        </g>
        <g v-for="(b, i) in v.layout.boxes" :key="i">
          <rect
            :x="b.x"
            :y="b.y"
            :width="b.w"
            :height="b.h"
            :rx="b.kind === 'firewall' ? 24 : 20"
            :class="BOX_FILL[b.kind]"
          />
          <template v-if="b.kind === 'firewall'">
            <!-- Brick-wall icon, as in the mockup. -->
            <g fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round">
              <line :x1="b.x + 18" :y1="b.y + 20" :x2="b.x + 48" :y2="b.y + 20" />
              <line :x1="b.x + 18" :y1="b.y + 32" :x2="b.x + 48" :y2="b.y + 32" />
              <line :x1="b.x + 18" :y1="b.y + 44" :x2="b.x + 48" :y2="b.y + 44" />
              <line :x1="b.x + 28" :y1="b.y + 20" :x2="b.x + 28" :y2="b.y + 32" />
              <line :x1="b.x + 38" :y1="b.y + 32" :x2="b.x + 38" :y2="b.y + 44" />
            </g>
            <text :x="b.x + 60" :y="b.y + 37" class="fill-white text-[14px] font-bold">
              {{ b.title }}
            </text>
          </template>
          <template v-else>
            <text
              :x="b.x + 16"
              :y="b.subtitle ? b.y + 27 : b.y + 37"
              :class="TITLE_FILL[b.kind]"
              class="text-[14px] font-bold"
            >
              {{ b.title }}
            </text>
            <text
              v-if="b.subtitle"
              :x="b.x + 16"
              :y="b.y + 46"
              class="fill-muted-fg font-mono text-[12px] font-medium"
            >
              {{ b.subtitle }}
            </text>
          </template>
        </g>
      </svg>
    </template>

    <details v-if="net" class="min-w-0">
      <summary
        class="w-fit cursor-pointer rounded-[12px] text-[13px] font-semibold text-muted-fg focus-visible:outline-2 focus-visible:outline-brand"
      >
        Diagram as text
      </summary>
      <pre :class="preClass" class="mt-2">{{ diagram }}</pre>
    </details>
    <pre v-else :class="preClass">{{ diagram }}</pre>
  </figure>
</template>
