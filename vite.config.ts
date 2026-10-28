import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works under any path (e.g. GitHub Pages' /<repo>/).
  base: './',
  plugins: [react(), tailwindcss()],
})
