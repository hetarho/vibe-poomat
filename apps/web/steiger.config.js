import fsd from '@feature-sliced/steiger-plugin'
import { defineConfig } from 'steiger'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // the framework needs this exact file at the src root; it is not an FSD slice
    ignores: ['./src/router.tsx', './src/app/styles.css'],
  },
  {
    files: ['./src/**'],
    rules: {
      // ARCH-34 keeps the route files in app/, outside this scan, so every slice
      // reached only from a route looks unreferenced to this heuristic
      'fsd/insignificant-slice': 'off',
    },
  },
])
