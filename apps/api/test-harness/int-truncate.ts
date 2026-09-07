import { Pool } from 'pg'
import { afterAll, beforeEach } from 'vitest'

/**
 * Per-test isolation. Drizzle keeps its migration bookkeeping in the `drizzle`
 * schema, so restricting this to `public` leaves it untouched by construction.
 */
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

beforeEach(async () => {
  const { rows } = await pool.query<{ table_name: string }>(
    "select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'",
  )
  if (rows.length === 0) return

  const tables = rows.map((row) => `"public"."${row.table_name}"`).join(', ')
  await pool.query(`truncate table ${tables} restart identity cascade`)
})

afterAll(async () => {
  await pool.end()
})
