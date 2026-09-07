import type { Env } from '@repo/config'

/**
 * Application code injects the validated env through this token instead of
 * importing `@repo/config`'s singleton, so a test can substitute a fake (ARCH-11).
 */
export const ENV = Symbol('ENV')

export type { Env }
