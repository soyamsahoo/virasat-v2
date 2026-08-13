import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "VIRASAT Field Agent — India's Digital Memory System",
        short_name: "VIRASAT Agent",
        description:
          "Offline-first field portal for NGO agents onboarding rural artisans, oral folklore and artwork photographs.",
        theme_color: "#0D0D0D",
        background_color: "#0D0D0D",
        display: "standalone",
        orientation: "portrait",
        start_url: "/agent",
        scope: "/",
        icons: [
          { src: "/icons/icon-144.png", sizes: "144x144", type: "image/png" },
          { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
          {
            src: "/icons/icon-maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2,ico}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /\/api\/v1\/artworks\/[^/]+\/image/,
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "virasat-plates",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 60, maxAgeSeconds: 7 * 24 * 3600 },
            },
          },
          {
            urlPattern: /^https:\/\/api\.maptiler\.com/,
            handler: "CacheFirst",
            options: {
              cacheName: "virasat-tiles",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 200, maxAgeSeconds: 30 * 24 * 3600 },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 4173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
});
