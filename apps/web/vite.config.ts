import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    nitro(),
    tailwindcss(),
    tanstackStart({
      // ARCH-34 keeps routing in app/ and the FSD layers in src/;
      // both paths resolve against srcDirectory, hence the leading ../
      router: {
        routesDirectory: '../app/routes',
        generatedRouteTree: '../app/route-tree.gen.ts',
      },
    }),
    viteReact(),
  ],
  /**
   * The workspace packages compile to CommonJS, because the Nest api that also
   * consumes them is CommonJS. Vite's dev module runner evaluates whatever it
   * inlines as ESM, so a CJS `exports` assignment throws; leaving them external
   * hands them to node's own resolver, which knows what to do with CJS.
   *
   * The production build does not need this — nitro's bundler handles the
   * interop — but the two should not disagree about what is external.
   */
  ssr: {
    external: ['@repo/api-client', '@repo/config', '@repo/contracts'],
  },
})
