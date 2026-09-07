import type { LintResult } from 'actionlint'

/** Lints every workflow file in `directory` and returns what actionlint found. */
export function lintWorkflows(directory?: string): Promise<LintResult[]>
