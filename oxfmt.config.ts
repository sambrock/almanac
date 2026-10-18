import { defineConfig } from "oxfmt";

export default defineConfig({
  sortImports: {
    groups: [
      ["builtin", "external"],
      ["internal", "subpath", "parent", "sibling", "index", "style"],
      "unknown",
    ],
  },
  ignorePatterns: ["apps/web/src/routeTree.gen.ts"],
});
