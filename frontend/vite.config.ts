/// <reference types="vitest/config" />
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      injectRegister: false,
      pwaAssets: {
        image: 'public/icon.svg',
        preset: 'minimal-2023',
        overrideManifestIcons: true,
        includeHtmlHeadLinks: true,
      },
      manifest: {
        name: 'Precedent',
        short_name: 'Precedent',
        description: 'The accounts-payable agent that learns from every exception it resolves.',
        theme_color: '#15171A',
        background_color: '#FBFBFA',
        display: 'standalone',
        start_url: '/',
        scope: '/',
      },
      injectManifest: {
        // only latin + latin-ext font subsets (latin-ext carries ₹)
        globPatterns: ['**/*.{js,css,html,svg,png,ico}', '**/*-latin-*.woff2'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
      devOptions: { enabled: false, type: 'module' },
    }),
  ],
  resolve: { tsconfigPaths: true },
  server: { port: 5173, fs: { allow: ['..'] } },
  test: {
    environment: 'happy-dom',
    setupFiles: ['src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    alias: { 'virtual:pwa-register/react': fileURLToPath(new URL('./src/test/pwa-register-stub.ts', import.meta.url)) },
    css: false,
  },
})
