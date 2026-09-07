import { Logger } from '@nestjs/common'
import { Pool } from 'pg'
import type { Env } from '../config/env.token'

export function createPool(config: Env, logger: Logger = new Logger('DbModule')): Pool {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
  })

  // PostgreSQL pushes an error to its idle clients when it shuts down. Without a
  // listener that surfaces as an unhandled 'error' event and takes the process
  // with it, so a database blip would kill the api instead of failing /ready.
  pool.on('error', (error) => {
    logger.error('idle database client failed', error.stack)
  })

  return pool
}
