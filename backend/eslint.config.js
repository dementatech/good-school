import js from "@eslint/js";
import tsParser from "@typescript-eslint/parser";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import boundaries from "eslint-plugin-boundaries";

export default [
  js.configs.recommended,
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      boundaries,
    },
    settings: {
      "import/resolver": {
        typescript: true,
      },
      "boundaries/elements": [
        {
          type: "module",
          mode: "folder",
          pattern: "src/modules/*",
          capture: ["module"],
        },
        {
          type: "shared",
          mode: "folder",
          pattern: "src/shared/*",
        },
      ],
    },
    rules: {
      // TypeScript/tsc already covers these; the base rules misfire on
      // ambient `declare module` augmentation and TS-only syntax.
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      // A module's /domain and /api internals are private — only its index.ts
      // is a valid import target from outside the module (see claude.md §1).
      "boundaries/entry-point": [
        "error",
        {
          default: "disallow",
          rules: [{ target: ["module", "shared"], allow: "index.ts" }],
        },
      ],
    },
  },
  {
    ignores: ["dist/", "node_modules/"],
  },
];
