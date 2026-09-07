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
    ],
  },
})
