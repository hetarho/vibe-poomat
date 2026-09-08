/** The database the browser suite runs against, when nothing overrides it. */
export const DEFAULT_DATABASE_URL: string
export const E2E_DATABASE: string
export const POSTGRES_PORT: string
export const databaseUrl: string

/** Starts PostgreSQL if needed, migrates it, and empties the app tables. */
export function prepareDatabase(): void
