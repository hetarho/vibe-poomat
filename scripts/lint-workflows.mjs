#!/usr/bin/env node
// actionlint ships as a wasm library with no CLI, so this is the thin wrapper
// that `pnpm turbo run lint` calls (ARCH-23 keeps every linter in one command).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLinter } from 'actionlint'

const WORKFLOW_DIR = process.argv[2] ?? '.github/workflows'

export async function lintWorkflows(directory = WORKFLOW_DIR) {
  const lint = await createLinter()
  const entries = await readdir(directory)
  const results = []

  for (const entry of entries.filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const path = join(directory, entry)
    results.push(...lint(await readFile(path, 'utf8'), path))
  }

  return results
}

if (import.meta.filename === process.argv[1]) {
  const results = await lintWorkflows()
  for (const result of results) {
    console.error(
      `${result.file}:${result.line}:${result.column}: ${result.message} [${result.kind}]`,
    )
  }
  console.log(
    results.length === 0
      ? 'actionlint: no problems found'
      : `actionlint: ${results.length} problem(s)`,
  )
  process.exitCode = results.length === 0 ? 0 : 1
}
