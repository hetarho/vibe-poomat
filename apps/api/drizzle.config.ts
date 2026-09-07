import { env } from '@repo/config'
import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  dialect: 'postgresql',
  // one schema file per bounded context (ARCH-13); none exist until the AUTH context
  schema: './src/*/infrastructure/persistence/schema.ts',
  out: './drizzle',
  dbCredentials: { url: env.DATABASE_URL },
  strict: true,
  verbose: true,
})
