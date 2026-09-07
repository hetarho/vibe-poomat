import { beforeAll, describe, expect, it } from 'vitest'
import cruiserConfig from '../dependency-cruiser.json'

/** Deliberately illegal graphs, one per rule. See test-fixtures/layering/README.md. */
const FIXTURE_ROOT = 'test-fixtures/layering/src'

const EXPECTED_RULES = [
  'domain-imports-inward-only',
  'application-imports-inward-only',
  'pure-layers-are-framework-free',
  'no-cross-context-deep-import',
] as const

describe('Clean layering rules', () => {
  let reported: string[]

  beforeAll(async () => {
    // dependency-cruiser 18 ships ESM only, so this cannot be a static import:
    // tsc wants a resolution-mode attribute and Biome forbids one on a type import
    const { cruise } = await import('dependency-cruiser')
    const options = {
      ...cruiserConfig.options,
      // the CLI turns validation on for us; the programmatic API does not
      validate: true,
      ruleSet: { forbidden: cruiserConfig.forbidden },
    } as unknown as Parameters<typeof cruise>[1]

    const { output } = await cruise([FIXTURE_ROOT], options)
    if (typeof output === 'string') throw new Error('expected a structured cruise result')

    reported = output.summary.violations.map((violation) => violation.rule.name)
  }, 60_000)

  it.each(EXPECTED_RULES)('reports %s', (rule) => {
    expect(reported).toContain(rule)
  })

  it('reports each rule once and nothing more, so the legal fixtures stay legal', () => {
    expect([...reported].sort()).toEqual([...EXPECTED_RULES].sort())
  })
})
