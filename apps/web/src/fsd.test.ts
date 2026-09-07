import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/** Deliberately illegal slices, one per rule. See test-fixtures/fsd/README.md. */
const FIXTURE_ROOT = 'test-fixtures/fsd/src'

const EXPECTED_RULES = ['fsd/forbidden-imports', 'fsd/no-public-api-sidestep'] as const

describe('FSD boundary rules', () => {
  let reported: string[]

  beforeAll(async () => {
    const [{ default: fsd }, { defineConfig, linter, processConfiguration }] = await Promise.all([
      import('@feature-sliced/steiger-plugin'),
      import('steiger'),
    ])

    // the config directory and an absolute target path are both required:
    // without either, the linter silently reports nothing at all
    processConfiguration(defineConfig([...fsd.configs.recommended]), process.cwd())
    reported = (await linter.run(resolve(FIXTURE_ROOT))).map((diagnostic) => diagnostic.ruleName)
  }, 60_000)

  it.each(EXPECTED_RULES)('reports %s', (rule) => {
    expect(reported).toContain(rule)
  })

  it('reports the upward import against the file that made it', async () => {
    const { linter } = await import('steiger')
    const diagnostics = await linter.run(resolve(FIXTURE_ROOT))
    const upward = diagnostics.find((diagnostic) => diagnostic.ruleName === 'fsd/forbidden-imports')

    expect(upward?.location.path).toContain('entities/user/ui/user-card.tsx')
  })
})
