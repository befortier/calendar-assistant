import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import jsxA11y from "eslint-plugin-jsx-a11y";

export default tseslint.config(
  js.configs.recommended,

  ...tseslint.configs.recommendedTypeChecked,

  {
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooks,
      "jsx-a11y": jsxA11y,
    },
    settings: {
      react: { version: "detect" },
    },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.configs.recommended.rules,

      // React 17+ JSX transform — no need to import React
      "react/react-in-jsx-scope": "off",
      // TypeScript handles prop-types
      "react/prop-types": "off",
      // Allow " in JSX text content (common in placeholder/label copy)
      "react/no-unescaped-entities": "off",
      // autoFocus is valid and recommended by ARIA for modal dialogs (focus the
      // first interactive element on open). The rule can't distinguish modals
      // from arbitrary page elements, so disable globally.
      "jsx-a11y/no-autofocus": "off",

      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-floating-promises": "error",
      // React event handlers (onClick, onChange) and third-party callbacks
      // (e.g. useGoogleLogin's onSuccess) commonly accept async functions even
      // though their type signatures declare void returns. Allow both.
      "@typescript-eslint/no-misused-promises": [
        "error",
        { checksVoidReturn: { attributes: false, properties: false } },
      ],
    },
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },

  // Test files — relax rules that create noise without catching bugs
  {
    files: ["**/*.test.tsx", "**/*.test.ts", "**/test-setup.ts"],
    rules: {
      "@typescript-eslint/no-floating-promises": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-return": "off",
      "@typescript-eslint/require-await": "off",
      // Vitest expect() matchers trigger unbound-method false positives
      "@typescript-eslint/unbound-method": "off",
      // Component props named "role" (e.g. role="user") are not ARIA roles
      "jsx-a11y/aria-role": "off",
    },
  },

  {
    ignores: ["dist/**", "node_modules/**", "vite.config.ts"],
  },
);
