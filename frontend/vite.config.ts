import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['nrb-kenya.svg'],
      manifest: {
        name: 'NRSMS – NRB Statistics',
        short_name: 'NRSMS',
        description: 'National Registration Statistics Management System',
        theme_color: '#1e3a5f',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/dashboard',
        icons: [
          { src: 'nrb-kenya.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' },
        ],
      },
      workbox: {
        // Cache all built assets so the app shell loads offline
        globPatterns: ['**/*.{js,css,html,svg,ico,woff,woff2}'],
        // API calls: network-first, fall back to cache (no offline API)
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/nrsms-.*\.onrender\.com\/api\//,
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
})
