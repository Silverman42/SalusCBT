<!-- Landing illustration from mockup screen 01. Decorative only. CSS-animated;
     every animation is switched off under prefers-reduced-motion. -->
<template>
  <div class="hero-art relative overflow-hidden rounded-[36px] bg-[#6140FF]">
    <svg
      viewBox="0 0 520 600"
      preserveAspectRatio="xMidYMid slice"
      class="block h-full w-full"
      aria-hidden="true"
    >
      <defs>
        <clipPath id="hero-shield-clip">
          <path
            d="M260 172 L344 205 V284 C344 342 307 384 260 406 C213 384 176 342 176 284 V205 Z"
          />
        </clipPath>
        <linearGradient id="hero-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#fff" stop-opacity="0" />
          <stop offset="0.5" stop-color="#fff" stop-opacity="0.9" />
          <stop offset="1" stop-color="#fff" stop-opacity="0" />
        </linearGradient>
      </defs>

      <circle class="hero-blob-a" cx="430" cy="110" r="190" fill="#7457FF" />
      <circle class="hero-blob-b" cx="60" cy="560" r="150" fill="#5130F0" />

      <!-- Network -->
      <g class="hero-network">
        <g stroke="#9C88FF" stroke-width="3">
          <line x1="72" y1="96" x2="152" y2="62" />
          <line x1="72" y1="96" x2="118" y2="176" />
          <line x1="152" y1="62" x2="118" y2="176" />
        </g>
        <circle class="hero-ping" cx="118" cy="176" r="18" fill="none" stroke="#C3B6FF" stroke-width="3" />
        <circle class="hero-node" cx="72" cy="96" r="14" fill="#C3B6FF" />
        <circle class="hero-node hero-node-2" cx="152" cy="62" r="10" fill="#fff" />
        <circle cx="118" cy="176" r="18" fill="#9C88FF" />
        <circle class="hero-node hero-node-3" cx="118" cy="176" r="7" fill="#fff" />
      </g>

      <!-- Shield -->
      <g class="hero-float hero-float-a">
        <path
          d="M260 140 L372 184 V282 C372 358 322 412 260 440 C198 412 148 358 148 282 V184 Z"
          fill="#fff"
        />
        <path
          d="M260 172 L344 205 V284 C344 342 307 384 260 406 C213 384 176 342 176 284 V205 Z"
          fill="#EAE5FF"
        />
        <g clip-path="url(#hero-shield-clip)">
          <rect class="hero-scan" x="170" y="150" width="180" height="44" fill="url(#hero-scan)" />
        </g>
        <path
          class="hero-check"
          d="M216 286 L250 320 L310 250"
          pathLength="1"
          fill="none"
          stroke="#6140FF"
          stroke-width="20"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      </g>

      <!-- Terminal -->
      <g class="hero-float hero-float-b">
        <rect x="36" y="402" width="236" height="150" rx="24" fill="#3A1FC9" />
        <circle cx="62" cy="428" r="6" fill="#C3B6FF" />
        <circle cx="80" cy="428" r="6" fill="#9C88FF" />
        <circle cx="98" cy="428" r="6" fill="#7457FF" />
        <path
          d="M60 464 l12 10 l-12 10"
          fill="none"
          stroke="#fff"
          stroke-width="4"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <rect class="hero-line hero-line-1" x="84" y="468" width="120" height="12" rx="6" fill="#9C88FF" />
        <rect class="hero-line hero-line-2" x="60" y="496" width="170" height="12" rx="6" fill="#7457FF" />
        <rect class="hero-line hero-line-3" x="60" y="520" width="96" height="12" rx="6" fill="#7457FF" />
        <rect class="hero-cursor" x="164" y="518" width="12" height="16" rx="3" fill="#fff" />
      </g>

      <!-- Timer -->
      <g class="hero-float hero-float-c">
        <circle cx="412" cy="468" r="72" fill="#fff" />
        <circle cx="412" cy="468" r="50" fill="none" stroke="#EAE5FF" stroke-width="14" />
        <circle
          class="hero-ring"
          cx="412"
          cy="468"
          r="50"
          fill="none"
          stroke="#6140FF"
          stroke-width="14"
          stroke-dasharray="230 400"
          stroke-linecap="round"
          transform="rotate(-90 412 468)"
        />
        <g class="hero-hand">
          <path
            d="M412 446 V470 L428 480"
            fill="none"
            stroke="#17122F"
            stroke-width="6"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </g>
      </g>

      <!-- Sparkles -->
      <g class="hero-twinkle" fill="#fff">
        <rect x="448" y="292" width="6" height="26" rx="3" />
        <rect x="438" y="302" width="26" height="6" rx="3" />
      </g>
      <g class="hero-twinkle hero-twinkle-2" fill="#C3B6FF">
        <rect x="96" y="300" width="5" height="20" rx="2.5" />
        <rect x="88.5" y="307.5" width="20" height="5" rx="2.5" />
      </g>
      <circle class="hero-twinkle hero-twinkle-3" cx="470" cy="226" r="7" fill="#C3B6FF" />
      <circle class="hero-twinkle hero-twinkle-4" cx="300" cy="80" r="5" fill="#fff" />
    </svg>
    <div class="absolute inset-x-7 top-7 flex flex-wrap gap-2">
      <span
        v-for="(chip, i) in ['90 min', '102 points', '750 to pass']"
        :key="chip"
        class="hero-chip rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[#4A2BE0]"
        :style="{ animationDelay: `${150 + i * 90}ms` }"
      >
        {{ chip }}
      </span>
    </div>
  </div>
</template>

<style scoped>
/* SVG transforms: rotate/scale each shape around its own centre. */
.hero-blob-a,
.hero-blob-b,
.hero-node,
.hero-ping,
.hero-float,
.hero-scan,
.hero-line,
.hero-twinkle {
  transform-box: fill-box;
  transform-origin: center;
}

/* Background blobs breathe slowly. */
.hero-blob-a {
  animation: hero-breathe 14s ease-in-out infinite;
}
.hero-blob-b {
  animation: hero-breathe 18s ease-in-out -6s infinite;
}

/* Network nodes pulse; the hub sends out a ping. */
.hero-node {
  animation: hero-pulse 3s ease-in-out infinite;
}
.hero-node-2 {
  animation-delay: -1s;
}
.hero-node-3 {
  animation-delay: -2s;
}
.hero-ping {
  animation: hero-ping 3s ease-out infinite;
}

/* The three cards float out of step with each other. */
.hero-float {
  animation: hero-float 7s ease-in-out infinite;
}
.hero-float-b {
  animation-duration: 8s;
  animation-delay: -3s;
}
.hero-float-c {
  animation-duration: 9s;
  animation-delay: -5s;
}

/* Shield: the tick draws itself, then a scan line sweeps down now and then. */
.hero-check {
  stroke-dasharray: 1;
  animation: hero-draw 900ms cubic-bezier(0.65, 0, 0.35, 1) 400ms both;
}
.hero-scan {
  opacity: 0;
  animation: hero-scan 5s ease-in-out 1.4s infinite;
}

/* Terminal: lines type in, cursor blinks. */
.hero-line {
  transform-origin: left center;
  animation: hero-type 600ms ease-out both;
}
.hero-line-1 {
  animation-delay: 300ms;
}
.hero-line-2 {
  animation-delay: 650ms;
}
.hero-line-3 {
  animation-delay: 1000ms;
}
.hero-cursor {
  animation: hero-blink 1.1s steps(1) 1.3s infinite;
}

/* Timer: the ring fills in, the hand ticks round. */
.hero-ring {
  animation: hero-ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) 300ms both;
}
.hero-hand {
  transform-box: view-box;
  transform-origin: 412px 468px;
  animation: hero-spin 12s steps(60) infinite;
}

/* Sparkles twinkle. */
.hero-twinkle {
  animation: hero-twinkle 2.8s ease-in-out infinite;
}
.hero-twinkle-2 {
  animation-delay: -0.7s;
}
.hero-twinkle-3 {
  animation-delay: -1.4s;
}
.hero-twinkle-4 {
  animation-delay: -2.1s;
}

/* Chips drop in on load. */
.hero-chip {
  animation: hero-chip-in 500ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

@keyframes hero-breathe {
  50% {
    transform: scale(1.06) translate(-1%, 1%);
  }
}
@keyframes hero-pulse {
  50% {
    transform: scale(1.18);
  }
}
@keyframes hero-ping {
  0% {
    transform: scale(1);
    opacity: 0.9;
  }
  80%,
  100% {
    transform: scale(2.6);
    opacity: 0;
  }
}
@keyframes hero-float {
  50% {
    transform: translateY(-10px);
  }
}
@keyframes hero-draw {
  from {
    stroke-dashoffset: 1;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes hero-scan {
  0% {
    transform: translateY(0);
    opacity: 0;
  }
  10% {
    opacity: 0.7;
  }
  45% {
    transform: translateY(250px);
    opacity: 0.7;
  }
  50%,
  100% {
    transform: translateY(250px);
    opacity: 0;
  }
}
@keyframes hero-type {
  from {
    transform: scaleX(0);
  }
}
@keyframes hero-blink {
  50% {
    opacity: 0;
  }
}
@keyframes hero-ring {
  from {
    stroke-dashoffset: 230;
  }
  to {
    stroke-dashoffset: 0;
  }
}
@keyframes hero-spin {
  to {
    transform: rotate(360deg);
  }
}
@keyframes hero-twinkle {
  50% {
    transform: scale(0.55) rotate(45deg);
    opacity: 0.45;
  }
}
@keyframes hero-chip-in {
  from {
    transform: translateY(-8px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .hero-art *,
  .hero-art svg * {
    animation: none !important;
  }
}
</style>
