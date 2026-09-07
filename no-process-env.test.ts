import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const repoRoot = import.meta.dirname

/** Only this directory may read the environment (ARCH-31). */
const configSourceDir = 'packages/config/src'
const scanRoots = ['apps', 'packages']
const skippedDirs = new Set(['node_modules', 'dist', 'build', '.turbo', 'coverage'])

function sourceFilesUnder(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(join(repoRoot, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`
    if (entry.isDirectory()) {
      if (skippedDirs.has(entry.name)) continue
      files.push(...sourceFilesUnder(path))
      continue
    }
    if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith('.gen.ts')) files.push(path)
  }
  return files
}

function scannedSourceFiles(): string[] {
  const files: string[] = []
  for (const root of scanRoots) {
    let workspaces: string[]
    try {
      workspaces = readdirSync(join(repoRoot, root), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => `${root}/${entry.name}/src`)
    } catch {
      continue
    }
    for (const dir of workspaces) {
      if (dir === configSourceDir) continue
      try {
        files.push(...sourceFilesUnder(dir))
      } catch {
        // a workspace package without a src/ directory has nothing to scan
      }
    }
  }
  return files
}

describe('env access', () => {
  it('is confined to @repo/config', () => {
    const needle = ['process', 'env'].join('.')
    const offenders = scannedSourceFiles().filter((file) =>
      readFileSync(join(repoRoot, file), 'utf8').includes(needle),
    )

    expect(
      offenders,
      `these files read the environment directly — inject @repo/config's env instead:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
