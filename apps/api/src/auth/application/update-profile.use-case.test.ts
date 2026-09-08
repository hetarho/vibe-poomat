import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DELETE_OBJECT_JOB, type JobScheduler } from '../../shared/application'
import { Avatar } from '../domain/avatar'
import { Handle } from '../domain/handle'
import { User } from '../domain/user'
import { FakeCreditSummaryReader } from '../test-support/fake-credit-summary'
import { FAKE_PUBLIC_BASE, FakeFileStorage } from '../test-support/fake-file-storage'
import { FakeMakerStatsReader } from '../test-support/fake-maker-stats'
import {
  InMemoryUserRepository,
  passthroughTransactions,
} from '../test-support/in-memory-repositories'
import { ChangeHandleUseCase, UpdateProfileUseCase } from './update-profile.use-case'

const KEY = 'avatar/01920000-0000-7000-8000-000000000001.png'
const OTHER_KEY = 'avatar/01920000-0000-7000-8000-000000000002.png'
const PROVIDER_AVATAR = 'https://cdn.example.com/from-github.png'

function handle(raw: string): Handle {
  return Handle.create(raw)._unsafeUnwrap()
}

describe('UpdateProfileUseCase', () => {
  let users: InMemoryUserRepository
  let storage: FakeFileStorage
  let jobs: JobScheduler
  let enqueue: ReturnType<typeof vi.fn>
  let useCase: UpdateProfileUseCase
  let ada: User

  beforeEach(async () => {
    users = new InMemoryUserRepository()
    storage = new FakeFileStorage()
    enqueue = vi.fn(async () => undefined)
    jobs = {
      enqueue: enqueue as unknown as JobScheduler['enqueue'],
      schedule: async () => undefined,
      cancel: async () => undefined,
    }
    useCase = new UpdateProfileUseCase(
      users,
      storage,
      new FakeCreditSummaryReader(),
      new FakeMakerStatsReader(),
      jobs,
      passthroughTransactions,
    )

    ada = User.create({
      handle: handle('ada'),
      displayName: 'Ada Lovelace',
      avatar: Avatar.fromUrl(PROVIDER_AVATAR)._unsafeUnwrap(),
    })._unsafeUnwrap()
    await users.save(ada)
  })

  it('touches only the fields it was given', async () => {
    const view = (
      await useCase.execute({ userId: ada.id.value, bio: 'builds things' })
    )._unsafeUnwrap()

    expect(view.bio).toBe('builds things')
    expect(view.displayName).toBe('Ada Lovelace')
    expect(view.link).toBeNull()
    expect(view.avatarUrl).toBe(PROVIDER_AVATAR)
  })

  it('clears a field passed as null', async () => {
    await useCase.execute({ userId: ada.id.value, bio: 'builds things' })

    const view = (await useCase.execute({ userId: ada.id.value, bio: null }))._unsafeUnwrap()

    expect(view.bio).toBeNull()
  })

  it('carries the credit counters the ledger reports (CRED-7)', async () => {
    const credits = new FakeCreditSummaryReader()
    credits.set(ada.id.value, { balance: 2, received: 3, given: 1 })
    useCase = new UpdateProfileUseCase(
      users,
      storage,
      credits,
      new FakeMakerStatsReader(),
      jobs,
      passthroughTransactions,
    )

    const view = (await useCase.execute({ userId: ada.id.value }))._unsafeUnwrap()

    expect(view.credits).toEqual({ balance: 2, received: 3, given: 1 })
  })

  it.each([
    ['bio', { bio: 'x'.repeat(161) }, 'AUTH_BIO_NOT_ALLOWED'],
    ['link', { link: 'http://example.com' }, 'AUTH_LINK_NOT_ALLOWED'],
    ['avatarKey', { avatarKey: 'https://evil.test/a.png' }, 'AUTH_AVATAR_NOT_ALLOWED'],
    ['displayName', { displayName: ' ' }, 'AUTH_DISPLAY_NAME_NOT_ALLOWED'],
  ])('refuses a bad %s with a code naming the field', async (_field, patch, code) => {
    const outcome = await useCase.execute({ userId: ada.id.value, ...patch })

    expect(outcome._unsafeUnwrapErr().code).toBe(code)
  })

  it('writes nothing when one field is rejected', async () => {
    await useCase.execute({
      userId: ada.id.value,
      displayName: 'Ada L',
      link: 'http://example.com',
    })

    expect((await users.findById(ada.id))?.displayName).toBe('Ada Lovelace')
  })

  it('is not found for an id nobody holds', async () => {
    const outcome = await useCase.execute({ userId: '01920000-0000-7000-8000-0000000000ff' })

    expect(outcome._unsafeUnwrapErr().code).toBe('AUTH_USER_NOT_FOUND')
  })

  it('is not found for something that is not an id at all', async () => {
    expect((await useCase.execute({ userId: 'nope' }))._unsafeUnwrapErr().code).toBe(
      'AUTH_USER_NOT_FOUND',
    )
  })

  describe('the avatar', () => {
    it('resolves an uploaded key to a public URL', async () => {
      const view = (await useCase.execute({ userId: ada.id.value, avatarKey: KEY }))._unsafeUnwrap()

      expect(view.avatarUrl).toBe(`${FAKE_PUBLIC_BASE}/${KEY}`)
    })

    it('never enqueues a delete for the provider URL it replaced', async () => {
      await useCase.execute({ userId: ada.id.value, avatarKey: KEY })

      expect(enqueue).not.toHaveBeenCalled()
    })

    it('enqueues the previous object exactly once when it is replaced', async () => {
      await useCase.execute({ userId: ada.id.value, avatarKey: KEY })

      await useCase.execute({ userId: ada.id.value, avatarKey: OTHER_KEY })

      expect(enqueue).toHaveBeenCalledExactlyOnceWith(DELETE_OBJECT_JOB, { key: KEY })
    })

    it('enqueues it when the avatar is cleared instead of replaced', async () => {
      await useCase.execute({ userId: ada.id.value, avatarKey: KEY })

      await useCase.execute({ userId: ada.id.value, avatarKey: null })

      expect(enqueue).toHaveBeenCalledExactlyOnceWith(DELETE_OBJECT_JOB, { key: KEY })
    })

    it('enqueues nothing when the same key is sent twice', async () => {
      await useCase.execute({ userId: ada.id.value, avatarKey: KEY })

      await useCase.execute({ userId: ada.id.value, avatarKey: KEY })

      expect(enqueue).not.toHaveBeenCalled()
    })
  })
})

describe('ChangeHandleUseCase', () => {
  let users: InMemoryUserRepository
  let useCase: ChangeHandleUseCase
  let ada: User

  beforeEach(async () => {
    users = new InMemoryUserRepository()
    useCase = new ChangeHandleUseCase(
      users,
      new FakeFileStorage(),
      new FakeCreditSummaryReader(),
      new FakeMakerStatsReader(),
      passthroughTransactions,
    )
    ada = User.create({ handle: handle('ada'), displayName: 'Ada' })._unsafeUnwrap()
    await users.save(ada)
  })

  it('takes the new handle and frees the old one at once (AUTH-6)', async () => {
    const view = (await useCase.execute({ userId: ada.id.value, handle: 'ada_l' }))._unsafeUnwrap()

    expect(view.handle).toBe('ada_l')
    expect(await users.findByHandle(handle('ada'))).toBeNull()
  })

  it('refuses one another account already holds', async () => {
    await users.save(User.create({ handle: handle('bob'), displayName: 'Bob' })._unsafeUnwrap())

    const outcome = await useCase.execute({ userId: ada.id.value, handle: 'bob' })

    expect(outcome._unsafeUnwrapErr().code).toBe('AUTH_HANDLE_TAKEN')
    expect((await users.findById(ada.id))?.handle.value).toBe('ada')
    expect((await users.findByHandle(handle('bob')))?.displayName).toBe('Bob')
  })

  it.each(['ab', 'settings', 'Ada Lovelace'])(
    'refuses %j before touching the database',
    async (raw) => {
      const outcome = await useCase.execute({ userId: ada.id.value, handle: raw })

      expect(outcome._unsafeUnwrapErr().code).toBe('AUTH_HANDLE_NOT_ALLOWED')
    },
  )
})
