import { describe, expect, it } from 'vitest'
import { EnvValidationError, parseEnv, parseWebEnv } from './env'

const valid = {
  NODE_ENV: 'development',
  API_URL: 'http://localhost:3001',
  WEB_URL: 'http://localhost:3000',
  DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/vibe_poomat',
} satisfies Record<string, string>

describe('parseEnv', () => {
  it('parses a valid env into a frozen, typed object with the documented defaults', () => {
    const env = parseEnv(valid)

    expect(env.NODE_ENV).toBe('development')
    expect(env.LOG_LEVEL).toBe('info')
    expect(env.API_PORT).toBe(3001)
    expect(env.DATABASE_POOL_MAX).toBe(10)
    expect(env.JOBS_ENABLED).toBe(true)
    expect(env.DATABASE_URL).toBe(valid.DATABASE_URL)
    expect(Object.isFrozen(env)).toBe(true)
  })

  it('coerces API_PORT from its string form', () => {
    expect(parseEnv({ ...valid, API_PORT: '4000' }).API_PORT).toBe(4000)
  })

  it('throws naming DATABASE_URL when it is missing', () => {
    const { DATABASE_URL: _omitted, ...withoutDatabaseUrl } = valid

    expect(() => parseEnv(withoutDatabaseUrl)).toThrow(EnvValidationError)
    expect(() => parseEnv(withoutDatabaseUrl)).toThrow(/DATABASE_URL/)
  })

  it('rejects a DATABASE_URL that is not a postgres connection URL', () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: 'mysql://localhost:3306/db' })).toThrow(
      /DATABASE_URL/,
    )
  })

  it('throws when API_PORT is not numeric', () => {
    expect(() => parseEnv({ ...valid, API_PORT: 'abc' })).toThrow(/API_PORT/)
  })

  it('reports every offending key in one throw rather than one at a time', () => {
    let caught: unknown
    try {
      parseEnv({ NODE_ENV: 'staging', API_URL: 'not-a-url', API_PORT: 'abc' })
    } catch (error) {
      caught = error
    }

    expect(caught).toBeInstanceOf(EnvValidationError)
    expect((caught as EnvValidationError).keys).toEqual([
      'API_PORT',
      'API_URL',
      'DATABASE_URL',
      'NODE_ENV',
      'WEB_URL',
    ])
  })

  it('never puts an env value into the error message', () => {
    const secret = 'super-secret-token-value'

    expect(() => parseEnv({ ...valid, DATABASE_URL: secret })).toThrow(
      expect.not.stringContaining(secret) as unknown as string,
    )
  })

  it('reads JOBS_ENABLED as a real boolean, so "false" means false', () => {
    expect(parseEnv({ ...valid, JOBS_ENABLED: 'false' }).JOBS_ENABLED).toBe(false)
    expect(parseEnv({ ...valid, JOBS_ENABLED: 'true' }).JOBS_ENABLED).toBe(true)
  })

  it('ignores unknown extra keys', () => {
    const env = parseEnv({ ...valid, TOTALLY_UNKNOWN: 'x' })

    expect('TOTALLY_UNKNOWN' in env).toBe(false)
  })
})

describe('parseWebEnv', () => {
  it('accepts an env that has no server-only keys', () => {
    const env = parseWebEnv({
      NODE_ENV: 'production',
      API_URL: 'https://api.example',
      WEB_URL: 'https://example',
    })

    expect(env).toEqual({
      NODE_ENV: 'production',
      LOG_LEVEL: 'info',
      API_URL: 'https://api.example',
      WEB_URL: 'https://example',
    })
  })

  it('still refuses a bad API_URL, since it is the same schema', () => {
    expect(() =>
      parseWebEnv({ NODE_ENV: 'production', API_URL: 'nope', WEB_URL: 'https://example' }),
    ).toThrow(/API_URL/)
  })
})
