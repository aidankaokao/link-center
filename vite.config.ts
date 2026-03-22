import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { copyFileSync, existsSync } from 'fs'
import { resolve } from 'path'

// Copies pdfjs worker to public/ so it's served at /pdf.worker.min.mjs
// in both dev and production without Vite hashing the filename.
function copyPdfjsWorker() {
  return {
    name: 'copy-pdfjs-worker',
    buildStart() {
      const src = resolve('node_modules/pdfjs-dist/build/pdf.worker.min.mjs')
      const dest = resolve('public/pdf.worker.min.mjs')
      if (existsSync(src)) copyFileSync(src, dest)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), copyPdfjsWorker()],
})
