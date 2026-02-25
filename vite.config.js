import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html')
      }
    },
    // Optimize assets
    minify: 'terser',
    sourcemap: false,
    // Handle large chunks
    chunkSizeWarningLimit: 1000
  },
  server: {
    port: 3000,
    open: true
  },
  // Preserve static assets structure
  publicDir: 'public'
})
