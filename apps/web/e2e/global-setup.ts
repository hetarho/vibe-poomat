import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareDatabase } from '../../../scripts/e2e-db.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '../../..')
const web = resolve(here, '..')

/**
 * Everything the suite needs before a browser opens: a migrated database, an api
 * compiled from this working tree, and a web build that proxies `/api/*` to that
 * api the way Caddy does in production (ARCH-30).
 *
 * The web build runs vite directly rather than through turbo, deliberately: the
 * proxy rule is baked in from the environment, and a cache key that did not
 * include it could hand back an artifact without the rule.
 */
export default function globalSetup(): void {
  prepareDatabase()

  console.log('==> building the api')
  execFileSync('pnpm', ['turbo', 'run', 'build', '--filter=api'], { cwd: root, stdio: 'inherit' })

  console.log('==> building the web app with the api proxy')
  execFileSync('pnpm', ['exec', 'vite', 'build'], {
    cwd: web,
    stdio: 'inherit',
    env: { ...process.env, WEB_API_PROXY: '1', API_URL: 'http://127.0.0.1:3011' },
  })
}
