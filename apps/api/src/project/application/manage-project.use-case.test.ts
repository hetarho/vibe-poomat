import { beforeEach, describe, expect, it } from 'vitest'
import { EntityId } from '../../shared/kernel'
import {
  FAKE_PUBLIC_BASE,
  InMemoryProjectRepository,
  passthroughTransactions,
  StubActiveMissions,
  StubFileStorage,
  StubHttpProbe,
  StubUserSummaries,
} from '../test-support/project-doubles'
import { ManageProjectUseCase } from './manage-project.use-case'

const OWNER = EntityId.generate().value
const STRANGER = EntityId.generate().value
const COVER = 'project-cover/01920000-0000-7000-8000-000000000001.png'

describe('ManageProjectUseCase', () => {
  let projects: InMemoryProjectRepository
  let missions: StubActiveMissions
  let probe: StubHttpProbe
  let users: StubUserSummaries
  let useCase: ManageProjectUseCase

  beforeEach(() => {
    projects = new InMemoryProjectRepository()
    missions = new StubActiveMissions()
    probe = new StubHttpProbe()
    users = new StubUserSummaries()
    users.add({ id: OWNER, handle: 'ada', displayName: 'Ada', avatarUrl: null })
    useCase = new ManageProjectUseCase(
      projects,
      missions,
      probe,
      users,
      new StubFileStorage(),
      passthroughTransactions,
    )
  })

  function create(overrides: Record<string, unknown> = {}) {
    return useCase.create({
      ownerId: OWNER,
      title: 'Poomat',
      liveUrl: 'https://poomat.test',
      pitch: 'Trade real feedback',
      tags: ['SaaS'],
      ...overrides,
    })
  }

  describe('create (PROJ-12)', () => {
    it('posts it publicly at once, with the owner attached', async () => {
      const view = (await create())._unsafeUnwrap()

      expect(view.title).toBe('Poomat')
      expect(view.owner.handle).toBe('ada')
      expect(view.deletedAt).toBeNull()
      expect(view.upvoteCount).toBe(0)
      expect(view.activeMission).toBeNull()
      expect(projects.rows.size).toBe(1)
    })

    it('resolves a cover key to a public URL', async () => {
      const view = (await create({ coverKey: COVER }))._unsafeUnwrap()

      expect(view.coverUrl).toBe(`${FAKE_PUBLIC_BASE}/${COVER}`)
    })

    it('verifies the live url exactly once (PROJ-2)', async () => {
      await create()

      expect(probe.probed).toEqual(['https://poomat.test/'])
    })

    it('writes nothing when the url cannot be reached, and says what happened', async () => {
      probe.refuseNext()

      const outcome = await create()

      expect(outcome._unsafeUnwrapErr().code).toBe('PROJECT_URL_UNREACHABLE')
      expect(outcome._unsafeUnwrapErr().details).toMatchObject({ status: 503 })
      expect(projects.rows.size).toBe(0)
    })

    it.each([
      ['title', { title: '' }, 'PROJECT_TITLE_NOT_ALLOWED'],
      ['pitch', { pitch: 'x'.repeat(201) }, 'PROJECT_PITCH_NOT_ALLOWED'],
      ['tags', { tags: ['Crypto'] }, 'PROJECT_TAGS_NOT_ALLOWED'],
      ['tag count', { tags: ['SaaS', 'AI', 'Tool', 'Game'] }, 'PROJECT_TAGS_NOT_ALLOWED'],
      ['live url', { liveUrl: 'http://poomat.test' }, 'PROJECT_URL_NOT_ALLOWED'],
      [
        'cover',
        { coverKey: 'avatar/01920000-0000-7000-8000-000000000001.png' },
        'PROJECT_COVER_NOT_ALLOWED',
      ],
    ])('refuses a bad %s before probing anything', async (_field, patch, code) => {
      const outcome = await create(patch)

      expect(outcome._unsafeUnwrapErr().code).toBe(code)
      expect(probe.probed).toEqual([])
      expect(projects.rows.size).toBe(0)
    })
  })

  describe('update', () => {
    let projectId: string

    beforeEach(async () => {
      projectId = (await create())._unsafeUnwrap().id
      probe.probed.length = 0
    })

    it('applies what PROJ-7 leaves editable, even with a mission open', async () => {
      missions.open()

      const view = (
        await useCase.update({
          projectId,
          actorId: OWNER,
          pitch: 'Now with more feedback',
          tags: ['AI', 'Tool'],
        })
      )._unsafeUnwrap()

      expect(view.pitch).toBe('Now with more feedback')
      expect(view.tags).toEqual(['AI', 'Tool'])
      expect(view.activeMission).not.toBeNull()
    })

    it('refuses a stranger', async () => {
      const outcome = await useCase.update({ projectId, actorId: STRANGER, pitch: 'Mine now' })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
    })

    it('is not found for a project that does not exist', async () => {
      const outcome = await useCase.update({
        projectId: EntityId.generate().value,
        actorId: OWNER,
        pitch: 'x',
      })

      expect(outcome._unsafeUnwrapErr().code).toBe('PROJECT_NOT_FOUND')
    })

    describe('the live url (PROJ-7)', () => {
      it('re-verifies it when it changes and nothing is running', async () => {
        const view = (
          await useCase.update({ projectId, actorId: OWNER, liveUrl: 'https://poomat.test/v2' })
        )._unsafeUnwrap()

        expect(view.liveUrl).toBe('https://poomat.test/v2')
        expect(probe.probed).toEqual(['https://poomat.test/v2'])
      })

      it('probes nothing when the url is sent back unchanged', async () => {
        await useCase.update({ projectId, actorId: OWNER, liveUrl: 'https://poomat.test' })

        expect(probe.probed).toEqual([])
      })

      it('refuses the change while a mission is open, and probes nothing', async () => {
        missions.open()

        const outcome = await useCase.update({
          projectId,
          actorId: OWNER,
          liveUrl: 'https://poomat.test/v2',
        })

        expect(outcome._unsafeUnwrapErr().code).toBe('PROJECT_LOCKED_BY_MISSION')
        expect(probe.probed).toEqual([])
      })

      it('leaves the url alone when the new one cannot be reached', async () => {
        probe.refuseNext()

        const outcome = await useCase.update({
          projectId,
          actorId: OWNER,
          liveUrl: 'https://gone.test',
        })

        expect(outcome._unsafeUnwrapErr().code).toBe('PROJECT_URL_UNREACHABLE')
        expect(projects.rows.get(projectId)?.liveUrl.value).toBe('https://poomat.test/')
      })
    })
  })

  describe('delete (PROJ-8)', () => {
    let projectId: string

    beforeEach(async () => {
      projectId = (await create())._unsafeUnwrap().id
    })

    it('hides it rather than removing it', async () => {
      expect((await useCase.delete({ projectId, actorId: OWNER })).isOk()).toBe(true)

      expect(projects.rows.get(projectId)?.isDeleted()).toBe(true)
    })

    it('refuses while a mission is open', async () => {
      missions.open()

      const outcome = await useCase.delete({ projectId, actorId: OWNER })

      expect(outcome._unsafeUnwrapErr().code).toBe('PROJECT_LOCKED_BY_MISSION')
      expect(projects.rows.get(projectId)?.isDeleted()).toBe(false)
    })

    it('refuses a stranger', async () => {
      const outcome = await useCase.delete({ projectId, actorId: STRANGER })

      expect(outcome._unsafeUnwrapErr().code).toBe('FORBIDDEN')
      expect(projects.rows.get(projectId)?.isDeleted()).toBe(false)
    })

    it('is idempotent, so a repeated delete is not an error', async () => {
      await useCase.delete({ projectId, actorId: OWNER })

      expect((await useCase.delete({ projectId, actorId: OWNER })).isOk()).toBe(true)
    })
  })
})
