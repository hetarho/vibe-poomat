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
    // booting a NestJS testing module is slow on a cold worker, and vitest's
    // 10s hook default is reached on a loaded machine (turbo runs tasks in parallel)
    testTimeout: 30_000,
    hookTimeout: 60_000,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      // measured only where ARCH-22 asks for it: widening this would make the
      // number meaningless and would block honest refactors elsewhere
      include: ['src/*/domain/**/*.ts', 'src/*/application/**/*.ts'],
      // `src/shared/application` holds only ports — types and Symbol tokens — and
      // would otherwise be swept in by the `src/*/application/**` glob
      exclude: ['**/*.test.ts', 'src/shared/**'],
      thresholds: { lines: 80 },
    },
  },
})
