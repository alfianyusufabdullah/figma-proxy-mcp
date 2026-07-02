import tseslint from "typescript-eslint";
import globals from "globals";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/node_modules/**", "eslint.config.mjs"],
  },
  tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["websocket/**/*.ts", "mcp-server/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ["plugin/**/*.ts"],
    languageOptions: {
      globals: { ...globals.browser, figma: "readonly" },
    },
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
    },
  },
);
