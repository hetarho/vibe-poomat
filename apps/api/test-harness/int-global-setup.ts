import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/**
 * One container for the whole integration run: container startup dominates
 * otherwise, and the per-test setup file truncates between tests instead.
 * Runs before any worker starts, so the DATABASE_URL set here is inherited.
 */
let container: StartedPostgreSqlContainer | undefined

export async function setup(): Promise<void> {
  container = await new PostgreSqlContainer('postgres:16')
    .withDatabase('vibe_poomat_test')
    .withUsername('postgres')
    .withPassword('postgres')
    .start()

  const connectionString = container.getConnectionUri()
  process.env.DATABASE_URL = connectionString

  const pool = new Pool({ connectionString })
  try {
    // the same migrations the deploy applies; the folder may legitimately be empty
    await migrate(drizzle(pool), { migrationsFolder: './drizzle' })
  } finally {
    await pool.end()
  }
}

export async function teardown(): Promise<void> {
  await container?.stop()
}
