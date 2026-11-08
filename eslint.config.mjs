// @ts-check
import prettier from "eslint-config-prettier";
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  {
    ignores: ["convex/_generated/**", "content/**", "mockup/**", "docs/**", "tasks/**"],
  },
  prettier,
);
