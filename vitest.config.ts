import { mergeConfig } from "vite";
import { defineConfig } from "vitest/config";
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
    },
  }),
);
