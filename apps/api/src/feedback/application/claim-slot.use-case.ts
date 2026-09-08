import type { JobScheduler, MissionReader, TransactionManager } from '../../shared/application'
import { EntityId } from '../../shared/kernel'
import { err, ForbiddenError, ok, type Result } from '../../shared/result'
import type { ClaimRepository } from '../domain/claim.repository'
import {
  AlreadyClaimedError,
  ClaimNotFoundError,
  ClaimNotHeldError,
  MissionNotOpenError,
  NoSlotsAvailableError,
  OwnProjectError,
} from '../domain/claim-errors'
import { FeedbackClaim } from '../domain/feedback-claim'
import { type ClaimView, toClaimView } from './claim-view'

/** Puts a lapsed hold back where it belongs (FDBK-1). */
export const SLOT_RELEASE_JOB = 'slot.release'

export type SlotReleasePayload = { claimId: string }

/** Groups a claim's timers so rescheduling replaces rather than adds (ARCH-35). */
export function claimJobKey(claimId: string): string {
  return `claim:${claimId}`
}

export type ClaimSlotError =
  | MissionNotOpenError
  | OwnProjectError
  | AlreadyClaimedError
  | NoSlotsAvailableError
  | ClaimNotFoundError
  | ClaimNotHeldError
  | ForbiddenError

/**
 * FDBK-1 and FDBK-2 in one place: pressing Start holds a slot for a day, and
 * everything that could make that wrong is checked before the row exists.
 *
 * The number of takeable slots is derived — `mission.slots` minus the live
 * claims — and never cached, so it cannot drift from the rows it counts.
 */
export class ClaimSlotUseCase {
  constructor(
    private readonly claims: ClaimRepository,
    private readonly missions: MissionReader,
    private readonly jobs: JobScheduler,
    private readonly transactions: TransactionManager,
  ) {}

  /**
   * What this account holds on this mission, or nothing (FDBK-2 allows one). The
   * page needs it to decide between offering Start and showing the hold that is
   * already running — and to know the claim id a report is submitted against.
   */
  async mine(input: {
    missionId: string
    actorId: string
  }): Promise<Result<ClaimView | null, ClaimSlotError>> {
    const missionId = EntityId.parse(input.missionId)
    const actorId = EntityId.parse(input.actorId)
    // an id nobody could hold names no claim, which is the honest answer
    if (missionId.isErr()) return ok(null)
    if (actorId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const claim = await this.claims.findLiveFor(missionId.value, actorId.value)

    return ok(claim === null ? null : toClaimView(claim))
  }

  async claim(input: {
    missionId: string
    actorId: string
  }): Promise<Result<ClaimView, ClaimSlotError>> {
    const missionId = EntityId.parse(input.missionId)
    if (missionId.isErr()) return err(new MissionNotOpenError('no such mission'))

    const actorId = EntityId.parse(input.actorId)
    if (actorId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const mission = await this.missions.forClaim(missionId.value.value)
    if (mission === null || !mission.isOpen) {
      return err(new MissionNotOpenError('this mission is not taking feedback'))
    }

    // FDBK-2: a maker reviewing their own project would be measuring nothing
    if (mission.ownerId === actorId.value.value) {
      return err(new OwnProjectError('you cannot give feedback on your own project'))
    }

    return this.transactions.run(async () => {
      // taken before anything is counted, so two people pressing Start on the
      // last slot are serialised rather than both told it is free
      const occupancy = await this.claims.lockOccupancy(missionId.value)

      const live = await this.claims.findLiveFor(missionId.value, actorId.value)
      if (live !== null) {
        return err(new AlreadyClaimedError('you already have a slot on this mission'))
      }

      const taken = occupancy.held + occupancy.submitted + occupancy.settled
      if (taken >= mission.slots) {
        return err(new NoSlotsAvailableError('every slot on this mission is taken'))
      }

      const claim = FeedbackClaim.hold({ missionId: missionId.value, userId: actorId.value })
      await this.claims.save(claim)

      // enqueued inside the transaction, so a rollback leaves no timer behind
      await this.jobs.schedule(
        SLOT_RELEASE_JOB,
        { claimId: claim.id.value } satisfies SlotReleasePayload,
        claim.heldUntil,
        { singletonKey: claimJobKey(claim.id.value) },
      )

      return ok(toClaimView(claim))
    })
  }

  /** FDBK-1: the holder hands it back before submitting. */
  async release(input: {
    claimId: string
    actorId: string
  }): Promise<Result<void, ClaimSlotError>> {
    const claimId = EntityId.parse(input.claimId)
    if (claimId.isErr()) return err(new ClaimNotFoundError('no such claim'))

    const actorId = EntityId.parse(input.actorId)
    if (actorId.isErr()) return err(new ForbiddenError('not a signed-in account'))

    const claim = await this.claims.findById(claimId.value)
    if (claim === null) return err(new ClaimNotFoundError('no such claim'))
    if (!claim.isHeldBy(actorId.value)) {
      return err(new ForbiddenError('this slot is held by someone else'))
    }

    return this.transactions.run(async () => {
      const released = claim.release({ expired: false })
      if (released.isErr()) return err(released.error)
      if (!released.value) return ok(undefined)

      await this.claims.save(claim)
      await this.jobs.cancel(SLOT_RELEASE_JOB, claimJobKey(claim.id.value))

      return ok(undefined)
    })
  }

  /**
   * The release job's body. Idempotent, because pg-boss delivers at least once:
   * a claim that has been released, submitted or settled is left exactly as it
   * is rather than treated as a failure.
   */
  async releaseIfLapsed(claimId: string): Promise<Result<void, ClaimSlotError>> {
    const id = EntityId.parse(claimId)
    if (id.isErr()) return err(new ClaimNotFoundError('no such claim'))

    const claim = await this.claims.findById(id.value)
    if (claim === null) return err(new ClaimNotFoundError('no such claim'))
    if (!claim.hasLapsed()) return ok(undefined)

    return this.transactions.run(async () => {
      const released = claim.release({ expired: true })
      if (released.isErr()) return ok(undefined)
      if (!released.value) return ok(undefined)

      await this.claims.save(claim)

      return ok(undefined)
    })
  }
}
