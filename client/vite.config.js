import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: '../server/public',   // ✅ пишем сразу в папку сервера
    emptyOutDir: true
  },
  base: '/'  // или './' — но для Render лучше '/'
})