import babel from '@rolldown/plugin-babel'
import tailwindcss from '@tailwindcss/vite'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  // Relative asset paths, so the build works under any path (e.g. GitHub Pages' /<repo>/).
  base: './',
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  // Unit tests live next to the code; tests/ holds the Playwright suite.
  test: { include: ['src/**/*.test.ts'] },
})
