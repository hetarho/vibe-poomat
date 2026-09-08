#!/usr/bin/env node
// Brings up the database the browser suite runs against, migrates it, and
// empties the application tables. Called by Playwright's globalSetup so a bare
// `pnpm --filter web test:e2e` needs no manual preparation.
//
//   E2E_DATABASE_URL     point at a PostgreSQL of your own; nothing is started
//   E2E_SKIP_DOCKER=1    assume something is already listening, migrate only
//   E2E_POSTGRES_PORT    where to publish it; the default avoids 5432 on purpose,
//                        because a development machine usually already has one
import { execFileSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** Its own database, so a browser suite never empties somebody's dev data. */
export const E2E_DATABASE = 'vibe_poomat_e2e'
export const POSTGRES_PORT = process.env.E2E_POSTGRES_PORT ?? '55432'
export const DEFAULT_DATABASE_URL = `postgresql://postgres:postgres@127.0.0.1:${POSTGRES_PORT}/${E2E_DATABASE}`

export const databaseUrl = process.env.E2E_DATABASE_URL ?? DEFAULT_DATABASE_URL

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: root,
    stdio: options.quiet === true ? 'pipe' : 'inherit',
    encoding: 'utf8',
    env: { ...process.env, ...options.env },
  })
}

function compose(args, options = {}) {
  return run('docker', ['compose', ...args], {
    ...options,
    env: { POSTGRES_PORT, ...options.env },
  })
}

function startPostgres() {
  console.log('==> starting postgres')
  compose(['up', '-d', '--wait', 'pg'])

  // `create database` has no IF NOT EXISTS, and a second run must not fail
  const exists = compose(
    [
      'exec',
      '-T',
      'pg',
      'psql',
      '-U',
      'postgres',
      '-tAc',
      `select 1 from pg_database where datname = '${E2E_DATABASE}'`,
    ],
    { quiet: true },
  ).trim()

  if (exists !== '1') {
    console.log(`==> creating ${E2E_DATABASE}`)
    compose(['exec', '-T', 'pg', 'psql', '-U', 'postgres', '-c', `create database ${E2E_DATABASE}`])
  }
}

/**
 * The same committed migrations a deploy applies (ARCH-13), never a schema push:
 * the suite has to run against the schema production will have.
 */
function migrate() {
  console.log('==> migrating')
  run('pnpm', ['--filter', 'api', 'exec', 'drizzle-kit', 'migrate'], {
    env: {
      NODE_ENV: 'test',
      API_URL: 'http://127.0.0.1:3011',
      WEB_URL: 'http://127.0.0.1:3210',
      DATABASE_URL: databaseUrl,
    },
  })
}

/**
 * Emptied once before the run rather than between specs: every flow makes its
 * own accounts and its own project, so they do not collide, and leaving the
 * tables alone mid-run is what lets the specs go in parallel.
 */
function empty() {
  console.log('==> emptying the application tables')
  const sql = `
    do $$
    declare statement text;
    begin
      select 'truncate table ' || string_agg(format('%I.%I', schemaname, tablename), ', ') || ' cascade'
        into statement
        from pg_tables
       where schemaname = 'public' and tablename <> '__drizzle_migrations';
      if statement is not null then execute statement; end if;
    end $$;
  `

  if (process.env.E2E_SKIP_DOCKER === '1') {
    console.log('    skipped: no docker, so nothing here knows how to reach it')

    return
  }
  compose(['exec', '-T', 'pg', 'psql', '-U', 'postgres', '-d', E2E_DATABASE, '-c', sql])
}

export function prepareDatabase() {
  if (process.env.E2E_SKIP_DOCKER !== '1') startPostgres()
  migrate()
  empty()
}

if (process.argv[1] === fileURLToPath(import.meta.url)) prepareDatabase()
