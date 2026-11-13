import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// One HTML entry per route: each page is a real document with its own meta tags.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  build: {
    rollupOptions: {
      input: {
        home: 'index.html',
        features: 'features/index.html',
        architecture: 'architecture/index.html',
        install: 'install/index.html',
        docs: 'docs/index.html',
      },
    },
  },
})
