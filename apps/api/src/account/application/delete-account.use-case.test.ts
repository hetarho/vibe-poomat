import { beforeEach, describe, expect, it } from 'vitest'
import type {
  AccountErasure,
  CreditOperations,
  FeedbackPurge,
  ProjectPurge,
  UserSummary,
  UserSummaryReader,
} from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { type DomainError, err, ok, type Result, ValidationError } from '../../shared/result'
import { DELETION_STEPS, DeleteAccountUseCase } from './delete-account.use-case'

const USER = EntityId.generate().value

const SUMMARY: UserSummary = {
  id: USER,
  handle: 'ada',
  displayName: 'Ada',
  avatarUrl: null,
}

class RefusedError extends ValidationError {
  override readonly code = 'REFUSED'
}

/**
 * Records the order the ports were called in, which is the whole point of this
 * test: AUTH-9's sequence is a decision, not an implementation detail.
 */
class Journal {
  readonly calls: string[] = []
  /** The call that should fail, so the abort can be pinned per step. */
  failAt: string | null = null

  record<T>(name: string, value: T): Result<T, DomainError> {
    this.calls.push(name)
    if (this.failAt === name) return err(new RefusedError('this step said no'))

    return ok(value)
  }
}

function portsFor(journal: Journal): {
  users: UserSummaryReader
  projects: ProjectPurge
  feedback: FeedbackPurge
  credits: CreditOperations
  accounts: AccountErasure
} {
  return {
    users: {
      summaryFor: async (userId) => (userId === USER ? SUMMARY : null),
      summariesFor: async () => new Map(),
    },
    projects: {
      endMissionsOf: async () => journal.record('endMissionsOf', 2),
      removeProjectsOf: async () => journal.record('removeProjectsOf', undefined),
    },
    feedback: {
      releaseHoldsOf: async () => journal.record('releaseHoldsOf', undefined),
      settlePendingFor: async () => journal.record('settlePendingFor', 3),
      anonymise: async () => journal.record('anonymise', undefined),
    },
    credits: {
      escrowForMission: async () => ok(undefined),
      settleSlot: async () => ok(undefined),
      refundUnfilled: async () => ok(undefined),
      voidAccount: async () => journal.record('voidAccount', undefined),
    },
    accounts: {
      eraseAccount: async () => journal.record('eraseAccount', undefined),
    },
  }
}

describe('DeleteAccountUseCase (AUTH-9)', () => {
  let journal: Journal
  let useCase: DeleteAccountUseCase
  let committed: boolean

  beforeEach(() => {
    journal = new Journal()
    committed = false
    const ports = portsFor(journal)
    useCase = new DeleteAccountUseCase(
      ports.users,
      ports.projects,
      ports.feedback,
      ports.credits,
      ports.accounts,
      {
        // stands in for ARCH-38's one transaction: an errored Result rolls back,
        // which is what the real manager does
        run: async <T>(work: () => Promise<T>): Promise<T> => {
          const outcome = await work()
          committed = !(
            typeof outcome === 'object' &&
            outcome !== null &&
            'isErr' in outcome &&
            (outcome as { isErr(): boolean }).isErr()
          )

          return outcome
        },
      },
    )
  })

  function deleteAccount(confirm = 'ada') {
    return useCase.execute({ userId: USER, confirm })
  }

  describe('the order it runs in', () => {
    it('is exactly the sequence AUTH-9 describes', async () => {
      const report = (await deleteAccount())._unsafeUnwrap()

      expect(journal.calls).toEqual([
        'releaseHoldsOf',
        'endMissionsOf',
        'settlePendingFor',
        'removeProjectsOf',
        'anonymise',
        'voidAccount',
        'eraseAccount',
      ])
      expect(report.steps).toEqual([...DELETION_STEPS])
    })

    /**
     * The one ordering that is not a preference: settling after voiding would
     * take the credits of the people who did the work instead of paying them.
     */
    it('pays every pending feedback before it voids anything', async () => {
      await deleteAccount()

      expect(journal.calls.indexOf('settlePendingFor')).toBeLessThan(
        journal.calls.indexOf('voidAccount'),
      )
    })

    it('hands the held slots back before it touches anything else', async () => {
      await deleteAccount()

      expect(journal.calls[0]).toBe('releaseHoldsOf')
    })

    it('ends the missions before it settles what is pending on them', async () => {
      await deleteAccount()

      expect(journal.calls.indexOf('endMissionsOf')).toBeLessThan(
        journal.calls.indexOf('settlePendingFor'),
      )
    })

    it('erases the account last of all', async () => {
      await deleteAccount()

      expect(journal.calls.at(-1)).toBe('eraseAccount')
    })

    it('reports what it moved on the way through', async () => {
      const report = (await deleteAccount())._unsafeUnwrap()

      expect(report).toMatchObject({
        userId: USER,
        handle: 'ada',
        missionsEnded: 2,
        feedbackSettled: 3,
      })
    })
  })

  describe('the typed confirmation', () => {
    it('accepts the account’s own handle', async () => {
      expect((await deleteAccount('ada')).isOk()).toBe(true)
    })

    it('trims what was typed, because a trailing space is not a change of mind', async () => {
      expect((await deleteAccount('  ada  ')).isOk()).toBe(true)
    })

    it.each(['', 'bob', 'ADA', 'ad'])('refuses %j, and runs no step at all', async (confirm) => {
      const outcome = await deleteAccount(confirm)

      expect(outcome._unsafeUnwrapErr().code).toBe('DELETION_NOT_CONFIRMED')
      expect(journal.calls).toEqual([])
    })

    it('is not found for an account that is already gone', async () => {
      const outcome = await useCase.execute({ userId: EntityId.generate().value, confirm: 'ada' })

      expect(outcome._unsafeUnwrapErr().code).toBe('ACCOUNT_NOT_FOUND')
      expect(journal.calls).toEqual([])
    })
  })

  describe('when a step fails', () => {
    it.each([
      'releaseHoldsOf',
      'endMissionsOf',
      'settlePendingFor',
      'removeProjectsOf',
      'anonymise',
      'voidAccount',
      'eraseAccount',
    ])('stops at %s and lets the transaction roll the rest back', async (step) => {
      journal.failAt = step

      const outcome = await deleteAccount()

      expect(outcome._unsafeUnwrapErr().code).toBe('REFUSED')
      expect(journal.calls.at(-1)).toBe(step)
      expect(committed).toBe(false)
    })

    it('commits only when every step succeeded', async () => {
      await deleteAccount()

      expect(committed).toBe(true)
    })
  })
})
