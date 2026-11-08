export default defineAppConfig({
  ui: {
    colors: {
      primary: "salus",
      neutral: "ink",
    },
    // Mockup: pill buttons, soft rounded inputs, flat surfaces with no shadows.
    button: {
      slots: {
        base: "rounded-full font-semibold",
      },
      // Mockup soft buttons: --prs fill with --pri text. Nuxt UI's text-primary
      // (#6140FF) on primary/10 is 4.49:1 in light mode (X-01 axe).
      compoundVariants: [
        { color: "primary", variant: "soft", class: "text-brand-ink" },
        { color: "primary", variant: "subtle", class: "text-brand-ink" },
      ],
    },
    // Mockup fields: 16px corners. Named radii scale with --ui-radius (1rem),
    // so rounded-2xl would be 64px.
    input: {
      slots: {
        base: "rounded-[16px]",
      },
    },
    card: {
      slots: {
        root: "rounded-[28px] shadow-none",
      },
    },
  },
});
