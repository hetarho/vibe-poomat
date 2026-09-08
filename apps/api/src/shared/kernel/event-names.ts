/**
 * Names of the domain events that cross a context boundary. They live in the
 * kernel because both ends need them and neither may import the other: a
 * subscriber in one context would otherwise have to reach into the aggregate of
 * another just to learn a string (ARCH-10).
 *
 * An event nobody outside its own context listens to keeps its name at home.
 */
export const CROSS_CONTEXT_EVENTS = {
  /** Signup happened (AUTH-2). The aggregate id is the account id. */
  accountCreated: 'auth.account-created',
} as const
