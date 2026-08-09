import js from "@eslint/js";
import globals from "globals";
import tseslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

export default [
  {
    ignores: ["node_modules/**", "dist/**", "coverage/**"],
  },
  js.configs.recommended,
  {
    files: ["index.ts", "src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "max-lines": ["warn", { max: 400, skipBlankLines: true, skipComments: true }],
      "max-statements": ["warn", { max: 80 }],
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },
  {
    files: ["src/infra/commands.ts"],
    rules: { "max-statements": "off" },
  },
];
