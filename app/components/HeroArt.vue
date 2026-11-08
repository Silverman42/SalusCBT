<!-- Landing illustration from mockup screen 01. Decorative only. -->
<template>
  <div class="relative overflow-hidden rounded-[36px] bg-[#6140FF]">
    <svg
      viewBox="0 0 520 600"
      preserveAspectRatio="xMidYMid slice"
      class="block h-full w-full"
      aria-hidden="true"
    >
      <circle cx="430" cy="110" r="190" fill="#7457FF" />
      <circle cx="60" cy="560" r="150" fill="#5130F0" />
      <g stroke="#9C88FF" stroke-width="3">
        <line x1="72" y1="96" x2="152" y2="62" />
        <line x1="72" y1="96" x2="118" y2="176" />
        <line x1="152" y1="62" x2="118" y2="176" />
      </g>
      <circle cx="72" cy="96" r="14" fill="#C3B6FF" />
      <circle cx="152" cy="62" r="10" fill="#fff" />
      <circle cx="118" cy="176" r="18" fill="#9C88FF" />
      <circle cx="118" cy="176" r="7" fill="#fff" />
      <path
        d="M260 140 L372 184 V282 C372 358 322 412 260 440 C198 412 148 358 148 282 V184 Z"
        fill="#fff"
      />
      <path
        d="M260 172 L344 205 V284 C344 342 307 384 260 406 C213 384 176 342 176 284 V205 Z"
        fill="#EAE5FF"
      />
      <path
        d="M216 286 L250 320 L310 250"
        fill="none"
        stroke="#6140FF"
        stroke-width="20"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
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
      <rect x="84" y="468" width="120" height="12" rx="6" fill="#9C88FF" />
      <rect x="60" y="496" width="170" height="12" rx="6" fill="#7457FF" />
      <rect x="60" y="520" width="96" height="12" rx="6" fill="#7457FF" />
      <rect x="164" y="518" width="12" height="16" rx="3" fill="#fff" />
      <circle cx="412" cy="468" r="72" fill="#fff" />
      <circle cx="412" cy="468" r="50" fill="none" stroke="#EAE5FF" stroke-width="14" />
      <circle
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
      <path
        d="M412 446 V470 L428 480"
        fill="none"
        stroke="#17122F"
        stroke-width="6"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
      <g fill="#fff">
        <rect x="448" y="292" width="6" height="26" rx="3" />
        <rect x="438" y="302" width="26" height="6" rx="3" />
      </g>
      <g fill="#C3B6FF">
        <rect x="96" y="300" width="5" height="20" rx="2.5" />
        <rect x="88.5" y="307.5" width="20" height="5" rx="2.5" />
      </g>
      <circle cx="470" cy="226" r="7" fill="#C3B6FF" />
      <circle cx="300" cy="80" r="5" fill="#fff" />
    </svg>
    <div class="absolute inset-x-7 top-7 flex flex-wrap gap-2">
      <span
        v-for="chip in ['90 min', '102 points', '750 to pass']"
        :key="chip"
        class="rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-[#4A2BE0]"
      >
        {{ chip }}
      </span>
    </div>
  </div>
</template>
