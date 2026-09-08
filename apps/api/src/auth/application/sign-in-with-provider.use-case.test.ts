import { beforeEach, describe, expect, it } from 'vitest'
import { AccountCreated } from '../domain/account-created.event'
import { Handle } from '../domain/handle'
import { ProviderIdentity } from '../domain/provider-identity'
import { Session } from '../domain/session'
import { SessionId } from '../domain/session-id'
import { User } from '../domain/user'
import {
  InMemoryIdentityRepository,
  InMemorySessionRepository,
  InMemoryUserRepository,
  passthroughTransactions,
  StubSessionIdGenerator,
} from '../test-support/in-memory-repositories'
import type { ProviderProfile } from './oauth-provider'
import { SignInWithProviderUseCase } from './sign-in-with-provider.use-case'

function sessionId(seed: string): SessionId {
  return SessionId.parse(seed.repeat(43).slice(0, 43))._unsafeUnwrap()
}

const FIRST_SESSION = sessionId('a')
const SECOND_SESSION = sessionId('b')

function profile(overrides: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    provider: 'github',
    providerUserId: '4242',
    email: 'ada@example.com',
    emailVerified: true,
    displayName: 'Ada Lovelace',
    avatarUrl: 'https://cdn.example.com/ada.png',
    username: 'ada',
    ...overrides,
  }
}

describe('SignInWithProviderUseCase', () => {
  let users: InMemoryUserRepository
  let identities: InMemoryIdentityRepository
  let sessions: InMemorySessionRepository
  let useCase: SignInWithProviderUseCase

  beforeEach(() => {
    users = new InMemoryUserRepository()
    identities = new InMemoryIdentityRepository()
    sessions = new InMemorySessionRepository()
    useCase = new SignInWithProviderUseCase(
      users,
      identities,
      sessions,
      new StubSessionIdGenerator([FIRST_SESSION, SECOND_SESSION]),
      passthroughTransactions,
    )
  })

  function accountCreatedEvents(): AccountCreated[] {
    return users.events.filter((event): event is AccountCreated => event instanceof AccountCreated)
  }

  async function seedAccount(overrides: Partial<ProviderProfile> = {}): Promise<User> {
    const outcome = await useCase.execute({ profile: profile(overrides) })

    return outcome._unsafeUnwrap().user
  }

  describe('a provider account that has signed in before', () => {
    it('loads the account and creates nothing', async () => {
      const ada = await seedAccount()
      users.events.length = 0

      const outcome = await useCase.execute({ profile: profile() })

      expect(outcome._unsafeUnwrap().created).toBe(false)
      expect(outcome._unsafeUnwrap().user.id.equals(ada.id)).toBe(true)
      expect(users.rows.size).toBe(1)
      expect(identities.rows).toHaveLength(1)
      expect(accountCreatedEvents()).toHaveLength(0)
    })
  })

  describe('a new provider whose verified email already reaches an account (AUTH-5)', () => {
    it('attaches an identity instead of starting a second account', async () => {
      const ada = await seedAccount()
      users.events.length = 0

      const outcome = await useCase.execute({
        profile: profile({ provider: 'google', providerUserId: 'google-1', username: 'ada' }),
      })

      expect(outcome._unsafeUnwrap().created).toBe(false)
      expect(outcome._unsafeUnwrap().user.id.equals(ada.id)).toBe(true)
      expect(users.rows.size).toBe(1)
      expect(identities.rows.map((row) => row.provider).sort()).toEqual(['github', 'google'])
      expect(accountCreatedEvents()).toHaveLength(0)
    })

    it('matches whatever case the second provider sent the address in', async () => {
      const ada = await seedAccount()

      const outcome = await useCase.execute({
        profile: profile({
          provider: 'google',
          providerUserId: 'google-1',
          email: 'ADA@Example.com',
        }),
      })

      expect(outcome._unsafeUnwrap().user.id.equals(ada.id)).toBe(true)
      expect(users.rows.size).toBe(1)
    })
  })

  describe('an unverified provider email', () => {
    it('never links, and starts its own account (AUTH-5)', async () => {
      const ada = await seedAccount()
      users.events.length = 0

      const outcome = await useCase.execute({
        profile: profile({
          provider: 'google',
          providerUserId: 'google-1',
          emailVerified: false,
        }),
      })

      expect(outcome._unsafeUnwrap().created).toBe(true)
      expect(outcome._unsafeUnwrap().user.id.equals(ada.id)).toBe(false)
      expect(users.rows.size).toBe(2)
      expect(accountCreatedEvents()).toHaveLength(1)
    })

    it('does not become linkable to a later verified sign-in either', async () => {
      await useCase.execute({ profile: profile({ emailVerified: false }) })

      const outcome = await useCase.execute({
        profile: profile({ provider: 'google', providerUserId: 'google-1' }),
      })

      expect(outcome._unsafeUnwrap().created).toBe(true)
      expect(users.rows.size).toBe(2)
    })
  })

  describe('a person nobody has seen before (AUTH-2)', () => {
    it('creates the account, the identity and exactly one AccountCreated', async () => {
      const outcome = await useCase.execute({ profile: profile() })
      const { user, created } = outcome._unsafeUnwrap()

      expect(created).toBe(true)
      expect(user.displayName).toBe('Ada Lovelace')
      expect(user.avatar?.value).toBe('https://cdn.example.com/ada.png')
      expect(user.handle.value).toBe('ada')
      expect(identities.rows).toHaveLength(1)
      expect(identities.rows[0]?.email).toBe('ada@example.com')

      const events = accountCreatedEvents()
      expect(events).toHaveLength(1)
      expect(events[0]?.userId.equals(user.id)).toBe(true)
      expect(events[0]?.handle).toBe('ada')
    })

    it('walks the handle past whoever holds the provider username (AUTH-6)', async () => {
      const taken = User.create({
        handle: Handle.create('ada')._unsafeUnwrap(),
        displayName: 'Someone else',
      })._unsafeUnwrap()
      await users.save(taken)
      users.events.length = 0

      const outcome = await useCase.execute({ profile: profile() })

      expect(outcome._unsafeUnwrap().user.handle.value).toBe('ada2')
    })

    it('falls back to the handle when the provider display name is unusable', async () => {
      const outcome = await useCase.execute({
        profile: profile({ displayName: '   ', avatarUrl: 'not a url' }),
      })
      // the unusable avatar is dropped rather than refused: a picture is never
      // worth turning a signup away over
      const { user } = outcome._unsafeUnwrap()

      expect(user.displayName).toBe('ada')
      expect(user.avatar).toBeNull()
      expect(accountCreatedEvents()).toHaveLength(1)
    })
  })

  describe('the session it issues', () => {
    it('starts a 30-day one for the account that signed in', async () => {
      const outcome = await useCase.execute({ profile: profile() })
      const { user, session } = outcome._unsafeUnwrap()

      expect(session.id.equals(FIRST_SESSION)).toBe(true)
      expect(session.userId.equals(user.id)).toBe(true)
      expect(await sessions.findById(FIRST_SESSION)).not.toBeNull()
    })

    it('rotates the one the browser arrived with', async () => {
      await useCase.execute({ profile: profile() })

      const outcome = await useCase.execute({
        profile: profile(),
        previousSessionId: FIRST_SESSION,
      })

      expect(outcome._unsafeUnwrap().session.id.equals(SECOND_SESSION)).toBe(true)
      expect(await sessions.findById(FIRST_SESSION)).toBeNull()
      expect(await sessions.findById(SECOND_SESSION)).not.toBeNull()
    })

    it('issues one even when the browser brought no session', async () => {
      const outcome = await useCase.execute({ profile: profile(), previousSessionId: null })

      expect(outcome._unsafeUnwrap().session.id.equals(FIRST_SESSION)).toBe(true)
    })
  })

  describe('when the account behind an identity has gone', () => {
    it('reports not found rather than resurrecting one', async () => {
      const orphan = ProviderIdentity.create({
        userId: Session.start({ id: FIRST_SESSION, userId: (await seedAccount()).id }).userId,
        provider: 'github',
        providerUserId: 'orphan',
        email: 'gone@example.com',
        emailVerified: true,
      })._unsafeUnwrap()
      await identities.save(orphan)
      users.rows.clear()

      const outcome = await useCase.execute({
        profile: profile({ providerUserId: 'orphan', email: 'gone@example.com' }),
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('NOT_FOUND')
    })
  })
})
