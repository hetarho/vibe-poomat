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
  // lets a future instance serve requests without also running the workers
  JOBS_ENABLED: z.stringbool().default(true),
  MAIL_DRIVER: z.enum(['resend', 'console']).default('console'),
  RESEND_API_KEY: z.string().min(1).optional(),
  MAIL_FROM: z.email().default('no-reply@vibe-poomat.local'),
  MAIL_FROM_NAME: z.string().min(1).default('vibe poomat'),
  /**
   * Signs the per-type unsubscribe links (NOTI-4). Rotating it invalidates
   * every link already in somebody's inbox, which is acceptable: the worst
   * outcome is one more click through the settings page.
   */
  NOTIFICATION_SECRET: z.string().min(32).default('development-notification-secret-not-for-prod'),
  S3_ENDPOINT: z.url().default('http://localhost:9000'),
  S3_BUCKET: z.string().min(1).default('vibe-poomat'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('minioadmin'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('minioadmin'),
  S3_PUBLIC_BASE_URL: z.url().default('http://localhost:9000/vibe-poomat'),
  // OAuth is the only way in (AUTH-1). Optional so a checkout boots without four
  // provider apps registered; production is held to all of them below.
  GITHUB_CLIENT_ID: z.string().min(1).optional(),
  GITHUB_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  // where the provider sends the browser back; defaults to the api's own origin,
  // and is separate because the registered redirect URI must match exactly
  OAUTH_REDIRECT_BASE_URL: z.url().optional(),
})

/** The Resend driver is useless without a key, so the pair is validated together. */
const withMailDriverKey = <TSchema extends z.ZodObject>(schema: TSchema) =>
  schema.check((ctx) => {
    const value = ctx.value as { MAIL_DRIVER?: string; RESEND_API_KEY?: string }
    if (value.MAIL_DRIVER === 'resend' && value.RESEND_API_KEY === undefined) {
      ctx.issues.push({
        code: 'custom',
        input: value.RESEND_API_KEY,
        path: ['RESEND_API_KEY'],
        message: 'is required when MAIL_DRIVER is resend',
      })
    }
  })

/** Sign-in is the only door into the product, so production may not be missing one. */
const OAUTH_KEYS = [
  'GITHUB_CLIENT_ID',
  'GITHUB_CLIENT_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
] as const

const withOAuthCredentials = <TSchema extends z.ZodObject>(schema: TSchema) =>
  schema.check((ctx) => {
    const value = ctx.value as Record<string, string | undefined>
    if (value.NODE_ENV !== 'production') return

    for (const key of OAUTH_KEYS) {
      if (value[key] === undefined) {
        ctx.issues.push({
          code: 'custom',
          input: value[key],
          path: [key],
          message: 'is required in production, because OAuth is the only way to sign in',
        })
      }
    }
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

/**
 * The one place env parsing happens. Takes the schema so a narrower entry point
 * (see `web.ts`) can validate its own pick with identical error reporting.
 */
export function parseEnvWith<TSchema extends z.ZodObject>(
  schema: TSchema,
  raw: Record<string, string | undefined>,
): Readonly<z.infer<TSchema>> {
  const parsed = schema.safeParse(raw)
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

export function parseEnv(raw: Record<string, string | undefined>): Env {
  return parseEnvWith(withOAuthCredentials(withMailDriverKey(envSchema)), raw)
}

/**
 * The subset a browser-facing server may hold. Picked from the schema above
 * rather than declared again, so a key can never drift between the two.
 */
export const webEnvSchema = envSchema.pick({
  NODE_ENV: true,
  LOG_LEVEL: true,
  API_URL: true,
  WEB_URL: true,
})

export type WebEnv = Readonly<z.infer<typeof webEnvSchema>>

export function parseWebEnv(raw: Record<string, string | undefined>): WebEnv {
  return parseEnvWith(webEnvSchema, raw)
}
