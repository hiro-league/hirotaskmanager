// Minimal ESLint config: single purpose is to prevent regressions of recently
// centralized constants (loopback URL, default ports). Not a full lint sweep.
// Run via `npm run lint:guardrails`.
import tseslint from "typescript-eslint";

// Shim: tolerate pre-existing `eslint-disable-next-line react-hooks/...`
// comments without pulling in the full react-hooks plugin. Stub rules never report.
const reactHooksShim = {
  rules: {
    "exhaustive-deps": { meta: { schema: [] }, create: () => ({}) },
    "rules-of-hooks": { meta: { schema: [] }, create: () => ({}) },
  },
};

// esquery uses /.../ for regex literals inside selectors, so unescaped "/"
// terminates the pattern. Escape each slash.
const LOOPBACK_URL_REGEX = "http:\\/\\/127\\.0\\.0\\.1";

// no-restricted-syntax messages surface as-is; keep them actionable.
const GUARDRAIL_RULES = {
  "no-restricted-syntax": [
    "error",
    {
      selector: `Literal[value=/${LOOPBACK_URL_REGEX}/]`,
      message:
        "Do not hardcode http://127.0.0.1 URLs. Use buildLocalServerUrl(port) from src/shared/serverStatus.ts.",
    },
    {
      selector: `TemplateElement[value.raw=/${LOOPBACK_URL_REGEX}/]`,
      message:
        "Do not hardcode http://127.0.0.1 URLs in template strings. Use buildLocalServerUrl(port) from src/shared/serverStatus.ts.",
    },
    {
      selector: "Literal[value=3001]",
      message:
        "Do not hardcode port 3001. Import INSTALLED_DEFAULT_PORT from src/shared/ports.ts.",
    },
    {
      selector: "Literal[value=3002]",
      message:
        "Do not hardcode port 3002. Import DEV_DEFAULT_PORT from src/shared/ports.ts.",
    },
  ],
};

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "e2e/**",
      "docs/**",
      "scripts/**",
      "**/*.test.ts",
      "**/*.test.tsx",
      // Owners of the constants themselves must contain the literals.
      "src/shared/serverStatus.ts",
      "src/shared/ports.ts",
    ],
  },
  {
    files: ["src/**/*.ts", "src/**/*.tsx"],
    plugins: {
      "react-hooks": reactHooksShim,
    },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: "off",
    },
    rules: GUARDRAIL_RULES,
  },
);
