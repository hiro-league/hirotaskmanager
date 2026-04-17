import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import type { Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** Lazy route chunks to hint the browser after first paint (bundle-preload); names come from Rollup chunk `fileName`. */
const BOARD_ROUTE_MODULE_PRELOAD_PATTERNS = [
  "BoardPage",
  "BoardView",
  "HomeRedirect",
] as const;

/**
 * Injects `<link rel="modulepreload">` for board-route chunks at build time so hashed asset paths stay correct.
 * Static `index.html` cannot reference `dist/assets/*.js` without this or a templating step.
 */
function modulePreloadBoardRouteChunks(): Plugin {
  return {
    name: "module-preload-board-route-chunks",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        const bundle = ctx.bundle;
        if (!bundle) return html;
        const tags: Array<{
          tag: string;
          attrs: Record<string, string>;
          injectTo: "head";
        }> = [];
        const seen = new Set<string>();
        for (const file of Object.values(bundle)) {
          if (file.type !== "chunk") continue;
          const fileName =
            "fileName" in file && typeof file.fileName === "string"
              ? file.fileName
              : "";
          if (!fileName.endsWith(".js")) continue;
          if (
            !BOARD_ROUTE_MODULE_PRELOAD_PATTERNS.some((p) =>
              fileName.includes(p),
            )
          ) {
            continue;
          }
          if (seen.has(fileName)) continue;
          seen.add(fileName);
          tags.push({
            tag: "link",
            attrs: { rel: "modulepreload", href: `/${fileName}` },
            injectTo: "head",
          });
        }
        if (tags.length === 0) return html;
        return { html, tags };
      },
    },
  };
}

/** Vendor splits for cacheable third-party groups (bundle-preload / manualChunks). */
function manualChunks(id: string): string | undefined {
  if (!id.includes("node_modules")) return;
  if (
    id.includes("node_modules/react-dom") ||
    id.includes("node_modules/react/") ||
    id.includes("node_modules/scheduler") ||
    id.includes("react-router")
  ) {
    return "react-vendor";
  }
  if (id.includes("@tanstack")) return "tanstack";
  if (id.includes("@dnd-kit")) return "dnd";
  if (id.includes("@radix-ui")) return "radix";
}

export default defineConfig({
  plugins: [react(), tailwindcss(), modulePreloadBoardRouteChunks()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src/client"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks,
      },
    },
  },
  server: {
    watch: {
      ignored: ["**/data/**"],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3002",
        changeOrigin: true,
      },
    },
  },
});
