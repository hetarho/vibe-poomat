import 'reflect-metadata'

/**
 * `@repo/config` validates the environment at import time (ARCH-31), so the suite
 * needs a complete one in place before any module that imports it is loaded.
 */
const testEnv: Record<string, string> = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  API_PORT: '3001',
  API_URL: 'http://localhost:3001',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vibe_poomat_test',
  DATABASE_POOL_MAX: '10',
  JOBS_ENABLED: 'true',
  MAIL_DRIVER: 'console',
  MAIL_FROM: 'no-reply@vibe-poomat.test',
  MAIL_FROM_NAME: 'vibe poomat',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'vibe-poomat',
  S3_ACCESS_KEY_ID: 'minioadmin',
  S3_SECRET_ACCESS_KEY: 'minioadmin',
  S3_PUBLIC_BASE_URL: 'http://localhost:9000/vibe-poomat',
}

for (const [key, value] of Object.entries(testEnv)) {
  process.env[key] ??= value
}
