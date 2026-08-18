/**
 * The lint script and its five plugins were declared in package.json, but no
 * configuration file existed — so `npm run lint` failed on startup and the
 * guard-rail had been off for a while.
 *
 * This config is deliberately set at a level the current code already passes,
 * so lint is green from day one and regressions are visible. The commented
 * rules below are the ratchet: turn them on as the debt is paid down.
 */
module.exports = {
  root: true,
  env: { browser: true, es2020: true },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:react-hooks/recommended",
  ],
  ignorePatterns: ["dist", "node_modules", ".eslintrc.cjs", "*.config.*"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: "latest",
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["react-refresh", "@typescript-eslint"],
  settings: { react: { version: "18.2" } },
  rules: {
    // Contexts and the toast helper export a hook alongside their provider.
    // That is the standard React pattern; the rule only costs a fast-refresh
    // round-trip in dev, so it is not worth restructuring three files for.
    "react-refresh/only-export-components": "off",

    // Real bugs, kept as errors.
    "no-unused-vars": "off", // superseded by the TypeScript-aware version
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],

    // ── Ratchet ───────────────────────────────────────────────────────────
    // ~400 `any` remain, mostly because src/types/index.ts drifted from the
    // API contract. Generating types from /openapi.json is the fix; until
    // then this would bury every other finding.
    "@typescript-eslint/no-explicit-any": "off",
    // Fires on `catch (e) {}` blocks that deliberately ignore parse errors.
    "no-empty": ["error", { allowEmptyCatch: true }],
  },
};
