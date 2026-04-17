import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
import { vitestClientShouldLogConsole } from "./src/client/test/vitestConsoleFilter";
import viteConfig from "./vite.config";

// Client-only Vitest suite: DOM/component tests can use `environmentMatchGlobs` later.
export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      include: ["src/client/**/*.test.ts", "src/client/**/*.test.tsx"],
      // jsdom so setup can patch matchMedia/ResizeObserver and RTL cleanup runs in a DOM.
      environment: "jsdom",
      setupFiles: ["src/client/test/vitest-setup.ts"],
      /** Suppress React dev duplicate stderr; see `vitestConsoleFilter.ts`. */
      onConsoleLog(log: string, type: "stdout" | "stderr") {
        return vitestClientShouldLogConsole(log, type);
      },
      /** Keep assertion diffs readable when values are huge. */
      diff: {
        truncateThreshold: 2000,
        contextLines: 4,
        truncateAnnotation: " … [diff truncated for readability]",
      },
      chaiConfig: {
        truncateThreshold: 400,
      },
    },
  }),
);
