import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC = 'auth:is-public'

/**
 * Opts a route out of the global session guard. The default is the safe one: a
 * new endpoint is protected until someone writes this on it and has to think
 * about why.
 *
 * The marker lives in `shared` while the guard that reads it lives in `auth`,
 * because a probe or a webhook in any context has to be able to say "not this
 * one" without importing another context (ARCH-10).
 */
export const Public = () => SetMetadata(IS_PUBLIC, true)
