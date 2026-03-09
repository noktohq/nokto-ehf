import { vitePlugin as remix } from "@remix-run/dev";
import { defineConfig, type UserConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [
    remix({
      ignoredRouteFiles: ["**/.*"],
      future: {
        v3_fetcherPersist: true,
        v3_relativeSplatPath: true,
        v3_throwAbortReason: true,
      },
    }),
    tsconfigPaths({ root: __dirname }),
  ],
  build: {
    assetsInlineLimit: 0,
  },
  server: {
    port: 3000,
    warmup: {
      clientFiles: ["./app/entry.client.tsx", "./app/root.tsx", "./app/routes/**/*.tsx"],
    },
  },
  optimizeDeps: {
    include: ["@shopify/polaris"],
  },
}) satisfies UserConfig;