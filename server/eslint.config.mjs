import js from "@eslint/js";
import tseslint from "typescript-eslint";
import nodePlugin from "eslint-plugin-n";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  {
    plugins: {
      n: nodePlugin,
    },
    rules: {
      ...nodePlugin.configs.recommended.rules,

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      // Express router.get/post/etc. has void return type — async handlers are idiomatic
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { arguments: false } },
      ],

      // TypeScript handles imports — disable duplicate Node checks
      "n/no-missing-import": "off",
      "n/no-unpublished-import": "off",
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
  },

  // Test files — relax rules that create noise without catching bugs
  {
    files: ["**/*.test.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/require-await": "off",
      // Vitest expect() matchers trigger unbound-method false positives
      "@typescript-eslint/unbound-method": "off",
    },
  },

  {
    ignores: ["dist/**", "node_modules/**"],
  },
);
