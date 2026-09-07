import { parseEnv } from './env'

export type { Env } from './env'
export { EnvValidationError, envSchema, parseEnv, parseEnvWith } from './env'

/**
 * Validated at import time on purpose (ARCH-31): a bad env kills the process at
 * boot instead of surfacing at the first use. `packages/config` is the only place
 * in the repo allowed to read `process.env`.
 */
export const env = parseEnv(process.env)
