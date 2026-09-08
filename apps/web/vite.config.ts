import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

/**
 * Where the dev server forwards the browser's api calls. In the browser the api
 * is same-origin (ARCH-30: Caddy proxies `/api/*` to it), so without this the
 * dev server would answer those calls itself and 404 them — and a session cookie
 * would be set on a different origin from the one that reads it (ARCH-18).
 *
 * Read from `process.env` rather than `@repo/config`, deliberately: this is
 * build tooling, and importing the validated singleton here would make a plain
 * `vite build` require a complete runtime environment.
 */
const devApiTarget = process.env.API_URL ?? 'http://127.0.0.1:3001'

/**
 * Only when asked for, so a production image carries no baked target: there,
 * Caddy is the proxy and the web server must never claim to be.
 */
const apiProxyRules: Record<string, { proxy: string }> =
  process.env.WEB_API_PROXY === '1'
    ? {
        '/api/**': { proxy: `${devApiTarget}/api/**` },
        '/health': { proxy: `${devApiTarget}/health` },
        '/ready': { proxy: `${devApiTarget}/ready` },
      }
    : {}

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [
    // vite's own `server.proxy` never runs here: nitro's dev handler answers
    // first, so the rule has to be nitro's
    nitro({ routeRules: apiProxyRules }),
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
