import { defineConfig, loadEnv } from 'vite'
import { resolve } from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: '.',
    base: './',
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          merch: resolve(__dirname, 'merch.html')
        }
      },
      // Optimize assets
      minify: 'terser',
      sourcemap: false,
      // Handle large chunks
      chunkSizeWarningLimit: 1000
    },
    server: {
      port: 3001,
      open: true
    },
    define: {
      'process.env.MERCH_ENCRYPT_KEY': JSON.stringify(env.MERCH_ENCRYPT_KEY || ''),
      'process.env': {
        MERCH_ENCRYPT_KEY: env.MERCH_ENCRYPT_KEY || ''
      }
    },
    // Preserve static assets structure
    publicDir: 'public'
  }
})

