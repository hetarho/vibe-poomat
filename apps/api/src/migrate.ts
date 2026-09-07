import { env } from '@repo/config'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Pool } from 'pg'

/**
 * Migrations are their own step, never app boot (ARCH-13). This entry point runs
 * in the same image as the api, so the deploy applies exactly the migrations the
 * image was built with.
 */
const MIGRATIONS_FOLDER = './drizzle'

async function run(): Promise<void> {
  const pool = new Pool({ connectionString: env.DATABASE_URL, max: 1 })
  try {
    await migrate(drizzle(pool), { migrationsFolder: MIGRATIONS_FOLDER })
    console.log('migrations applied')
  } finally {
    await pool.end()
  }
}

run().catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
