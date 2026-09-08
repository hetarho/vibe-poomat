#!/usr/bin/env node
// actionlint ships as a wasm library with no CLI, so this is the thin wrapper
// that `pnpm turbo run lint` calls (ARCH-23 keeps every linter in one command).
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { createLinter } from 'actionlint'

const WORKFLOW_DIR = process.argv[2] ?? '.github/workflows'

// The wasm build is pinned at the newest actionlint npm release (2.0.6) and its
// core predates the `vars` context, so it calls every repository variable an
// undefined one. Dropping exactly that message keeps deploy.yml honest without
// silencing anything else actionlint has to say.
const STALE_VARS_CONTEXT = /^undefined variable "vars"/

export async function lintWorkflows(directory = WORKFLOW_DIR) {
  const lint = await createLinter()
  const entries = await readdir(directory)
  const results = []

  for (const entry of entries.filter((name) => /\.ya?ml$/.test(name)).sort()) {
    const path = join(directory, entry)
    const found = lint(await readFile(path, 'utf8'), path)
    results.push(...found.filter((result) => !STALE_VARS_CONTEXT.test(result.message)))
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
