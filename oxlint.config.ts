import { defineConfig } from "oxlint";

export default defineConfig({
  plugins: ["typescript", "unicorn", "oxc"],
  categories: {
    correctness: "error",
  },
  env: {
    builtin: true,
  },
  ignorePatterns: ["apps/web/src/routeTree.gen.ts"],
  overrides: [
    {
      // Server files follow the Effect convention of PascalCase modules.
      files: ["apps/web/src/**", "apps/mobile/src/**"],
      rules: { "unicorn/filename-case": ["error", { case: "kebabCase" }] },
    },
  ],
});
