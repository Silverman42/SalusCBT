// @ts-check
import prettier from "eslint-config-prettier";
import withNuxt from "./.nuxt/eslint.config.mjs";

export default withNuxt(
  {
    ignores: [
      "convex/_generated/**",
      "content/**",
      "mockup/**",
      "docs/**",
      "tasks/**",
      ".claude/**",
      ".agents/**",
    ],
  },
  {
    // SE-1: answer keys stay on the server. Browser code must not import marking
    // code or the source exam (which holds the answer key).
    files: ["app/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["**/convex/marking/**"], message: "Marking code is server-only (SE-1)." },
            {
              group: ["**/content/source/**"],
              message: "Source content holds answer keys (SE-1).",
            },
          ],
        },
      ],
    },
  },
  prettier,
);
