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
    name: 'api-int',
    include: ['src/**/*.int.test.ts'],
    environment: 'node',
    globalSetup: ['./test-harness/int-global-setup.ts'],
    setupFiles: ['./vitest.setup.ts', './test-harness/int-truncate.ts'],
    // one shared database means files must not race each other
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 180_000,
  },
})
