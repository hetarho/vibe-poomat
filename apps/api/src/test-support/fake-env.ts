import type { Env } from '../shared/config/env.token'

/** A complete, harmless env for tests that need one without touching the process env. */
export function fakeEnv(overrides: Partial<Env> = {}): Env {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_PORT: 3001,
    API_URL: 'http://localhost:3001',
    WEB_URL: 'http://localhost:3000',
    DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vibe_poomat_test',
    DATABASE_POOL_MAX: 10,
    JOBS_ENABLED: true,
    MAIL_DRIVER: 'console',
    MAIL_FROM: 'no-reply@vibe-poomat.test',
    MAIL_FROM_NAME: 'vibe poomat',
    NOTIFICATION_SECRET: 'a-test-notification-secret-long-enough',
    S3_ENDPOINT: 'http://localhost:9000',
    S3_BUCKET: 'vibe-poomat',
    S3_ACCESS_KEY_ID: 'minioadmin',
    S3_SECRET_ACCESS_KEY: 'minioadmin',
    S3_PUBLIC_BASE_URL: 'http://localhost:9000/vibe-poomat',
    ...overrides,
  }
}
