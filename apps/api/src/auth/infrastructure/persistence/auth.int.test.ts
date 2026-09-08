import type { TestingModule } from '@nestjs/testing'
import { Test } from '@nestjs/testing'
import { sql } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ConfigModule } from '../../../shared/config/config.module'
import { DbModule } from '../../../shared/db/db.module'
import { DB, type Db } from '../../../shared/db/db.token'
import { EventsModule } from '../../../shared/events/events.module'
import { HealthModule } from '../../../shared/health/health.module'
import { EntityId } from '../../../shared/kernel'
import { AuthModule } from '../../auth.module'
import { Avatar } from '../../domain/avatar'
import { Bio } from '../../domain/bio'
import { ExternalLink } from '../../domain/external-link'
import { Handle } from '../../domain/handle'
import { IDENTITY_REPOSITORY, type IdentityRepository } from '../../domain/identity.repository'
import { ProviderIdentity } from '../../domain/provider-identity'
import { SESSION_TOUCH_INTERVAL_MS, Session } from '../../domain/session'
import { SESSION_REPOSITORY, type SessionRepository } from '../../domain/session.repository'
import { SESSION_ID_GENERATOR, type SessionIdGenerator } from '../../domain/session-id-generator'
import { User } from '../../domain/user'
import { USER_REPOSITORY, type UserRepository } from '../../domain/user.repository'

function handle(raw: string): Handle {
  return Handle.create(raw)._unsafeUnwrap()
}

function newUser(raw: string, displayName = 'Ada'): User {
  return User.create({ handle: handle(raw), displayName })._unsafeUnwrap()
}

function newIdentity(overrides: {
  userId: EntityId
  provider?: string
  providerUserId?: string
  email?: string
  emailVerified?: boolean
}): ProviderIdentity {
  return ProviderIdentity.create({
    provider: 'github',
    providerUserId: '4242',
    email: 'ada@example.com',
    emailVerified: true,
    ...overrides,
  })._unsafeUnwrap()
}

describe('the auth repositories, against a real PostgreSQL', () => {
  let moduleRef: TestingModule
  let users: UserRepository
  let identities: IdentityRepository
  let sessions: SessionRepository
  let sessionIds: SessionIdGenerator
  let db: Db

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [ConfigModule, HealthModule, EventsModule, DbModule, AuthModule],
    }).compile()
    await moduleRef.init()

    users = moduleRef.get<UserRepository>(USER_REPOSITORY)
    identities = moduleRef.get<IdentityRepository>(IDENTITY_REPOSITORY)
    sessions = moduleRef.get<SessionRepository>(SESSION_REPOSITORY)
    sessionIds = moduleRef.get<SessionIdGenerator>(SESSION_ID_GENERATOR)
    db = moduleRef.get<Db>(DB)
  })

  afterAll(async () => {
    await moduleRef.close()
  })

  describe('users', () => {
    it('round-trips a whole profile through the value objects', async () => {
      const ada = newUser('ada', 'Ada Lovelace')
      ada.updateProfile({
        avatar: Avatar.fromUrl('https://cdn.example.com/a.png')._unsafeUnwrap(),
        bio: Bio.create('builds things')._unsafeUnwrap(),
        link: ExternalLink.create('https://ada.test')._unsafeUnwrap(),
      })
      expect((await users.save(ada)).isOk()).toBe(true)

      const loaded = await users.findById(ada.id)

      expect(loaded?.handle.value).toBe('ada')
      expect(loaded?.displayName).toBe('Ada Lovelace')
      expect(loaded?.avatar?.value).toBe('https://cdn.example.com/a.png')
      expect(loaded?.bio?.value).toBe('builds things')
      expect(loaded?.link?.value).toBe('https://ada.test/')
    })

    it('answers findByHandle and nothing for a stranger', async () => {
      const ada = newUser('ada')
      await users.save(ada)

      expect((await users.findByHandle(handle('ada')))?.id.equals(ada.id)).toBe(true)
      expect(await users.findByHandle(handle('nobody'))).toBeNull()
      expect(await users.findById(EntityId.generate())).toBeNull()
    })

    it('updates in place rather than inserting a second row', async () => {
      const ada = newUser('ada')
      await users.save(ada)

      ada.changeHandle(handle('ada_l'))
      ada.rename('Ada L')
      expect((await users.save(ada)).isOk()).toBe(true)

      const rows = await db.execute<{ count: string }>(sql`select count(*)::text from users`)
      expect(rows.rows[0]?.count).toBe('1')
      expect((await users.findByHandle(handle('ada_l')))?.displayName).toBe('Ada L')
      // AUTH-6: the old handle is free the moment this commits
      expect(await users.findByHandle(handle('ada'))).toBeNull()
    })

    it('refuses a handle another account already holds, whatever its case', async () => {
      // inserted around the value object on purpose: only a raw row can carry the
      // capital that proves the column, not the caller, is what settles the case
      await db.execute(sql`
        insert into users (id, handle, display_name, created_at, updated_at)
        values (${EntityId.generate().value}, 'Ada', 'Ada', now(), now())
      `)

      const impostor = await users.save(newUser('ada'))

      expect(impostor._unsafeUnwrapErr().code).toBe('AUTH_HANDLE_TAKEN')
    })
  })

  describe('generateAvailableHandle', () => {
    it('hands back the seed when nothing holds it', async () => {
      expect((await users.generateAvailableHandle('Ada-Lovelace')).value).toBe('adalovelace')
    })

    it('walks the numeric suffixes past whoever is already there (AUTH-6)', async () => {
      for (const taken of ['ada', 'ada2', 'ada3']) await users.save(newUser(taken))

      expect((await users.generateAvailableHandle('ada')).value).toBe('ada4')
    })

    it('never offers a reserved handle', async () => {
      expect((await users.generateAvailableHandle('admin')).value).toBe('admin2')
    })

    it('falls back past the batch when every candidate is taken', async () => {
      const candidates = ['ada', ...Array.from({ length: 31 }, (_, index) => `ada${index + 2}`)]
      for (const taken of candidates) await users.save(newUser(taken))

      const generated = await users.generateAvailableHandle('ada')

      expect(candidates).not.toContain(generated.value)
      expect(generated.value.startsWith('ada')).toBe(true)
    })
  })

  describe('identities', () => {
    it('finds a returning provider account', async () => {
      const ada = newUser('ada')
      await users.save(ada)
      const identity = newIdentity({ userId: ada.id })
      expect((await identities.save(identity)).isOk()).toBe(true)

      const found = await identities.findByProviderId('github', '4242')

      expect(found?.userId.equals(ada.id)).toBe(true)
      expect(await identities.findByProviderId('google', '4242')).toBeNull()
    })

    it('refuses the same provider account on a second row', async () => {
      const ada = newUser('ada')
      const bob = newUser('bob')
      await users.save(ada)
      await users.save(bob)
      await identities.save(newIdentity({ userId: ada.id }))

      const stolen = await identities.save(newIdentity({ userId: bob.id }))

      expect(stolen._unsafeUnwrapErr().code).toBe('AUTH_IDENTITY_ALREADY_LINKED')
    })

    it('matches a verified email, whatever case it is asked with (AUTH-5)', async () => {
      const ada = newUser('ada')
      await users.save(ada)
      await identities.save(newIdentity({ userId: ada.id, email: 'Ada@Example.com' }))

      expect((await identities.findByVerifiedEmail('ADA@example.com'))?.userId.equals(ada.id)).toBe(
        true,
      )
    })

    it('ignores an unverified row, so it can never attach to an account', async () => {
      const ada = newUser('ada')
      await users.save(ada)
      await identities.save(
        newIdentity({ userId: ada.id, email: 'ada@example.com', emailVerified: false }),
      )

      expect(await identities.findByVerifiedEmail('ada@example.com')).toBeNull()
    })
  })

  describe('sessions', () => {
    it('stores, reloads and deletes one', async () => {
      const ada = newUser('ada')
      await users.save(ada)
      const session = Session.start({ id: sessionIds.next(), userId: ada.id })
      await sessions.save(session)

      const loaded = await sessions.findById(session.id)
      expect(loaded?.userId.equals(ada.id)).toBe(true)
      expect(loaded?.expiresAt.getTime()).toBe(session.expiresAt.getTime())

      await sessions.delete(session.id)
      expect(await sessions.findById(session.id)).toBeNull()
    })

    it('slides the stored window when a touched session is saved again (AUTH-8)', async () => {
      const ada = newUser('ada')
      await users.save(ada)
      const session = Session.start({ id: sessionIds.next(), userId: ada.id })
      await sessions.save(session)

      const later = new Date(session.lastSeenAt.getTime() + SESSION_TOUCH_INTERVAL_MS)
      expect(session.touch(later)).toBe(true)
      await sessions.save(session)

      const loaded = await sessions.findById(session.id)
      expect(loaded?.lastSeenAt.getTime()).toBe(later.getTime())
      expect(loaded?.createdAt.getTime()).toBe(session.createdAt.getTime())

      const rows = await db.execute<{ count: string }>(sql`select count(*)::text from sessions`)
      expect(rows.rows[0]?.count).toBe('1')
    })
  })
})
