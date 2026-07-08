import { defineConfig, loadEnv } from 'vite'
import { resolve, join, extname } from 'path'
import fs from 'fs'
import { minify } from 'terser'

// Custom plugin to copy and minify js, lib, and contactform folders to dist
function copyStaticFoldersPlugin() {
  return {
    name: 'copy-static-folders',
    async closeBundle() {
      const folders = ['js', 'lib', 'contactform']
      const outDir = resolve(__dirname, 'dist')

      async function processDir(srcDir, destDir) {
        if (!fs.existsSync(destDir)) {
          fs.mkdirSync(destDir, { recursive: true })
        }
        const entries = fs.readdirSync(srcDir, { withFileTypes: true })

        for (const entry of entries) {
          const srcPath = join(srcDir, entry.name)
          const destPath = join(destDir, entry.name)

          if (entry.isDirectory()) {
            await processDir(srcPath, destPath)
          } else if (entry.isFile()) {
            const ext = extname(entry.name).toLowerCase()
            if (ext === '.js') {
              const code = fs.readFileSync(srcPath, 'utf-8')
              if (entry.name.endsWith('.min.js')) {
                // Already minified, copy as-is
                fs.writeFileSync(destPath, code, 'utf-8')
              } else {
                // Minify using Terser
                try {
                  const minified = await minify(code)
                  fs.writeFileSync(destPath, minified.code || code, 'utf-8')
                } catch (err) {
                  console.error(`Error minifying ${srcPath}:`, err)
                  fs.writeFileSync(destPath, code, 'utf-8') // Fallback to copy as-is
                }
              }
            } else {
              // Copy other assets (css, images, fonts, etc.) as-is
              fs.copyFileSync(srcPath, destPath)
            }
          }
        }
      }

      for (const folder of folders) {
        const srcFolder = resolve(__dirname, folder)
        const destFolder = join(outDir, folder)
        if (fs.existsSync(srcFolder)) {
          console.log(`Copying & minifying ${folder} -> dist/${folder}...`)
          await processDir(srcFolder, destFolder)
        }
      }
    }
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    root: '.',
    base: './',
    plugins: [
      copyStaticFoldersPlugin()
    ],
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
      rollupOptions: {
        input: {
          main: resolve(__dirname, 'index.html'),
          merch: resolve(__dirname, 'merch.html'),
          track: resolve(__dirname, 'track.html')
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


