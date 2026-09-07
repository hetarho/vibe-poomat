import swc from 'unplugin-swc'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  // esbuild cannot emit decorator metadata, which NestJS DI needs, so swc transpiles instead
  plugins: [
    swc.vite({
      jsc: {
        target: 'es2023',
        parser: { syntax: 'typescript', decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true },
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    name: 'api',
    root: import.meta.dirname,
    include: ['src/**/*.test.ts'],
    exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
  },
})
