import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'tooling',
          root: import.meta.dirname,
          include: ['*.test.ts'],
          environment: 'node',
        },
      },
      {
        test: {
          name: 'unit',
          root: import.meta.dirname,
          include: ['packages/*/src/**/*.test.ts?(x)'],
          exclude: ['**/*.int.test.ts', '**/node_modules/**', '**/dist/**'],
          environment: 'node',
        },
      },
    ],
  },
})
