import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

// The `${{ ... }}` literals below are GitHub Actions expressions, not JS template
// placeholders — biome.json turns noTemplateCurlyInString off for this file.
const repoRoot = import.meta.dirname

function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

type Step = {
  name?: string
  uses?: string
  run?: string
  if?: string
  with?: Record<string, string>
  env?: Record<string, string>
}

type Job = {
  name?: string
  if?: string
  needs?: string | string[]
  permissions?: Record<string, string>
  environment?: string
  strategy?: { matrix?: { app?: string[] } }
  steps?: Step[]
}

type Workflow = {
  on?: {
    push?: { branches?: string[] }
    workflow_dispatch?: {
      inputs?: Record<string, { type?: string; default?: unknown; description?: string }>
    }
  }
  concurrency?: { group?: string; 'cancel-in-progress'?: boolean }
  jobs?: Record<string, Job>
}

type ComposeService = {
  image?: string
  build?: unknown
  profiles?: string[]
  command?: string[]
  ports?: string[]
  healthcheck?: { test?: unknown }
}

type Compose = { services?: Record<string, ComposeService> }

const workflowText = readText('.github/workflows/deploy.yml')
const workflow = parseYaml(workflowText) as Workflow
const compose = parseYaml(readText('docker-compose.prod.yml')) as Compose
const caddyfile = readText('Caddyfile')

const jobs = workflow.jobs ?? {}
const deploySteps = jobs.deploy?.steps ?? []

function deployStep(nameFragment: string): Step {
  const step = deploySteps.find((candidate) => candidate.name?.includes(nameFragment))
  if (step === undefined) throw new Error(`the deploy job has no step named like "${nameFragment}"`)
  return step
}

describe('deploy workflow triggers', () => {
  it('runs on a push to main and by hand', () => {
    expect(workflow.on?.push?.branches).toEqual(['main'])
    expect(workflow.on?.workflow_dispatch).toBeDefined()
  })

  it('offers a dry run that builds and pushes without touching the server', () => {
    const deployInput = workflow.on?.workflow_dispatch?.inputs?.deploy
    expect(deployInput?.type).toBe('boolean')
    expect(deployInput?.default).toBe(true)
    // the gate the dry run flips; a push carries no inputs, so it must pass anyway
    expect(jobs.deploy?.if).toContain('inputs.deploy')
    expect(jobs.deploy?.if).toContain("github.event_name == 'push'")
  })

  it('takes a tag to roll back to, and documents how', () => {
    const tagInput = workflow.on?.workflow_dispatch?.inputs?.image_tag
    expect(tagInput?.type).toBe('string')
    expect(tagInput?.description).toMatch(/roll back/i)
    // an explicit tag deploys what GHCR already holds instead of building again
    expect(jobs.build?.if).toContain('needs.meta.outputs.build')
    expect(workflowText).toMatch(/# {3}roll back/)
  })

  it('queues concurrent deploys rather than cancelling one mid-roll', () => {
    expect(workflow.concurrency?.group).toBe('deploy')
    expect(workflow.concurrency?.['cancel-in-progress']).toBe(false)
  })
})

describe('image build', () => {
  const build = jobs.build
  const push = build?.steps?.find((step) => step.uses?.startsWith('docker/build-push-action'))

  it('builds both apps from their own Dockerfile', () => {
    expect(build?.strategy?.matrix?.app).toEqual(['api', 'web'])
    expect(push?.with?.file).toBe('apps/${{ matrix.app }}/Dockerfile')
  })

  it('pushes an immutable sha tag and latest to GHCR', () => {
    expect(build?.permissions?.packages).toBe('write')
    expect(build?.steps?.some((step) => step.uses?.startsWith('docker/login-action'))).toBe(true)
    expect(push?.with?.push).toBe(true)
    const tags = push?.with?.tags ?? ''
    expect(tags).toContain('${{ needs.meta.outputs.tag }}')
    expect(tags).toContain(':latest')
  })

  it('reuses buildx layers between runs', () => {
    expect(build?.steps?.some((step) => step.uses?.startsWith('docker/setup-buildx-action'))).toBe(
      true,
    )
    expect(push?.with?.['cache-from']).toContain('type=gha')
    expect(push?.with?.['cache-to']).toContain('type=gha')
  })
})

describe('the roll itself', () => {
  const roll = deployStep('migrate, then switch traffic')
  const script = roll.run ?? ''

  it('connects over ssh with a key from the repository secrets', () => {
    const channel = deployStep('open an ssh channel')
    expect(channel.env?.DEPLOY_SSH_KEY).toBe('${{ secrets.DEPLOY_SSH_KEY }}')
    // a pinned host key, never StrictHostKeyChecking=no
    expect(channel.run).toContain('known_hosts')
    expect(workflowText).not.toContain('-o StrictHostKeyChecking=no')
  })

  it('pulls, migrates, then switches traffic — in that order', () => {
    const pull = script.indexOf('compose pull')
    const migrate = script.indexOf('run --rm --no-deps migrate')
    const up = script.indexOf('compose up -d')

    expect(pull).toBeGreaterThan(-1)
    expect(migrate).toBeGreaterThan(pull)
    expect(up).toBeGreaterThan(migrate)
  })

  it('aborts before switching traffic when the migration exits non-zero', () => {
    // `set -e` inside the remote shell is the whole mechanism, so it has to be there
    const remote = script.slice(script.indexOf("<<'REMOTE'"))
    expect(remote).toContain('set -euo pipefail')
    expect(remote.indexOf('set -euo pipefail')).toBeLessThan(remote.indexOf('compose up -d'))
  })

  it('waits for the new containers to report healthy', () => {
    expect(script).toContain('--wait')
  })
})

describe('server environment', () => {
  it('is rendered from secrets, never committed', () => {
    expect(existsSync(join(repoRoot, '.env.production'))).toBe(false)
    expect(readText('.gitignore')).toContain('.env.*')

    const render = deployStep('render the server environment')
    expect(render.env?.DATABASE_URL).toBe('${{ secrets.DATABASE_URL }}')
    expect(render.env?.RESEND_API_KEY).toBe('${{ secrets.RESEND_API_KEY }}')
    expect(render.env?.S3_SECRET_ACCESS_KEY).toBe('${{ secrets.S3_SECRET_ACCESS_KEY }}')
    // written straight onto the server, readable by nobody else
    expect(render.run).toContain('chmod 600')
  })

  it('fails before the roll when something is not configured', () => {
    const guard = deployStep('every required secret and variable is set')
    expect(deploySteps.indexOf(guard)).toBeLessThan(
      deploySteps.indexOf(deployStep('migrate, then switch traffic')),
    )
    expect(guard.run).toContain('::error::')
  })
})

describe('post-deploy smoke', () => {
  const smoke = deployStep('smoke the public domain')

  it('runs the one smoke script the local stack already uses', () => {
    expect(smoke.run).toContain('scripts/docker-smoke.sh')
    expect(smoke.env?.SMOKE_REMOTE).toBe('1')
    expect(smoke.env?.SMOKE_API_URL).toContain('${{ vars.DEPLOY_DOMAIN }}')
    expect(smoke.env?.SMOKE_WEB_URL).toContain('${{ vars.DEPLOY_DOMAIN }}')
  })

  it('is what the script checks: the probes and the web root', () => {
    const script = readText('scripts/docker-smoke.sh')
    expect(script).toContain('expect_status "$API_URL/health" 200')
    expect(script).toContain('expect_status "$API_URL/ready" 200')
    expect(script).toContain('expect_status "$WEB_URL/" 200')
    // SMOKE_REMOTE must suppress both the build and the teardown
    expect(script).toContain('SKIP_BUILD=${SMOKE_SKIP_BUILD:-$REMOTE}')
    expect(script).toContain('SKIP_STACK=${SMOKE_SKIP_STACK:-$REMOTE}')
  })

  it('fails the workflow and names the tag to roll back to', () => {
    expect(deploySteps.indexOf(smoke)).toBeGreaterThan(
      deploySteps.indexOf(deployStep('migrate, then switch traffic')),
    )
    const rollback = deployStep('how to roll back')
    expect(rollback.if).toBe('failure()')
    expect(rollback.env?.PREVIOUS_TAG).toBe('${{ steps.current.outputs.tag }}')
    expect(rollback.run).toContain('image_tag')
  })
})

describe('Caddy', () => {
  it('terminates TLS for the configured domain', () => {
    expect(caddyfile).toContain('{$DOMAIN}')
    expect(caddyfile).toContain('email {$ACME_EMAIL}')
  })

  it('sends the api routes and the probes to api, everything else to web', () => {
    expect(caddyfile).toContain('@api path /api/* /health /ready')
    expect(caddyfile).toContain('reverse_proxy api:3001')
    expect(caddyfile).toContain('reverse_proxy web:3000')
    // the catch-all has to come after the matcher, or nothing reaches the api
    expect(caddyfile.indexOf('reverse_proxy api:3001')).toBeLessThan(
      caddyfile.indexOf('reverse_proxy web:3000'),
    )
  })

  it('compresses and sets the security headers', () => {
    expect(caddyfile).toMatch(/encode .*gzip/)
    expect(caddyfile).toContain('Strict-Transport-Security')
    expect(caddyfile).toContain('X-Content-Type-Options nosniff')
    expect(caddyfile).toContain('X-Frame-Options DENY')
    expect(caddyfile).toContain('Referrer-Policy strict-origin-when-cross-origin')
  })
})

describe('production compose stack', () => {
  const services = compose.services ?? {}

  it('runs images from the registry and builds nothing', () => {
    for (const [name, service] of Object.entries(services)) {
      expect(service.build, `${name} must not build on the server`).toBeUndefined()
      expect(service.image, `${name} needs an image`).toBeTruthy()
    }
    expect(services.api?.image).toContain('${IMAGE_BASE')
    expect(services.api?.image).toContain('${IMAGE_TAG')
    expect(services.web?.image).toContain('${IMAGE_TAG')
  })

  it('runs migrations from the api image, and never on `up`', () => {
    expect(services.migrate?.command).toEqual(['dist/migrate.js'])
    expect(services.migrate?.image).toBe(services.api?.image)
    expect(services.migrate?.profiles?.length ?? 0).toBeGreaterThan(0)
  })

  it('publishes ports from Caddy alone', () => {
    for (const [name, service] of Object.entries(services)) {
      if (name === 'caddy') continue
      expect(service.ports, `${name} must not be reachable except through Caddy`).toBeUndefined()
    }
    expect(services.caddy?.ports).toEqual(expect.arrayContaining(['80:80', '443:443']))
  })

  it('gives api and web a healthcheck, so `up --wait` means something', () => {
    expect(services.api?.healthcheck?.test).toBeDefined()
    expect(services.web?.healthcheck?.test).toBeDefined()
  })
})
