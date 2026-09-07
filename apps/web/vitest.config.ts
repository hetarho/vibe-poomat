import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [viteReact()],
  resolve: {
    alias: { '@': new URL('./src/', import.meta.url).pathname },
  },
  test: {
    name: 'web',
    include: ['src/**/*.test.ts?(x)'],
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    // rendering plus a Steiger run is slow on a loaded machine
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
})
