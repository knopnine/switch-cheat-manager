import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  base: "./",
  plugins: [
    react(),
    VitePWA({
      registerType: "prompt",
      includeAssets: [
        "icon.svg",
        "icon-192.png",
        "icon-512.png",
        "LICENSE.txt",
        "ATTRIBUTION.txt",
        "source.zip",
        "USER_GUIDE.md",
      ],
      manifest: {
        name: "Switch Cheats Manager",
        short_name: "Cheats Manager",
        description: "A local workspace for Nintendo Switch cheat files.",
        theme_color: "#b4232d",
        background_color: "#f5f4f1",
        display: "standalone",
        icons: [
          {
            src: "icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,webmanifest}"],
        maximumFileSizeToCacheInBytes: 5_000_000,
      },
    }),
  ],
  test: { include: ["src/**/*.test.ts"], environment: "node" },
} as Parameters<typeof defineConfig>[0]);
