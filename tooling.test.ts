import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

const repoRoot = import.meta.dirname

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(join(repoRoot, relativePath), 'utf8')) as T
}

function readText(relativePath: string): string {
  return readFileSync(join(repoRoot, relativePath), 'utf8')
}

type WorkspaceManifest = {
  packages?: string[]
  catalog?: Record<string, string>
}

type RootManifest = {
  private?: boolean
  packageManager?: string
  engines?: { node?: string }
  'lint-staged'?: Record<string, string[]>
}

type TurboTask = {
  cache?: boolean
  dependsOn?: string[]
  outputs?: string[]
  persistent?: boolean
}

type TurboConfig = { tasks?: Record<string, TurboTask> }

type BiomeConfig = {
  formatter?: { enabled?: boolean }
  javascript?: { parser?: { unsafeParameterDecoratorsEnabled?: boolean } }
  linter?: {
    enabled?: boolean
    rules?: {
      suspicious?: Record<string, unknown>
      style?: Record<string, { level?: string; options?: { filenameCases?: string[] } }>
    }
  }
  assist?: { actions?: { source?: Record<string, unknown> } }
  overrides?: {
    includes?: string[]
    linter?: { rules?: { style?: Record<string, string> } }
  }[]
}

type TsconfigFile = {
  extends?: string
  compilerOptions?: Record<string, unknown>
}

/** Expands `dir/*` workspace globs into the package directories that actually hold a manifest. */
function workspacePackageDirs(globs: string[]): string[] {
  const dirs: string[] = []
  for (const glob of globs) {
    const segments = glob.split('/')
    const parent = segments[0]
    if (segments.length !== 2 || parent === undefined || segments[1] !== '*') {
      throw new Error(`unsupported workspace glob, teach this test how to expand it: ${glob}`)
    }
    const parentPath = join(repoRoot, parent)
    if (!existsSync(parentPath)) continue
    for (const entry of readdirSync(parentPath, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const dir = `${parent}/${entry.name}`
      if (existsSync(join(repoRoot, dir, 'package.json'))) dirs.push(dir)
    }
  }
  return dirs
}

const workspace = parseYaml(readText('pnpm-workspace.yaml')) as WorkspaceManifest
const rootManifest = readJson<RootManifest>('package.json')
const turbo = readJson<TurboConfig>('turbo.json')
const biome = readJson<BiomeConfig>('biome.json')

describe('pnpm workspace', () => {
  it('covers apps/* and packages/*', () => {
    expect(workspace.packages).toEqual(expect.arrayContaining(['apps/*', 'packages/*']))
  })

  it('pins the shared dependency versions in a catalog', () => {
    const catalog = workspace.catalog ?? {}
    for (const dep of ['typescript', 'zod', 'vitest', '@types/node']) {
      expect(catalog[dep], `catalog is missing ${dep}`).toMatch(/^\d+\.\d+\.\d+$/)
    }
  })
})

describe('root manifest', () => {
  it('is a private pnpm 10 workspace on node 22+', () => {
    expect(rootManifest.private).toBe(true)
    expect(rootManifest.packageManager).toMatch(/^pnpm@10\./)
    expect(rootManifest.engines?.node).toBe('>=22')
    expect(readText('.nvmrc').trim()).toBe('22')
  })

  it('runs biome through lint-staged on commit', () => {
    const commands = Object.values(rootManifest['lint-staged'] ?? {}).flat()
    expect(commands.some((command) => command.startsWith('biome check --staged --write'))).toBe(
      true,
    )
    expect(readText('.husky/pre-commit')).toContain('lint-staged')
  })
})

describe('@repo/tsconfig', () => {
  it('publishes base, node and react configs', () => {
    for (const file of ['base.json', 'node.json', 'react.json']) {
      expect(existsSync(join(repoRoot, 'packages/tsconfig', file)), `missing ${file}`).toBe(true)
    }
  })

  it('keeps the strictness the architecture requires', () => {
    const options = readJson<TsconfigFile>('packages/tsconfig/base.json').compilerOptions ?? {}
    expect(options.strict).toBe(true)
    expect(options.noUncheckedIndexedAccess).toBe(true)
    expect(options.verbatimModuleSyntax).toBe(true)
    expect(options.moduleResolution).toBe('bundler')
    expect(options.target).toBe('ES2023')
  })

  it('is extended by the root tsconfig and by every workspace package that has one', () => {
    const configs = ['tsconfig.json']
    for (const dir of workspacePackageDirs(workspace.packages ?? [])) {
      const candidate = `${dir}/tsconfig.json`
      if (existsSync(join(repoRoot, candidate))) configs.push(candidate)
    }
    for (const config of configs) {
      expect(
        readJson<TsconfigFile>(config).extends,
        `${config} must extend @repo/tsconfig`,
      ).toMatch(/^@repo\/tsconfig\//)
    }
  })
})

describe('turbo pipelines', () => {
  const tasks = turbo.tasks ?? {}

  it('defines lint, typecheck, test and build', () => {
    for (const task of ['lint', 'typecheck', 'test', 'build']) {
      expect(tasks[task], `turbo is missing the ${task} pipeline`).toBeDefined()
    }
  })

  it('builds dependencies before the package that needs them', () => {
    expect(tasks.build?.dependsOn).toContain('^build')
    expect(tasks.build?.outputs?.length ?? 0).toBeGreaterThan(0)
  })

  it('caches everything except dev', () => {
    for (const [name, task] of Object.entries(tasks)) {
      if (name === 'dev') continue
      expect(task.cache, `${name} must stay cacheable`).not.toBe(false)
    }
    expect(tasks.dev?.cache).toBe(false)
  })
})

describe('biome', () => {
  it('lints and formats with any as a hard error', () => {
    expect(biome.formatter?.enabled).toBe(true)
    expect(biome.linter?.enabled).toBe(true)
    expect(biome.linter?.rules?.suspicious?.noExplicitAny).toBe('error')
  })

  it('parses the parameter decorators NestJS depends on', () => {
    expect(biome.javascript?.parser?.unsafeParameterDecoratorsEnabled).toBe(true)
  })

  it('leaves NestJS value imports alone, so decorator metadata survives', () => {
    // useImportType would rewrite `import { Foo }` to `import type { Foo }`, and swc
    // then emits Object for that constructor parameter, breaking NestJS DI
    const apiOverride = (biome.overrides ?? []).find((override) =>
      (override.includes ?? []).some((pattern) => pattern.startsWith('apps/api')),
    )

    expect(apiOverride?.linter?.rules?.style?.useImportType).toBe('off')
  })

  it('enforces kebab-case filenames and organizes imports', () => {
    const filenames = biome.linter?.rules?.style?.useFilenamingConvention
    expect(filenames?.level).toBe('error')
    expect(filenames?.options?.filenameCases).toEqual(['kebab-case'])
    expect(biome.assist?.actions?.source?.organizeImports).toBe('on')
  })
})
