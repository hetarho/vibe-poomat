import { parseWebEnv } from './env'

export type { WebEnv } from './env'
export { parseWebEnv, webEnvSchema } from './env'

/**
 * Validated at import time, exactly like the full env (ARCH-31). This entry
 * exists so a web server never has to hold the server-only keys.
 */
export const webEnv = parseWebEnv(process.env)
