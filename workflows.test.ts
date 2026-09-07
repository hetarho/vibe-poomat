import { describe, expect, it } from 'vitest'
import { lintWorkflows } from './scripts/lint-workflows.mjs'

describe('actionlint', () => {
  it('finds nothing wrong with the workflows we ship', async () => {
    const results = await lintWorkflows('.github/workflows')

    expect(results.map((result) => `${result.file}:${result.line} ${result.message}`)).toEqual([])
  }, 60_000)

  it('still catches a broken workflow', async () => {
    const results = await lintWorkflows('test-fixtures/workflows')

    expect(results.map((result) => result.kind).sort()).toEqual([
      'expression',
      'expression',
      'job-needs',
    ])
  }, 60_000)
})
