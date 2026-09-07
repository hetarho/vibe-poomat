import { z } from 'zod'

/**
 * The one env schema for the whole repo (ARCH-31). Later tasks extend this object
 * rather than declaring a second schema, so every key is validated in one place.
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  API_PORT: z.coerce.number().int().positive().max(65535).default(3001),
  API_URL: z.url(),
  WEB_URL: z.url(),
  DATABASE_URL: z
    .string()
    .min(1)
    .refine((value) => /^postgres(ql)?:\/\//.test(value), {
      message: 'must be a postgres:// or postgresql:// connection URL',
    }),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().max(100).default(10),
})

export type Env = Readonly<z.infer<typeof envSchema>>

/**
 * Thrown once, at boot, listing every offending key at the same time. Values are
 * never included in the message because env carries secrets.
 */
export class EnvValidationError extends Error {
  readonly keys: readonly string[]

  constructor(keys: readonly string[], reasons: readonly string[]) {
    super(
      `invalid environment (${keys.length} ${keys.length === 1 ? 'key' : 'keys'}): ${keys.join(', ')}\n${reasons
        .map((reason) => `  - ${reason}`)
        .join('\n')}`,
    )
    this.name = 'EnvValidationError'
    this.keys = keys
  }
}

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const parsed = envSchema.safeParse(raw)
  if (parsed.success) return Object.freeze(parsed.data)

  const byKey = new Map<string, string[]>()
  for (const issue of parsed.error.issues) {
    const key = issue.path.length > 0 ? issue.path.join('.') : '(root)'
    const messages = byKey.get(key)
    if (messages === undefined) byKey.set(key, [issue.message])
    else messages.push(issue.message)
  }

  const keys = [...byKey.keys()].sort()
  const reasons = keys.map((key) => `${key}: ${(byKey.get(key) ?? []).join('; ')}`)
  throw new EnvValidationError(keys, reasons)
}
