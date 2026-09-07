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
})
