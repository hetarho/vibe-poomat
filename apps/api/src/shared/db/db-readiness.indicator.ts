import type { ReadinessIndicator } from '../health/readiness-registry'

export const DB_READINESS_TIMEOUT_MS = 1_000

/** Narrow enough that a test can pass a stub instead of a real pool. */
export type Queryable = {
  query(sql: string): Promise<unknown>
}

async function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
  } finally {
    // without this the timer keeps the process alive past a successful probe
    if (timer !== undefined) clearTimeout(timer)
  }
}

export class DbReadinessIndicator implements ReadinessIndicator {
  readonly name = 'db'

  constructor(
    private readonly queryable: Queryable,
    private readonly timeoutMs: number = DB_READINESS_TIMEOUT_MS,
  ) {}

  async check(): Promise<boolean> {
    try {
      await withTimeout(this.queryable.query('select 1'), this.timeoutMs)

      return true
    } catch {
      // a database that cannot answer in time is a database that is not ready
      return false
    }
  }
}
