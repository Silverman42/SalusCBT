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
    },
    input: {
      slots: {
        base: "rounded-2xl",
      },
    },
    card: {
      slots: {
        root: "rounded-[28px] shadow-none",
      },
    },
  },
});
