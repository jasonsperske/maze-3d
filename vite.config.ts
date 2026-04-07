import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function copyIndexForTargets(): Plugin {
  return {
    name: 'copy-index-for-targets',
    closeBundle() {
      const targetsFile = path.resolve(__dirname, 'targets.txt')
      if (!fs.existsSync(targetsFile)) return

      const indexSrc = path.resolve(__dirname, 'dist/index.html')
      if (!fs.existsSync(indexSrc)) return

      const html = fs.readFileSync(indexSrc, 'utf-8')
      const targets = fs.readFileSync(targetsFile, 'utf-8')
        .split('\n')
        .map((l: string) => l.trim())
        .filter((l: string) => l && !l.startsWith('#'))

      for (const target of targets) {
        // each line: "level/seed"  e.g. "0/house" or "1/cave"
        const dest = path.resolve(__dirname, 'dist/level', target, 'index.html')
        fs.mkdirSync(path.dirname(dest), { recursive: true })
        fs.writeFileSync(dest, html)
        console.log(`  copied index.html → dist/level/${target}/index.html`)
      }
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyIndexForTargets()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-three': ['three'],
          'vendor-r3f': ['react', 'react-dom', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
  },
})
