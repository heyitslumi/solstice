import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Server build used only to prerender each page into its HTML shell. The client
// build in vite.config.ts stays the thing that ships.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    ssr: true,
    outDir: 'dist-ssr',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        home: 'src/pages/home.tsx',
        features: 'src/pages/features.tsx',
        architecture: 'src/pages/architecture.tsx',
        install: 'src/pages/install.tsx',
        docs: 'src/pages/docs.tsx',
      },
    },
  },
})
